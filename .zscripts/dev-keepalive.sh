#!/bin/bash
# Watchdog v2 — port 3000 (app utama) + port 3010 (mini-service produk-app) + RSS guard.
# Latar belakang (2 Nov 2026): kernel OOM-killer membunuh next-server utama saat
# RSS 1,93GB (dev server Turbopack tumbuh ±30-80MB/mnt) → preview mati mendadak;
# mini-app 3010 juga pernah mati tanpa penjaga. V2:
#   - jaga KEDUA port (respawn bila mati, deteksi tiap 8 dtk);
#   - RSS guard: restart TERKENDALI app utama bila total RSS pohon proses
#     melewati GUARD_KB — lebih baik dari OOM killer yang membantai proses acak.
# Dijalankan sbg daemon double-fork via spawn-daemon.py (kebal reaper platform):
#   DAEMON_CWD=/home/z/my-project python3 .zscripts/spawn-daemon.py bash .zscripts/dev-keepalive.sh

ROOT=/home/z/my-project
LOG=$ROOT/.zscripts/dev-keepalive.log
PIDFILE_MAIN=$ROOT/.zscripts/dev-main.pid
PIDFILE_PRODUK=$ROOT/.zscripts/dev-produk.pid
GUARD_KB=1750000   # ±1,75GB — beri margin sebelum kernel OOM (korban terakhir tewas di 1,93GB)
CYCLE=8            # detik antar-siklus deteksi
COOLDOWN=30        # jeda minimal antar percobaan start (hindari double-start)

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

kill_tree() { # kill_tree <pid> <SIG> — bunuh pohon proses (bun→bash→node→next-server)
  local parent=$1 sig=$2 kids k
  kids=$(pgrep -P "$parent" 2>/dev/null)
  for k in $kids; do kill_tree "$k" "$sig"; done
  kill -"$sig" "$parent" 2>/dev/null
}

sum_tree_rss() { # sum_tree_rss <pid> — total VmRSS (KB) seluruh pohon proses (BFS + set seen)
  local total=0 seen="" queue="$1" newp p rss kids
  while [ -n "${queue// /}" ]; do
    newp=""
    for p in $queue; do
      case " $seen " in *" $p "*) continue ;; esac
      seen="$seen $p"
      rss=$(awk '/^VmRSS:/{print $2}' /proc/"$p"/status 2>/dev/null)
      total=$((total + ${rss:-0}))
      kids=$(pgrep -P "$p" 2>/dev/null | tr '\n' ' ')
      newp="$newp $kids"
    done
    queue=$newp
  done
  echo "$total"
}

# Adopsi proses yang sudah hidup (daemon ganti generasi tanpa server restart)
adopt() { # adopt <cwd-yang-dicari> <pidfile> <nama>
  local want=$1 pidfile=$2 nama=$3 pid cwd p
  [ -s "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null && return 0
  for p in $(pgrep -f '^bun run dev$'); do
    cwd=$(readlink /proc/$p/cwd 2>/dev/null)
    if [ "$cwd" = "$want" ]; then
      echo $p > "$pidfile"
      log "adopsi $nama: pid $p (sudah hidup)"
      return 0
    fi
  done
  return 1
}

start_main() {
  log "port 3000 down — start dev server utama..."
  ( cd "$ROOT" && exec env NODE_OPTIONS='--max-old-space-size=1536' bun run dev ) >> "$LOG" 2>&1 &
  echo $! > "$PIDFILE_MAIN"
  disown 2>/dev/null || true
}

start_produk() {
  log "port 3010 down — start mini-service produk-app..."
  ( cd "$ROOT/mini-services/produk-app" && exec bun run dev ) >> "$ROOT/.zscripts/mini-service-produk-app.log" 2>&1 &
  echo $! > "$PIDFILE_PRODUK"
  disown 2>/dev/null || true
}

LAST_MAIN=0; LAST_PRODUK=0
log "=== watchdog v2 mulai (guard ${GUARD_KB}KB, siklus ${CYCLE}s) ==="
adopt "$ROOT" "$PIDFILE_MAIN" "app-utama" || true
adopt "$ROOT/mini-services/produk-app" "$PIDFILE_PRODUK" "produk-app" || true

while true; do
  NOW=$(date +%s)

  # ---- Port 3000: liveness ----
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/ ; then
    if [ $((NOW - LAST_MAIN)) -ge $COOLDOWN ]; then
      LAST_MAIN=$NOW
      start_main
      sleep 10
    fi
  else
    # ---- RSS guard app utama ----
    MPID=$(cat "$PIDFILE_MAIN" 2>/dev/null)
    if [ -n "$MPID" ] && kill -0 "$MPID" 2>/dev/null; then
      RSS=$(sum_tree_rss "$MPID")
      if [ "$RSS" -gt "$GUARD_KB" ]; then
        log "RSS guard: pohon app utama ${RSS}KB > ${GUARD_KB}KB — restart terkendali (cegah OOM killer)"
        kill_tree "$MPID" TERM
        sleep 3
        kill_tree "$MPID" KILL
        LAST_MAIN=$NOW
        start_main
        sleep 10
      fi
    else
      # pidfile basi tapi server merespons (mis. start manual di luar daemon) → adopsi ulang
      adopt "$ROOT" "$PIDFILE_MAIN" "app-utama" || true
    fi
  fi

  # ---- Port 3010: liveness ----
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3010/produk-app ; then
    if [ $((NOW - LAST_PRODUK)) -ge $COOLDOWN ]; then
      LAST_PRODUK=$NOW
      start_produk
      sleep 10
    fi
  else
    PPID2=$(cat "$PIDFILE_PRODUK" 2>/dev/null)
    if [ -z "$PPID2" ] || ! kill -0 "$PPID2" 2>/dev/null; then
      adopt "$ROOT/mini-services/produk-app" "$PIDFILE_PRODUK" "produk-app" || true
    fi
  fi

  sleep $CYCLE
done
