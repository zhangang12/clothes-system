#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 日志查看快捷脚本
# 用法：bash logs.sh [api|mysql|redis|nginx|deploy|all]  默认: api
# =============================================================================
TARGET=${1:-api}

case "$TARGET" in
  api)
    echo "=== API 服务日志 (Ctrl-C 退出) ==="
    journalctl -u i9-api -f --no-pager
    ;;
  mysql)
    echo "=== MySQL 日志 (Ctrl-C 退出) ==="
    docker logs i9_mysql -f --tail 100
    ;;
  redis)
    echo "=== Redis 日志 (Ctrl-C 退出) ==="
    docker logs i9_redis -f --tail 100
    ;;
  nginx)
    echo "=== Nginx 访问日志 ==="
    tail -f /var/log/nginx/access.log /var/log/nginx/error.log
    ;;
  deploy)
    echo "=== 部署历史日志 ==="
    cat /var/log/i9/deploy.log
    ;;
  all)
    echo "=== 最近 API 日志 ==="
    journalctl -u i9-api --no-pager -n 50
    echo ""
    echo "=== 最近 Nginx 错误 ==="
    tail -20 /var/log/nginx/error.log 2>/dev/null || echo "(无)"
    echo ""
    echo "=== Docker 容器状态 ==="
    docker ps --filter "name=i9_"
    ;;
  *)
    echo "用法: $0 [api|mysql|redis|nginx|deploy|all]"
    exit 1
    ;;
esac
