"""Spawn proses sebagai daemon sungguhan (double-fork + setsid + detach stdio).

Cara kerja meniru daemonisasi agent-browser: fork -> setsid -> fork lagi ->
proses cucu di-exec sebagai daemon dgn PPID 1, terlesep dr sesi & pty
panggilan tool. Pemakaian:

  DAEMON_CWD=/dir DAEMON_LOG=/log.txt python3 spawn-daemon.py <cmd> [args...]

"""
import os
import sys


def daemonize(cmd):
    pid = os.fork()
    if pid == 0:
        # Anak pertama: sesi baru, lepas dr controlling terminal
        os.setsid()
        try:
            pid2 = os.fork()
        except Exception:
            os._exit(1)
        if pid2 == 0:
            # Cucu: bukan leader sesi -> takkan pernah dapat controlling tty
            try:
                devnull = os.open('/dev/null', os.O_RDWR)
                os.dup2(devnull, 0)
                os.close(devnull)
                log_path = os.environ.get('DAEMON_LOG', '/dev/null')
                out = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
                os.dup2(out, 1)
                os.dup2(out, 2)
                os.close(out)
                os.chdir(os.environ.get('DAEMON_CWD', '/'))
                os.execvp(cmd[0], cmd)
            except Exception:
                os._exit(1)
        # Anak pertama langsung exit -> cucu di-reparent ke PID 1
        os._exit(0)
    # Induk: tunggu anak pertama supaya tidak jadi zombie
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: spawn-daemon.py <cmd> [args...]', file=sys.stderr)
        sys.exit(2)
    daemonize(sys.argv[1:])
