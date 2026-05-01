#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-start}"

STATE_DIR="$ROOT_DIR/.local"
LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR/pids"
POSTGRES_DIR="$STATE_DIR/postgres"
PGDATA_DIR="$POSTGRES_DIR/data"

POSTGRES_LOG="$LOG_DIR/postgres.log"
BACKEND_LOG="$LOG_DIR/backend.log"
WEB_LOG="$LOG_DIR/web.log"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
WEB_PID_FILE="$PID_DIR/web.pid"

PGPORT="${PGPORT:-55432}"
BACKEND_PORT="${BACKEND_PORT:-8787}"
WEB_PORT="${WEB_PORT:-3000}"
POSTGRES_DB="${POSTGRES_DB:-openflipbook}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_URL="postgres://${POSTGRES_USER}@${POSTGRES_HOST}:${PGPORT}/${POSTGRES_DB}"
BACKEND_PYTHON="${BACKEND_PYTHON:-}"

mkdir -p "$STATE_DIR" "$LOG_DIR" "$PID_DIR" "$POSTGRES_DIR"

print_header() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

find_backend_python() {
  local candidates=()

  if [[ -n "$BACKEND_PYTHON" ]]; then
    candidates+=("$BACKEND_PYTHON")
  fi

  candidates+=("python3.13" "python3.12" "python3.11" "python3")

  for candidate in "${candidates[@]}"; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi

    local version
    version="$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
    case "$version" in
      3.13|3.12|3.11)
        printf '%s\n' "$candidate"
        return 0
        ;;
    esac
  done

  fail "未找到受支持的 Python。请安装 Python 3.11 / 3.12 / 3.13；不要使用 Python 3.14。macOS 可执行：brew install python@3.12"
}

python_version_of() {
  local python_bin="$1"
  "$python_bin" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
}

pid_is_running() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  kill -0 "$pid" >/dev/null 2>&1
}

port_listener_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  fi
}

describe_pid() {
  local pid="$1"
  if command -v ps >/dev/null 2>&1; then
    ps -p "$pid" -o pid=,ppid=,command= 2>/dev/null || true
  fi
}

process_cwd() {
  local pid="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
  fi
}

kill_process_tree() {
  local pid="$1"
  local child
  if command -v pgrep >/dev/null 2>&1; then
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
      kill_process_tree "$child"
    done
  fi
  kill "$pid" >/dev/null 2>&1 || true
}

ensure_port_available() {
  local port="$1"
  local service="$2"
  local pids
  pids="$(port_listener_pids "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  printf 'Error: %s 端口 %s 已被占用：\n' "$service" "$port" >&2
  local pid cwd
  for pid in $pids; do
    cwd="$(process_cwd "$pid")"
    printf '  PID %s cwd=%s\n' "$pid" "${cwd:-unknown}" >&2
    describe_pid "$pid" >&2
  done
  printf '\n请先停止占用端口的旧服务，或执行：bash ./run-local.sh stop\n' >&2
  exit 1
}

