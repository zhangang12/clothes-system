#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 健康检查脚本
# 用法：bash health.sh          （输出报告）
#        bash health.sh --json   （JSON 格式，适合监控接入）
# 返回值：0=全部正常  1=存在异常
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}

JSON_MODE=false
[[ "${1:-}" == "--json" ]] && JSON_MODE=true

OK=0; FAIL=1
results=()

check() {
  local name=$1 status=$2 detail=${3:-}
  if $JSON_MODE; then
    results+=("{\"name\":\"$name\",\"ok\":$( [[ $status == $OK ]] && echo true || echo false ),\"detail\":\"$detail\"}")
  else
    if [[ $status == $OK ]]; then
      echo -e "  \033[0;32m✓\033[0m  $name${detail:+  ($detail)}"
    else
      echo -e "  \033[0;31m✗\033[0m  $name${detail:+  ($detail)}"
    fi
  fi
}

overall=$OK

# ── nginx ─────────────────────────────────────────────────────
if curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null | grep -qE '^[23]'; then
  check "nginx" $OK "port 80 responding"
else
  check "nginx" $FAIL "port 80 not responding"; overall=$FAIL
fi

# ── API ───────────────────────────────────────────────────────
# 不用 -f：/api/v1 无根路由，正常返回 404，恰好证明服务在路由（-f 会让 curl 非零退出，
# 触发 || echo 000 拼成 "404000"）。接受 2xx/3xx/4xx 视为存活。
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/v1 2>/dev/null || echo "000")
if [[ "$API_STATUS" =~ ^[234] ]]; then
  check "api" $OK "HTTP $API_STATUS"
else
  check "api" $FAIL "HTTP $API_STATUS (is i9-api running?)"; overall=$FAIL
fi

# ── MySQL ─────────────────────────────────────────────────────
if docker exec i9_mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
  check "mysql" $OK "container healthy"
else
  check "mysql" $FAIL "container not responding"; overall=$FAIL
fi

# ── Redis ─────────────────────────────────────────────────────
# 区分「没起」/「密码不一致」/「无响应」；兼容 Docker 容器 与 本机原生 redis 两种部署
source <(grep -E '^(REDIS_PASSWORD|REDIS_PORT)=' "$ENV_FILE" 2>/dev/null || echo "REDIS_PASSWORD=")
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^i9_redis$'; then
  # 容器部署：--no-auth-warning 抑制 -a 告警，PONG 走 stdout
  RPING=$(docker exec i9_redis redis-cli -a "${REDIS_PASSWORD:-}" --no-auth-warning ping 2>/dev/null || true)
elif command -v redis-cli &>/dev/null; then
  # 原生部署：直连本机 127.0.0.1
  RPING=$(redis-cli -h 127.0.0.1 -p "${REDIS_PORT:-6379}" -a "${REDIS_PASSWORD:-}" --no-auth-warning ping 2>/dev/null || true)
else
  RPING=""
fi
if [[ "$RPING" == "PONG" ]]; then
  check "redis" $OK "PONG"
elif [[ "$RPING" == *WRONGPASS* || "$RPING" == *NOAUTH* ]]; then
  check "redis" $FAIL "认证失败：REDIS_PASSWORD 与运行中的 redis 不一致"; overall=$FAIL
else
  check "redis" $FAIL "未运行/无响应（容器未起 且 本机无 redis）"; overall=$FAIL
fi

# ── 磁盘 ──────────────────────────────────────────────────────
DISK_PCT=$(df /data 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); print $5}' || echo 0)
if [[ $DISK_PCT -lt 85 ]]; then
  check "disk(/data)" $OK "${DISK_PCT}% used"
else
  check "disk(/data)" $FAIL "${DISK_PCT}% used — 磁盘即将满"; overall=$FAIL
fi

# ── 内存 ──────────────────────────────────────────────────────
MEM_FREE_MB=$(free -m | awk '/^Mem:/{print $7}')
if [[ $MEM_FREE_MB -gt 200 ]]; then
  check "memory" $OK "${MEM_FREE_MB}MB available"
else
  check "memory" $FAIL "${MEM_FREE_MB}MB available — 内存不足"; overall=$FAIL
fi

# ── 输出 ──────────────────────────────────────────────────────
if $JSON_MODE; then
  IFS=, ; echo "{\"ok\":$( [[ $overall == $OK ]] && echo true || echo false ),\"checks\":[${results[*]}]}"
else
  echo ""
  if [[ $overall == $OK ]]; then
    echo -e "\033[0;32m所有组件正常\033[0m"
  else
    echo -e "\033[0;31m存在异常，请检查以上标红项\033[0m"
  fi
fi

exit $overall
