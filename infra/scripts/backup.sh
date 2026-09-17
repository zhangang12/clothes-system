#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 数据库 + 上传文件备份脚本
#
# 用法：
#   bash backup.sh            每日例行备份（crontab 每天 03:00）：数据库 + 上传文件整包，并清理过期备份
#   bash backup.sh --db-only  只备份数据库，不打附件包、不清理任何旧备份（deploy.sh 升级前调用）
#
# 保留策略（2026-09-17 老板要求「改备份脚本，防止再涨回去」）：
#   - 数据库备份保留 RETAIN_DAYS 天（默认 30）：一份才几百 K，出事时最有用
#   - 上传文件整包保留 UPLOADS_RETAIN_DAYS 天（默认 7）：每份是 /data/uploads 的完整副本（9 月已 255M/份），
#     附件基本只增不减，最新一份就含几乎全部文件；原来也留 30 天，再加上每次发版多打一份，
#     一个月攒到 63 份 11G，占掉整块盘的四分之一
#   - 发版只备份数据库：升级只动库结构，不动附件；发版前打附件包是纯重复
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
BACKUP_DIR=${BACKUP_DIR:-/data/backups}
RETAIN_DAYS=${RETAIN_DAYS:-30}
UPLOADS_RETAIN_DAYS=${UPLOADS_RETAIN_DAYS:-7}
DB_NAME=i9_clothes

DB_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --db-only) DB_ONLY=true ;;
    *) echo "未知参数：$arg（可用：--db-only）"; exit 2 ;;
  esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${GREEN}[BACKUP $(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"; }
die() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ "$RETAIN_DAYS" =~ ^[0-9]+$ && "$RETAIN_DAYS" -ge 1 ]] || die "RETAIN_DAYS 必须是正整数：$RETAIN_DAYS"
[[ "$UPLOADS_RETAIN_DAYS" =~ ^[0-9]+$ && "$UPLOADS_RETAIN_DAYS" -ge 1 ]] || die "UPLOADS_RETAIN_DAYS 必须是正整数：$UPLOADS_RETAIN_DAYS"

# ── 读取环境变量 ──────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || die "环境变量文件不存在：$ENV_FILE"
# shellcheck source=/dev/null
source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-}
[[ -n "$MYSQL_ROOT_PASSWORD" ]] || die "MYSQL_ROOT_PASSWORD 未设置"

mkdir -p "$BACKUP_DIR"

# ── 数据库备份 ────────────────────────────────────────────────
TS=$(date '+%Y%m%d_%H%M%S')
DUMP_FILE="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"

log "开始备份 $DB_NAME → $DUMP_FILE"
docker exec i9_mysql \
  mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction --quick --lock-tables=false \
  --routines --triggers \
  "$DB_NAME" \
  | gzip -9 > "$DUMP_FILE"
# 空文件 = mysqldump 实际失败（管道里 gzip 成功会掩盖）；没有这道检查，下面的清理会在一份坏备份之后删旧的好备份
[[ $(gzip -dc "$DUMP_FILE" | head -c 1024 | wc -c) -gt 0 ]] || { rm -f "$DUMP_FILE"; die "数据库备份为空，已中止（未清理任何旧备份）"; }
log "数据库备份完成  大小=$(du -sh "$DUMP_FILE" | cut -f1)  文件=${DUMP_FILE}"

if $DB_ONLY; then
  log "--db-only：不打附件包、不清理旧备份"
  exit 0
fi

# ── 上传文件整包（发票/水单/合同附件等）──────────────────────
UPLOADS_DIR=${UPLOADS_DIR:-/data/uploads}
UP_OK=false
if [[ -d "$UPLOADS_DIR" ]]; then
  UP_FILE="$BACKUP_DIR/uploads_${TS}.tar.gz"
  tar -czf "$UP_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  UP_OK=true
  log "上传文件备份完成  大小=$(du -sh "$UP_FILE" | cut -f1)  文件=${UP_FILE}"
else
  log "上传目录不存在（$UPLOADS_DIR），跳过附件备份"
fi

# ── 清理过期备份（只在本次备份成功之后）──────────────────────
# 只认脚本自己生成的文件名格式；手工快照（如 contract_before_*.sql.gz）不在清理范围内
DB_DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" -mtime +"$RETAIN_DAYS" -print -delete | wc -l)
[[ $DB_DELETED -gt 0 ]] && log "已删除 ${DB_DELETED} 个超过 ${RETAIN_DAYS} 天的数据库备份"
if $UP_OK; then
  # 本次附件包打成功了才删旧的，保证任何时候至少留着一份
  UP_DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "uploads_*.tar.gz" -mtime +"$UPLOADS_RETAIN_DAYS" -print -delete | wc -l)
  [[ $UP_DELETED -gt 0 ]] && log "已删除 ${UP_DELETED} 个超过 ${UPLOADS_RETAIN_DAYS} 天的附件包"
fi

# ── 汇总 ──────────────────────────────────────────────────────
DB_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.sql.gz" | wc -l)
UP_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name "uploads_*.tar.gz" | wc -l)
log "当前保留：数据库备份 ${DB_COUNT} 份（${RETAIN_DAYS} 天），附件包 ${UP_COUNT} 份（${UPLOADS_RETAIN_DAYS} 天），备份目录共 $(du -sh "$BACKUP_DIR" | cut -f1)"
log "提醒：备份仍在本机（实例挂了陪葬）；异地备份需配 OSS/rclone 后加推送步骤（CLAUDE.md 运维 P0）"
exit 0
