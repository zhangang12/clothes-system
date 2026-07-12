#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 一键部署（每次发版只跑这一条）
# 用法：bash infra/scripts/deploy.sh [--skip-pull] [--skip-backup]
#
# 一条命令完成：拉码(main) → 构建四包 → 【自动备份 + 幂等升级数据库结构】
#              → 保证 MySQL/Redis 就绪 → 重启 API → 健康检查 → reload nginx
# 关键：数据库结构升级(hotfix-schema.sql，幂等)在 API 重启【之前】自动执行，
#       无需再区分"有没有动 schema"，也不会再出现发版后 Unknown column。
# 失败即打印回滚命令（保留发版前 commit）。
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
WEB_ROOT=/var/www/web
PORTAL_ROOT=/var/www/portal
SERVICE=i9-api
MYSQL_CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
REDIS_CONTAINER=${REDIS_CONTAINER:-i9_redis}
HOTFIX_SQL="$APP_DIR/infra/scripts/hotfix-schema.sql"
LOG_FILE=/var/log/i9/deploy.log

SKIP_PULL=false; SKIP_BACKUP=false
for a in "$@"; do
  case "$a" in
    --skip-pull)   SKIP_PULL=true ;;
    --skip-backup) SKIP_BACKUP=true ;;
    *) echo "未知参数：$a（可用 --skip-pull / --skip-backup）"; exit 2 ;;
  esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PREV_COMMIT=""
log()  { echo -e "${GREEN}[DEPLOY $(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*" | tee -a "$LOG_FILE"; }
die()  {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
  [[ -n "$PREV_COMMIT" ]] && echo -e "${YELLOW}如需回滚上一版：bash $APP_DIR/infra/scripts/rollback.sh $PREV_COMMIT${NC}" | tee -a "$LOG_FILE"
  exit 1
}

[[ -f "$ENV_FILE" ]] || die "环境变量文件不存在：$ENV_FILE"
mkdir -p /var/log/i9
echo "" >> "$LOG_FILE"
log "===== 开始一键部署 ====="
cd "$APP_DIR"
PREV_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "")

# ── ① 拉取最新代码（GitHub 国内网络不稳，失败自动重试）──────────
if ! $SKIP_PULL; then
  log "拉取最新代码 (origin/main)..."
  n=0
  until git fetch origin main; do
    n=$((n + 1))
    [[ $n -ge 4 ]] && die "git fetch 失败（网络问题），已重试 ${n} 次。手动 git fetch 成功后可 bash $0 --skip-pull"
    warn "git fetch 失败（${n}/4），$((n * 3))s 后重试..."
    sleep $((n * 3))
  done
  git reset --hard origin/main
fi

# ── ② 安装依赖 + 构建（types 必须先于 api）────────────────────
log "安装依赖（frozen）..."
pnpm install --frozen-lockfile --prefer-offline 2>&1 | tail -5
log "构建类型包..."; pnpm --filter @i9/types build
log "构建 API...";   pnpm --filter @i9/api build
log "构建管理后台..."; pnpm --filter @i9/web build
log "构建供应商门户..."; NODE_ENV=production pnpm --filter @i9/portal build

