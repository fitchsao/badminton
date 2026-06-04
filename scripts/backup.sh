#!/usr/bin/env bash
# 羽毛球应用 DB 备份脚本
# 用法: 部署后加到 crontab,每天凌晨执行
#   0 3 * * * /opt/badminton/scripts/backup.sh >> /var/log/badminton-backup.log 2>&1

set -e

BACKUP_DIR="${BACKUP_DIR:-/opt/badminton/backups}"
DAYS_KEEP="${DAYS_KEEP:-30}"
TS=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# 走 docker compose 容器内备份
cd "$(dirname "$0")/.."

# 从 .env 读 Postgres 凭据(不暴露给日志)
set -a
[ -f .env ] && source .env
set +a

POSTGRES_USER="${POSTGRES_USER:-badminton}"
POSTGRES_DB="${POSTGRES_DB:-badminton}"

# 备份
OUT="$BACKUP_DIR/db-$TS.sql.gz"
echo "[$(date)] 开始备份 → $OUT"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$OUT"

# 清理超期
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +$DAYS_KEEP -delete

echo "[$(date)] 完成,当前备份:"
ls -lh "$BACKUP_DIR"/db-*.sql.gz | tail -5
