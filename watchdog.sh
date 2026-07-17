#!/bin/bash
# Watchdog: restart Next.js dev server if it's down
if ! ss -tlnp 2>/dev/null | grep -q ":3000"; then
  # Server is down, restart it
  pkill -9 -f "next" 2>/dev/null
  sleep 1
  cd /home/z/my-project
  setsid bash -c 'exec /home/z/my-project/node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
  disown
  # Wait for it to be ready
  for i in $(seq 1 30); do
    sleep 1
    if curl -s -o /dev/null --max-time 2 http://127.0.0.1:3000/login 2>/dev/null; then
      # Pre-compile critical pages
      curl -s -o /dev/null --max-time 30 http://127.0.0.1:3000/login 2>/dev/null
      curl -s -o /dev/null --max-time 60 http://127.0.0.1:3000/pembukaan 2>/dev/null
      curl -s -o /dev/null --max-time 60 http://127.0.0.1:3000/ 2>/dev/null
      break
    fi
  done
fi
