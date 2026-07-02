#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 部署脚本（每次发版执行）
# 用法：bash infra/scripts/deploy.sh [--skip-pull]
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
WEB_ROOT=/var/www/web
PORTAL_ROOT=/var/www/portal
SERVICE=i9-api
LOG_FILE=/var/log/i9/deploy.log

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[DEPLOY $(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*" | tee -a "$LOG_FILE"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"; exit 1; }

[[ -f "$ENV_FILE" ]] || die "环境变量文件不存在：$ENV_FILE"
mkdir -p /var/log/i9
echo "" >> "$LOG_FILE"
log "===== 开始部署 ====="

cd "$APP_DIR"

# ── 拉取最新代码 ──────────────────────────────────────────────
if [[ "${1:-}" != "--skip-pull" ]]; then
  log "拉取最新代码..."
  git fetch origin main
  git reset --hard origin/main
fi

# ── 安装依赖 ──────────────────────────────────────────────────
log "安装依赖（frozen）..."
pnpm install --frozen-lockfile --prefer-offline 2>&1 | tail -5

# ── 构建（types 必须先于 api）────────────────────────────────
log "构建类型包..."
pnpm --filter @i9/types build

log "构建 API..."
pnpm --filter @i9/api build

log "构建管理后台..."
pnpm --filter @i9/web build

log "构建供应商门户..."
NODE_ENV=production pnpm --filter @i9/portal build

# ── 修正文件权限（build 由 root 运行，服务以 i9app 启动）────
log "修正文件权限..."
chown -R i9app:i9app "$APP_DIR/packages/api/dist"

# ── 复制静态文件 ──────────────────────────────────────────────
log "更新静态文件..."
rsync -a --delete packages/web/dist/     "$WEB_ROOT/"
rsync -a --delete packages/portal/dist/  "$PORTAL_ROOT/"

# ── 重启 API 服务（服务不存在时先注册）──────────────────────
log "重启 API 服务..."
if ! systemctl is-enabled "$SERVICE" &>/dev/null; then
  cp "$APP_DIR/infra/systemd/i9-api.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable "$SERVICE"
fi
systemctl restart "$SERVICE"

# ── 健康检查 ──────────────────────────────────────────────────
log "等待服务就绪..."
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3000/api/v1 >/dev/null 2>&1; then
    log "API 已就绪 ✓"
    break
  fi
  if [[ $i -eq 15 ]]; then
    die "服务启动超时，请检查 journalctl -u $SERVICE"
  fi
  sleep 2
done

# ── 刷新 Nginx 静态缓存 ───────────────────────────────────────
nginx -s reload

COMMIT=$(git rev-parse --short HEAD)
log "===== 部署成功  commit=${COMMIT} ====="
