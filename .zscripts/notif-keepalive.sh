#!/bin/bash
# Keepalive for notif-service (ports 3003/3004) — restarts it if it dies.
SERVICE_DIR="/home/z/my-project/mini-services/notif-service"
LOG="/home/z/my-project/.zscripts/mini-service-notif-service.log"

while true; do
  if ! ss -tln 2>/dev/null | grep -q ':3003 '; then
    echo "[$(date '+%F %T')] port 3003 down — starting notif-service..." >> "$LOG"
    ( cd "$SERVICE_DIR" && exec bun run dev ) >> "$LOG" 2>&1 &
    KEEPALIVE_CHILD=$!
    disown "$KEEPALIVE_CHILD" 2>/dev/null || true
    sleep 10
  fi
  sleep 15
done
