import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({
  connectionString: config.db.url,
  max: 10,
  idleTimeoutMillis: 30_000,
});

// 优雅关闭
process.on("SIGTERM", async () => {
  await pool.end();
});

/**
 * 在事务中执行,自动 commit / rollback
 */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
