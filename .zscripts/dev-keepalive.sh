#!/bin/bash
# Keepalive port 3000 — restart Next.js dev server bila mati.
# Model: notif-keepalive.sh (sesi sebelumnya). Dipanggil sbg daemon double-fork
# via spawn-daemon.py supaya terlepas dr pohon proses panggilan tool.
# Heap cap 1536MB via NODE_OPTIONS — cegah OOM (next-server pernah RSS 2,7GB).

while true; do
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/ ; then
    echo "[$(date '+%F %T')] port 3000 down — starting dev server..." >> /home/z/my-project/.zscripts/dev-keepalive.log
    (
      cd /home/z/my-project
      exec env NODE_OPTIONS='--max-old-space-size=1536' bun run dev
    ) >> /home/z/my-project/.zscripts/dev-keepalive.log 2>&1 &
    disown 2>/dev/null || true
    sleep 10
  fi
  sleep 15
done
