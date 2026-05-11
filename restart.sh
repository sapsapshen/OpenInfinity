#!/usr/bin/env bash
# 一键重启 OpenInfinity 全部服务（PostgreSQL + 后端 + 前端）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$ROOT_DIR/run-local.sh"

# 解析参数
TAIL_LOGS=false
for arg in "$@"; do
  case "$arg" in
    --logs|-l) TAIL_LOGS=true ;;
    --help|-h)
      printf 'Usage: bash restart.sh [--logs]\n'
      printf '  --logs / -l   重启后实时跟踪三端日志（Ctrl+C 退出跟踪，服务继续运行）\n'
      exit 0
      ;;
  esac
done

printf '\n==============================\n'
printf '  OpenInfinity 一键重启\n'
printf '==============================\n'

bash "$SCRIPT" stop
bash "$SCRIPT" start

if "$TAIL_LOGS"; then
  LOG_DIR="$ROOT_DIR/.local/logs"
  printf '\n==> 跟踪日志（Ctrl+C 退出跟踪，服务继续运行）\n\n'
  tail -f \
    "$LOG_DIR/postgres.log" \
    "$LOG_DIR/backend.log" \
    "$LOG_DIR/web.log"
fi
