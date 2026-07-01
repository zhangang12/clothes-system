#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 首次服务器初始化脚本
# 适用：CentOS 8+ / Ubuntu 22.04  单台 ECS  root 用户执行
# 用法：bash setup.sh
# =============================================================================
set -euo pipefail

APP_DIR=/opt/i9/clothes-system
APP_USER=i9app
REPO_URL=${REPO_URL:-https://github.com/zhangang12/clothes-system.git}
BRANCH=${BRANCH:-main}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && die "请以 root 身份运行此脚本"

# ── 检测发行版 ────────────────────────────────────────────────
if command -v apt-get &>/dev/null; then PKG=apt; else PKG=yum; fi

# ── 系统依赖 ──────────────────────────────────────────────────
log "安装系统依赖..."
if [[ $PKG == apt ]]; then
  apt-get update -qq
  apt-get install -y -qq curl git nginx docker.io docker-compose openssl
else
  yum install -y -q curl git nginx docker docker-compose openssl
fi

# ── Node.js 20 ────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -e "process.exit(+process.version.slice(1).split('.')[0]<20?1:0)"; echo $?) != 0 ]]; then
  log "安装 Node.js 20..."
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null || \
  curl -fsSL https://deb.nodesource.com/setup_20.x  | bash - 2>/dev/null
  $PKG install -y -q nodejs
fi

# ── pnpm ──────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  log "安装 pnpm..."
  npm install -g pnpm@9 --quiet
fi

# ── 应用用户 ──────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  log "创建应用用户 $APP_USER..."
  useradd -r -s /sbin/nologin -d /opt/i9 "$APP_USER"
fi

# ── 目录结构 ──────────────────────────────────────────────────
log "创建目录结构..."
mkdir -p /opt/i9 /data/uploads /data/backups /var/log/i9 /var/www/web /var/www/portal
chown -R "$APP_USER":"$APP_USER" /opt/i9 /data /var/log/i9 /var/www/web /var/www/portal

# ── 克隆代码 ──────────────────────────────────────────────────
if [[ ! -d "$APP_DIR/.git" ]]; then
  log "克隆仓库到 $APP_DIR ..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
else
  warn "代码目录已存在，跳过克隆"
fi

# ── 生产环境变量 ──────────────────────────────────────────────
ENV_FILE="$APP_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  log "创建生产环境变量文件..."
  DB_PASS=$(openssl rand -hex 16)
  REDIS_PASS=$(openssl rand -hex 16)
  JWT_SECRET=$(openssl rand -hex 32)
  MYSQL_ROOT_PASS=$(openssl rand -hex 16)

  cat > "$ENV_FILE" <<EOF
# ===== 数据库 =====
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=i9_clothes
DB_USER=i9user
DB_PASS=${DB_PASS}

# ===== Redis =====
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASS=${REDIS_PASS}

# ===== JWT =====
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES=8h

# ===== 文件存储 =====
UPLOAD_ROOT=/data/uploads
PORT=3000
NODE_ENV=production

# ===== CORS（填写实际域名）=====
WEB_ORIGIN=https://your-domain.com
PORTAL_ORIGIN=https://your-domain.com

# ===== Docker 数据库（docker-compose 读取）=====
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASS}
MYSQL_USER=i9user
MYSQL_PASSWORD=${DB_PASS}
REDIS_PASSWORD=${REDIS_PASS}
EOF
  chmod 600 "$ENV_FILE"
  chown "$APP_USER":"$APP_USER" "$ENV_FILE"
  warn "已生成随机密钥 → $ENV_FILE"
  warn "请在启动前修改 WEB_ORIGIN / PORTAL_ORIGIN 为实际域名！"
else
  warn "环境变量文件已存在，跳过生成"
fi

# ── Docker / 数据库 ───────────────────────────────────────────
log "启动 MySQL 和 Redis..."
systemctl enable --now docker
cp "$APP_DIR/infra/docker-compose.yml" /opt/i9/docker-compose.yml
docker-compose -f /opt/i9/docker-compose.yml --env-file "$ENV_FILE" up -d
log "等待数据库就绪（最长 60s）..."
for i in $(seq 1 12); do
  docker exec i9_mysql mysqladmin ping -h localhost --silent 2>/dev/null && break
  sleep 5
done

# ── Nginx ─────────────────────────────────────────────────────
log "配置 Nginx..."
cp "$APP_DIR/infra/nginx.conf" /etc/nginx/conf.d/i9.conf
nginx -t && systemctl enable --now nginx

# ── systemd 服务 ──────────────────────────────────────────────
log "注册 systemd 服务..."
cp "$APP_DIR/infra/systemd/i9-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable i9-api

# ── 首次构建和部署 ────────────────────────────────────────────
log "执行首次构建和部署..."
bash "$APP_DIR/infra/scripts/deploy.sh"

log "================================================"
log "  初始化完成！"
log "  • 请编辑 $ENV_FILE 填写正式域名"
log "  • 配置 SSL 证书后启用 nginx HTTPS 块"
log "  • 设置定时备份: crontab -e"
log "    0 2 * * * bash $APP_DIR/infra/scripts/backup.sh"
log "================================================"
