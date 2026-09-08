#!/bin/bash
# Gateway watchdog: health-check every 10 min, restart on two consecutive
# misses. Survives sessions (run via hub with persist:true).
# Test: bash scripts/watchdog.sh --once
# Logs: /tmp/gateway-watchdog.log (this), /tmp/gateway-restart.log (gateway)
cd "$(dirname "$0")/.." || exit 1 # apps/gateway
command -v bun >/dev/null 2>&1 || export PATH="$HOME/.bun/bin:/usr/local/bin:$PATH"
PORT="${PORT:-8793}"
LOG=/tmp/gateway-watchdog.log
APP_LOG=/tmp/gateway-restart.log
log() { echo "[$(date '+%F %T')] $*" >>"$LOG"; }
healthy() { curl -s -m 10 "http://localhost:$PORT/health" 2>/dev/null | grep -q '"ok":true'; }
restart() {
  log "DOWN detected — restarting gateway"
  PID=$(lsof -t -i :$PORT -sTCP:LISTEN 2>/dev/null | head -1)
  [ -n "$PID" ] && kill -9 "$PID" 2>/dev/null
  sleep 2
  # No env sourcing: bun auto-loads apps/gateway/.env (single source of truth).
  # Exported vars would SHADOW the file — never source another .env here.
  PORT=$PORT nohup bun run src/index.ts >>"$APP_LOG" 2>&1 &
  sleep 8
  BODY=$(curl -s -m 10 "http://localhost:$PORT/health" 2>/dev/null)
  if echo "$BODY" | grep -q '"ok":true'; then log "UP ok (all lanes per /health)"; else log "RESTART FAILED body=${BODY:0:120} — needs human"; fi
}
log "watchdog armed (interval 600s, port $PORT)"
if [ "${1:-}" = "--once" ]; then
  if healthy; then log "once: healthy"; else log "once: DOWN"; fi
  exit 0
fi
fails=0
while true; do
  sleep 600
  if healthy; then
    fails=0
  else
    fails=$((fails + 1))
    log "health miss $fails/2"
    if [ $fails -ge 2 ]; then restart; fails=0; fi
  fi
done
