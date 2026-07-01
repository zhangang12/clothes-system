#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 版本回滚脚本
# 用法：bash rollback.sh              （列出最近 10 次提交供选择）
#        bash rollback.sh <commit>     （直接回滚到指定 commit/tag）
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
SERVICE=i9-api

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ROLLBACK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

cd "$APP_DIR"

# ── 选择目标版本 ──────────────────────────────────────────────
if [[ -n "${1:-}" ]]; then
  TARGET="$1"
else
  echo ""
  echo "最近 10 次提交："
  git log --oneline -10
  echo ""
  read -rp "请输入要回滚到的 commit hash 或 tag（留空取消）: " TARGET
  [[ -z "$TARGET" ]] && { warn "已取消回滚"; exit 0; }
fi

# ── 确认 ──────────────────────────────────────────────────────
CURRENT=$(git rev-parse --short HEAD)
TARGET_FULL=$(git rev-parse --short "$TARGET" 2>/dev/null) || die "无效的 commit: $TARGET"
echo ""
warn "即将回滚: ${CURRENT} → ${TARGET_FULL}"
warn "这将重新构建并重启服务，当前运行中的会话不受影响但 API 会短暂中断。"
read -rp "确认回滚？[y/N] " CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || { warn "已取消"; exit 0; }

# ── 执行回滚 ──────────────────────────────────────────────────
log "切换到 $TARGET_FULL ..."
git checkout "$TARGET"

log "重新部署..."
bash "$APP_DIR/infra/scripts/deploy.sh" --skip-pull

log "回滚完成  current=$(git rev-parse --short HEAD)"
