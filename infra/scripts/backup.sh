#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 数据库备份脚本
# 推荐：crontab -e   →   0 2 * * * bash /opt/i9/clothes-system/infra/scripts/backup.sh
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
BACKUP_DIR=/data/backups
RETAIN_DAYS=${RETAIN_DAYS:-30}
DB_NAME=i9_clothes

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${GREEN}[BACKUP $(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"; }
die() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 读取环境变量 ──────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || die "环境变量文件不存在：$ENV_FILE"
# shellcheck source=/dev/null
source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-}
[[ -n "$MYSQL_ROOT_PASSWORD" ]] || die "MYSQL_ROOT_PASSWORD 未设置"

mkdir -p "$BACKUP_DIR"

# ── 执行备份 ──────────────────────────────────────────────────
TS=$(date '+%Y%m%d_%H%M%S')
DUMP_FILE="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"

log "开始备份 $DB_NAME → $DUMP_FILE"
docker exec i9_mysql \
  mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction --quick --lock-tables=false \
  --routines --triggers \
  "$DB_NAME" \
  | gzip -9 > "$DUMP_FILE"

SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "备份完成  大小=${SIZE}  文件=${DUMP_FILE}"

# ── 清理旧备份 ────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETAIN_DAYS" -print -delete | wc -l)
[[ $DELETED -gt 0 ]] && log "已删除 ${DELETED} 个超过 ${RETAIN_DAYS} 天的旧备份"

# ── 列出当前备份 ──────────────────────────────────────────────
COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" | wc -l)
log "当前共保留 ${COUNT} 个备份"