# ── ③ 数据库结构：自动备份 + 幂等升级（在 API 重启之前！）──────
# hotfix-schema.sql 幂等：已存在的表/列自动跳过，没动 schema 时是无害 no-op。
mysql_up() { docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; }
if command -v docker &>/dev/null && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${MYSQL_CONTAINER}$"; then
  if ! mysql_up; then
    log "MySQL 容器未运行，尝试启动..."
    docker start "$MYSQL_CONTAINER" >/dev/null 2>&1 || true
    for i in $(seq 1 12); do mysql_up && break; sleep 3; done
  fi
  mysql_up || die "MySQL 容器 $MYSQL_CONTAINER 无响应，已中止（未改动数据库）"

  # 读取数据库凭据
  # shellcheck source=/dev/null
  source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
  DB_NAME=${DB_NAME:-i9_clothes}
  [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] || die "MYSQL_ROOT_PASSWORD 未在 $ENV_FILE 设置"
  MYSQL="docker exec -i $MYSQL_CONTAINER mysql -uroot -p${MYSQL_ROOT_PASSWORD}"

  # 升级前备份（可 --skip-backup 跳过）
  if $SKIP_BACKUP; then
    warn "已跳过升级前备份（--skip-backup）"
  else
    log "升级前整库备份..."
    if [[ -x "$APP_DIR/infra/scripts/backup.sh" ]]; then
      bash "$APP_DIR/infra/scripts/backup.sh" >/dev/null || die "备份失败，已中止（未改动数据库）"
    else
      TS=$(date '+%Y%m%d_%H%M%S'); mkdir -p /data/backups
      docker exec "$MYSQL_CONTAINER" mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" \
        --single-transaction --quick --routines --triggers "$DB_NAME" \
        | gzip -9 > "/data/backups/${DB_NAME}_predeploy_${TS}.sql.gz" || die "备份失败，已中止"
    fi
  fi

  if [[ -f "$HOTFIX_SQL" ]]; then
    log "应用数据库结构升级（幂等 hotfix-schema.sql）..."
    $MYSQL "$DB_NAME" < "$HOTFIX_SQL" >/dev/null 2>&1 || die "结构升级 SQL 执行失败（数据已备份，可排查后重跑）"
    # 抽检关键列（缺失即中止，避免带病重启 API）；用 set +e 包裹，避免查询本身失败触发 set -e 静默退出
    set +e
    MISS=$($MYSQL -N -B "$DB_NAME" 2>/dev/null <<SQL
SELECT GROUP_CONCAT(x SEPARATOR ', ') FROM (
  SELECT 'contract.revised' x WHERE NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract' AND COLUMN_NAME='revised')
  UNION ALL SELECT 'settlement_cost.tax_rate' WHERE NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='settlement_cost' AND COLUMN_NAME='tax_rate')
  UNION ALL SELECT 'table:contract_shipment' WHERE NOT EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_shipment')
) t;
SQL
)
    set -e
    [[ -z "${MISS//NULL/}" || "$MISS" == "NULL" ]] || die "结构升级后关键列仍缺失：$MISS"
    log "数据库结构已就位 ✓"
  else
    warn "未找到 $HOTFIX_SQL，跳过结构升级（请确认库结构与代码一致）"
  fi
else
  warn "未发现 $MYSQL_CONTAINER 容器（如用外部数据库），跳过自动结构升级——请自行确保库结构已升级到位"
fi

# ── ④ 静态文件 + 权限 ─────────────────────────────────────────
log "修正文件权限..."
chown -R i9app:i9app "$APP_DIR/packages/api/dist" 2>/dev/null || true
log "更新静态文件..."
rsync -a --delete packages/web/dist/    "$WEB_ROOT/"
rsync -a --delete packages/portal/dist/ "$PORTAL_ROOT/"
# 发版后立即重生成「定时作业监控」静态页（rsync --delete 会清掉它，须重建避免短暂 404）
bash "$APP_DIR/infra/scripts/gen-ops-page.sh" 2>/dev/null || warn "监控静态页重生成失败（不影响发版）"

# ── ⑤ 保证 Redis 就绪（单号生成依赖，停机会导致新建单据失败）────
if command -v docker &>/dev/null && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${REDIS_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${REDIS_CONTAINER}$"; then
    log "Redis 容器未运行，尝试启动..."
    docker start "$REDIS_CONTAINER" >/dev/null 2>&1 || warn "启动 $REDIS_CONTAINER 失败，请手动检查（新建单据会受影响）"
  fi
fi

# ── ⑥ 重启 API（服务不存在时先注册）──────────────────────────
log "重启 API 服务..."
if ! systemctl is-enabled "$SERVICE" &>/dev/null; then
  cp "$APP_DIR/infra/systemd/i9-api.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable "$SERVICE"
fi
systemctl restart "$SERVICE"

# ── ⑦ 健康检查（/api/v1 正常 404，证明已在路由；不用 curl -f）──
log "等待服务就绪..."
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1 2>/dev/null || echo 000)
  [[ "$CODE" =~ ^[234] ]] && { log "API 已就绪 ✓ (HTTP $CODE)"; break; }
  [[ $i -eq 15 ]] && die "服务启动超时（最后 HTTP $CODE），查 journalctl -u $SERVICE"
  sleep 2
done
# 重启后残留结构报错自检
RESID=$(journalctl -u "$SERVICE" --since "40 sec ago" 2>/dev/null | grep -icE "Unknown column|ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE|doesn't exist" || true)
[[ "${RESID:-0}" -eq 0 ]] || warn "重启后检测到 ${RESID} 条结构报错，请把报错列名发我扩充 hotfix-schema.sql"

# ── ⑧ Nginx reload（未运行不阻断部署）────────────────────────
if systemctl is-active --quiet nginx; then
  nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || warn "nginx reload 失败"
else
  warn "nginx 未运行，跳过 reload"
fi

COMMIT=$(git rev-parse --short HEAD)
log "===== 部署成功  commit=${COMMIT} (上一版 ${PREV_COMMIT:-?}) ====="
log "建议随手体检：bash $APP_DIR/infra/scripts/health.sh"