stop_project_port_listeners() {
  local port="$1"
  local name="$2"
  local pids
  pids="$(port_listener_pids "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  local pid cwd
  for pid in $pids; do
    cwd="$(process_cwd "$pid")"
    case "$cwd" in
      "$ROOT_DIR"|"$ROOT_DIR"/*)
        print_header "停止遗留 ${name} 端口进程 ${pid}"
        kill_process_tree "$pid"
        ;;
    esac
  done
}

wait_for_http() {
  local url="$1"
  local retries="${2:-120}"
  for _ in $(seq 1 "$retries"); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    if [[ "$code" =~ ^[23] ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_postgres() {
  local retries="${1:-60}"
  for _ in $(seq 1 "$retries"); do
    if psql \
      -h "$POSTGRES_HOST" \
      -p "$PGPORT" \
      -U "$POSTGRES_USER" \
      -d postgres \
      -tAc "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

ensure_backend_deps() {
  local venv_dir="$ROOT_DIR/apps/backend/.venv"
  local stamp_file="$STATE_DIR/backend.requirements.stamp"
  local requirements_file="$ROOT_DIR/apps/backend/requirements.txt"
  local selected_python
  selected_python="$(find_backend_python)"
  local selected_version
  selected_version="$(python_version_of "$selected_python")"

  if [[ -x "$venv_dir/bin/python" ]]; then
    local venv_version
    venv_version="$("$venv_dir/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
    case "$venv_version" in
      3.13|3.12|3.11)
        ;;
      *)
        print_header "检测到不兼容的后端虚拟环境 Python ${venv_version:-unknown}，重建 .venv"
        rm -rf "$venv_dir"
        rm -f "$stamp_file"
        ;;
    esac
  fi

  if [[ ! -x "$venv_dir/bin/python" ]]; then
    print_header "创建后端虚拟环境"
    printf '使用 Python: %s (%s)\n' "$selected_python" "$selected_version"
    "$selected_python" -m venv "$venv_dir"
  fi

  if [[ ! -f "$stamp_file" || "$requirements_file" -nt "$stamp_file" ]]; then
    print_header "安装后端依赖"
    # shellcheck disable=SC1091
    source "$venv_dir/bin/activate"
    pip install -r "$requirements_file"
    touch "$stamp_file"
  fi
}

ensure_web_deps() {
  local stamp_file="$STATE_DIR/web.package.stamp"
  local package_file="$ROOT_DIR/apps/web/package.json"

  if [[ ! -d "$ROOT_DIR/apps/web/node_modules" || ! -f "$stamp_file" || "$package_file" -nt "$stamp_file" ]]; then
    print_header "安装前端依赖"
    (
      cd "$ROOT_DIR/apps/web"
      npm install
    )
    touch "$stamp_file"
  fi
}

ensure_postgres_initialized() {
  if [[ -f "$PGDATA_DIR/PG_VERSION" ]]; then
    return 0
  fi

  print_header "初始化本地 PostgreSQL 数据目录"
  mkdir -p "$PGDATA_DIR"
  initdb -D "$PGDATA_DIR" -U "$POSTGRES_USER" -A trust --encoding=UTF8 >/dev/null
}

start_postgres() {
  require_cmd initdb
  require_cmd pg_ctl
  require_cmd psql
  require_cmd createdb

  ensure_postgres_initialized

  if pg_ctl -D "$PGDATA_DIR" status >/dev/null 2>&1; then
    print_header "PostgreSQL 已在运行"
  else
    print_header "启动本地 PostgreSQL"
    pg_ctl \
      -D "$PGDATA_DIR" \
      -l "$POSTGRES_LOG" \
      -o "-p ${PGPORT} -h ${POSTGRES_HOST}" \
      start >/dev/null
  fi

  wait_for_postgres || fail "PostgreSQL 启动失败，请查看日志：$POSTGRES_LOG"

  if ! psql \
    -h "$POSTGRES_HOST" \
    -p "$PGPORT" \
    -U "$POSTGRES_USER" \
    -d postgres \
    -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1; then
    print_header "创建数据库 ${POSTGRES_DB}"
    createdb -h "$POSTGRES_HOST" -p "$PGPORT" -U "$POSTGRES_USER" "$POSTGRES_DB"
  fi
}

start_backend() {
  if pid_is_running "$BACKEND_PID_FILE"; then
    print_header "后端已在运行"
    return 0
  fi

  ensure_port_available "$BACKEND_PORT" "后端"
  ensure_backend_deps

  print_header "启动后端 FastAPI"
  (
    cd "$ROOT_DIR/apps/backend"
    # shellcheck disable=SC1091
    source .venv/bin/activate
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
    export CORS_ORIGINS="http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}"
    exec uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT"
  ) >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"

  wait_for_http "http://127.0.0.1:${BACKEND_PORT}/health" || fail "后端启动失败，请查看日志：$BACKEND_LOG"
}

start_web() {
  require_cmd node
  require_cmd npm

  if pid_is_running "$WEB_PID_FILE"; then
    print_header "前端已在运行"
    return 0
  fi

  ensure_port_available "$WEB_PORT" "前端"
  ensure_web_deps

  if [[ -n "${NODE_OPTIONS:-}${NPM_CONFIG_NODE_OPTIONS:-}${npm_config_node_options:-}" ]]; then
    print_header "忽略继承的 Node 运行参数并重建前端缓存"
    rm -rf "$ROOT_DIR/apps/web/.next"
  fi

  local node_preload="$ROOT_DIR/apps/web/scripts/disable-node-localstorage.cjs"

  print_header "启动前端 Next.js"
  (
    cd "$ROOT_DIR/apps/web"
    export BACKEND_API_URL="http://127.0.0.1:${BACKEND_PORT}"
    export POSTGRES_URL="$POSTGRES_URL"
    export IMAGE_STORE_DIR="$ROOT_DIR/apps/web/.data/images"
    export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://127.0.0.1:${WEB_PORT}}"
    unset NODE_OPTIONS
    unset NPM_CONFIG_NODE_OPTIONS
    unset npm_config_node_options
    printf 'Next.js package version: '
    node -p "require('./node_modules/next/package.json').version"
    printf 'Node.js version: '
    node -p "process.version"
    exec env -u NODE_OPTIONS -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
      node --require "$node_preload" ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port "$WEB_PORT"
  ) >"$WEB_LOG" 2>&1 &
  echo $! >"$WEB_PID_FILE"

  wait_for_http "http://127.0.0.1:${WEB_PORT}/" || fail "前端启动失败，请查看日志：$WEB_LOG"
}

stop_pid_process() {
  local pid_file="$1"
  local name="$2"
  if pid_is_running "$pid_file"; then
    local pid
    pid="$(cat "$pid_file")"
    print_header "停止 ${name}"
    kill_process_tree "$pid"
    rm -f "$pid_file"
  fi
}

stop_postgres() {
  if [[ -f "$PGDATA_DIR/PG_VERSION" ]] && pg_ctl -D "$PGDATA_DIR" status >/dev/null 2>&1; then
    print_header "停止 PostgreSQL"
    pg_ctl -D "$PGDATA_DIR" stop -m fast >/dev/null
  fi
}

show_status() {
  print_header "运行状态"
  if pg_ctl -D "$PGDATA_DIR" status >/dev/null 2>&1; then
    printf 'PostgreSQL: running on %s:%s\n' "$POSTGRES_HOST" "$PGPORT"
  else
    printf 'PostgreSQL: stopped\n'
  fi

  if pid_is_running "$BACKEND_PID_FILE"; then
    printf 'Backend: running on http://127.0.0.1:%s\n' "$BACKEND_PORT"
  else
    printf 'Backend: stopped\n'
  fi

  if pid_is_running "$WEB_PID_FILE"; then
    printf 'Web: running on http://127.0.0.1:%s\n' "$WEB_PORT"
  else
    printf 'Web: stopped\n'
  fi

  printf '\nLogs:\n'
  printf '  %s\n' "$POSTGRES_LOG"
  printf '  %s\n' "$BACKEND_LOG"
  printf '  %s\n' "$WEB_LOG"
}

start_all() {
  require_cmd curl
  start_postgres
  start_backend
  start_web

  print_header "启动完成"
  printf 'Play:   http://127.0.0.1:%s/play\n' "$WEB_PORT"
  printf 'Status: http://127.0.0.1:%s/status\n' "$WEB_PORT"
  printf '\nDatabase: %s\n' "$POSTGRES_URL"
  printf 'Logs:\n'
  printf '  postgres -> %s\n' "$POSTGRES_LOG"
  printf '  backend  -> %s\n' "$BACKEND_LOG"
  printf '  web      -> %s\n' "$WEB_LOG"
  printf '\n停止服务：bash ./run-local.sh stop\n'
}

clean_web_cache() {
  print_header "清理前端编译缓存"
  rm -rf "$ROOT_DIR/apps/web/.next"
  printf '已清理 .next 目录，下次启动将重新编译。\n'
}

case "$ACTION" in
  start)
    start_all
    ;;
  stop)
    stop_pid_process "$WEB_PID_FILE" "前端"
    stop_project_port_listeners "$WEB_PORT" "前端"
    stop_pid_process "$BACKEND_PID_FILE" "后端"
    stop_project_port_listeners "$BACKEND_PORT" "后端"
    stop_postgres
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    show_status
    ;;
  clean)
    stop_pid_process "$WEB_PID_FILE" "前端"
    stop_project_port_listeners "$WEB_PORT" "前端"
    clean_web_cache
    printf '运行 bash ./run-local.sh start 重新启动。\n'
    ;;
  *)
    fail "不支持的命令：$ACTION。可用命令：start | stop | restart | status | clean"
    ;;
esac
