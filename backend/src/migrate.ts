import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

/**
 * 在启动时按文件名顺序应用 migrations/*.sql,跟踪已应用的(防重复执行)
 * 既支持新部署(老 001 经 docker-entrypoint-initdb.d 跑过),也支持已部署系统加新 migration
 */
export async function runMigrations(
  logger: { info: Function; error: Function },
): Promise<void> {
  // 建 tracking 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = resolveMigrationsDir();
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 文件名按字典序就是顺序

  for (const f of files) {
    // 这里有个特殊处理:001 可能已经通过 docker-entrypoint 跑过但没记在 schema_migrations
    //   因此把首次跑时已存在的表当作"已应用"
    const applied = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`, [f],
    );
    if ((applied.rowCount ?? 0) > 0) continue;

    // 对 001 init.sql 做兜底:如果 sessions 表已经存在(老库),就只记录不执行
    if (f === "001_init.sql") {
      const exists = await pool.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='sessions'`,
      );
      if ((exists.rowCount ?? 0) > 0) {
        await pool.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`, [f],
        );
        logger.info({ file: f }, "迁移已存在,跳过执行,标记为已应用");
        continue;
      }
    }

    const sql = await readFile(path.join(dir, f), "utf8");
    logger.info({ file: f }, "应用迁移");
    try {
      await pool.query(sql);
      await pool.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`, [f],
      );
      logger.info({ file: f }, "迁移成功");
    } catch (err) {
      logger.error({ err, file: f }, "迁移失败");
      throw err;
    }
  }
}

function resolveMigrationsDir(): string {
  // dist/migrate.js 运行时:从 dist 回到项目根再进 migrations
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../migrations");
}
