#!/usr/bin/env python3
"""Double-fork daemonizer untuk menjalankan `bun run dev` (Next.js dev server)
agar proses selamat dari reaping antar-panggilan tool di sandbox.

Usage: python3 scripts/devd.py
"""
import os
import sys
import time

PROJECT_DIR = "/home/z/my-project"


def daemonize_and_spawn() -> None:
    pid = os.fork()
    if pid == 0:
        # Child pertama: jadi session leader lalu fork lagi,
        # sehingga child akhir BUKAN session leader (bisa selamat).
        os.setsid()
        pid2 = os.fork()
        if pid2 == 0:
            os.chdir(PROJECT_DIR)
            devnull = os.open("/dev/null", os.O_RDONLY)
            os.dup2(devnull, 0)
            log = os.open("/tmp/devd.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
            os.dup2(log, 1)
            os.dup2(log, 2)
            os.execvp("bun", ["bun", "run", "dev"])
            os._exit(127)  # execvp gagal
        os._exit(0)
    # Parent menunggu sebentar lalu keluar; child akhir di-adopsi PID 1.
    time.sleep(0.3)


if __name__ == "__main__":
    daemonize_and_spawn()
    print("dev server daemon spawned")
    sys.exit(0)
