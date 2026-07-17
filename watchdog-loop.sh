#!/bin/bash
# Persistent watchdog: checks every 30s, restarts server if down
while true; do
  if ! curl -s -o /dev/null --max-time 3 http://127.0.0.1:3000/login 2>/dev/null; then
    # Server is down or unresponsive, restart it
    pkill -9 -f "next-server" 2>/dev/null
    pkill -9 -f "next dev" 2>/dev/null
    sleep 2
    cd /home/z/my-project
    nohup /home/z/my-project/node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
    # Wait for it to be ready
    for i in $(seq 1 45); do
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
  sleep 30
done
