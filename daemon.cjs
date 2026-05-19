/**
 * daemon.cjs - Persistent process manager for DokuPro dev server
 *
 * Automatically starts and keeps the Next.js dev server running.
 * If the server crashes, it will be restarted after a short delay.
 *
 * 🔒 PROTECTED: This file is self-healing. If deleted, the running daemon
 *    will automatically recreate it. The source code is embedded in memory.
 *
 * Usage:
 *   node daemon.cjs          # Start daemon in foreground (with auto-restart)
 *   node daemon.cjs start    # Start daemon in background (detached)
 *   node daemon.cjs stop     # Stop the daemon
 *   node daemon.cjs status   # Check daemon & server status
 *   node daemon.cjs restart  # Restart the daemon
 *   node daemon.cjs log      # Show recent log entries
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = __dirname;
const PID_FILE = path.join(PROJECT_DIR, '.daemon.pid');
const LOG_FILE = path.join(PROJECT_DIR, '.daemon.log');
const SELF_FILE = __filename;
const MAX_RESTARTS = 10;
const RESTART_DELAY = 3000;
const PORT = 3000;

// 🔒 Embed own source code in memory for self-healing
let SELF_SOURCE = '';
try {
  SELF_SOURCE = fs.readFileSync(SELF_FILE, 'utf8');
} catch {}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  return line;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(pid) {
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePid() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function killPortProcess(port) {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {}
  try {
    execSync(`lsof -ti :${port} 2>/dev/null | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {}
}

// 🔒 Self-healing: restore daemon.cjs if deleted
function selfHeal() {
  try {
    if (!fs.existsSync(SELF_FILE)) {
      log('🔒 SELF-HEAL: daemon.cjs was deleted! Restoring...');
      if (SELF_SOURCE) {
        fs.writeFileSync(SELF_FILE, SELF_SOURCE, 'utf8');
        log('🔒 SELF-HEAL: daemon.cjs restored successfully');
      } else {
        log('🔒 SELF-HEAL: No embedded source available, cannot restore');
      }
    }
  } catch (err) {
    log(`🔒 SELF-HEAL error: ${err.message}`);
  }
}

function stopDaemon() {
  const pid = readPid();
  if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      let attempts = 0;
      while (isProcessRunning(pid) && attempts < 10) {
        execSync('sleep 1', { stdio: 'ignore' });
        attempts++;
      }
      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    } catch {}
  }
  killPortProcess(PORT);
  removePid();
}

function runServer() {
  let restartCount = 0;
  let lastRestartTime = 0;

  // Rotate log if too large (>5MB)
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > 5 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch {}

  function spawnServer() {
    const now = Date.now();

    if (now - lastRestartTime < RESTART_DELAY * 2) {
      restartCount++;
    } else {
      restartCount = 0;
    }
    lastRestartTime = now;

    if (restartCount >= MAX_RESTARTS) {
      log(`CRASH LOOP: ${MAX_RESTARTS} crashes. Cooling down 30s...`);
      restartCount = 0;
      setTimeout(spawnServer, 30000);
      return;
    }

    log(`Starting Next.js dev server (attempt ${restartCount + 1})...`);

    // Kill any existing process on port
    killPortProcess(PORT);
    try { execSync('sleep 1', { stdio: 'ignore' }); } catch {}

    const child = spawn('node', [
      './node_modules/.bin/next', 'dev', '-p', String(PORT)
    ], {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    log(`Server process spawned (PID: ${child.pid})`);

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => {
        try { fs.appendFileSync(LOG_FILE, `[stdout] ${line}\n`); } catch {}
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => {
        try { fs.appendFileSync(LOG_FILE, `[stderr] ${line}\n`); } catch {}
      });
    });

    child.on('exit', (code, signal) => {
      log(`Server exited (code: ${code}, signal: ${signal}). Restarting in ${RESTART_DELAY / 1000}s...`);
      setTimeout(spawnServer, RESTART_DELAY);
    });

    child.on('error', (err) => {
      log(`Server spawn error: ${err.message}. Restarting in ${RESTART_DELAY / 1000}s...`);
      setTimeout(spawnServer, RESTART_DELAY);
    });
  }

  // Handle daemon shutdown
  const cleanup = () => {
    log('Daemon shutting down...');
    killPortProcess(PORT);
    removePid();
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGHUP', cleanup);

  // Write PID file
  writePid(process.pid);
  log(`Daemon started (PID: ${process.pid})`);

  spawnServer();

  // 🔒 Self-healing watchdog: check every 5 seconds if daemon.cjs still exists
  setInterval(() => {
    selfHeal();
  }, 5000);

  // Keep alive - prevent process from exiting
  setInterval(() => {
    // Health check: verify we can still write
    try { fs.appendFileSync(LOG_FILE, ''); } catch {}
  }, 60000);
}

function showStatus() {
  const pid = readPid();
  if (pid && isProcessRunning(pid)) {
    console.log(`✅ Daemon is RUNNING (PID: ${pid})`);
  } else {
    console.log('❌ Daemon is NOT running');
    removePid();
  }

  // Check port
  try {
    const result = execSync(`lsof -i :${PORT} -t 2>/dev/null || echo ""`, { encoding: 'utf8' }).trim();
    if (result) {
      console.log(`✅ Port ${PORT} is IN USE (server likely running)`);
    } else {
      console.log(`❌ Port ${PORT} is FREE (server not running)`);
    }
  } catch {
    console.log(`❓ Cannot check port ${PORT}`);
  }

  // Check if daemon.cjs exists
  try {
    if (fs.existsSync(SELF_FILE)) {
      console.log(`🔒 daemon.cjs EXISTS (${fs.statSync(SELF_FILE).size} bytes)`);
    } else {
      console.log('⚠️ daemon.cjs IS MISSING! Will be auto-restored by running daemon.');
    }
  } catch {}

  // Show last 10 log lines
  try {
    const logs = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-10);
    console.log('\n📋 Last 10 log lines:');
    logs.forEach(l => console.log(`  ${l}`));
  } catch {
    console.log('📋 No log file found.');
  }
}

function showLog() {
  try {
    const logs = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-50);
    logs.forEach(l => console.log(l));
  } catch {
    console.log('No log file found.');
  }
}

// Main
const command = process.argv[2] || 'foreground';

switch (command) {
  case 'foreground': {
    // Check if already running
    const existingPid = readPid();
    if (existingPid && isProcessRunning(existingPid)) {
      console.log(`Daemon is already running (PID: ${existingPid}). Use 'stop' first.`);
      process.exit(1);
    }
    removePid();
    runServer();
    break;
  }

  case 'start': {
    // Start in background (detached)
    const existingPid2 = readPid();
    if (existingPid2 && isProcessRunning(existingPid2)) {
      console.log(`Daemon is already running (PID: ${existingPid2})`);
      process.exit(0);
    }
    stopDaemon();

    const child = spawn(process.execPath, [__filename, 'foreground'], {
      cwd: PROJECT_DIR,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();

    // Wait a moment and verify
    setTimeout(() => {
      const pid = readPid();
      if (pid && isProcessRunning(pid)) {
        console.log(`✅ Daemon started in background (PID: ${pid})`);
        console.log(`📋 Log: ${LOG_FILE}`);
      } else {
        console.log('❌ Daemon failed to start. Check log file.');
      }
    }, 2000);
    break;
  }

  case 'stop':
    stopDaemon();
    console.log('Daemon stopped.');
    break;

  case 'status':
    showStatus();
    break;

  case 'log':
    showLog();
    break;

  case 'restart': {
    stopDaemon();
    try { execSync('sleep 2', { stdio: 'ignore' }); } catch {}
    const restartChild = spawn(process.execPath, [__filename, 'foreground'], {
      cwd: PROJECT_DIR,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    restartChild.unref();
    setTimeout(() => {
      const pid = readPid();
      if (pid && isProcessRunning(pid)) {
        console.log(`✅ Daemon restarted (PID: ${pid})`);
      } else {
        console.log('❌ Daemon failed to restart. Check log file.');
      }
    }, 3000);
    break;
  }

  case 'protect': {
    // 🔒 Restore daemon.cjs if it was deleted (manual trigger)
    if (!fs.existsSync(SELF_FILE)) {
      if (SELF_SOURCE) {
        fs.writeFileSync(SELF_FILE, SELF_SOURCE, 'utf8');
        console.log('🔒 daemon.cjs restored from embedded source.');
      } else {
        console.log('❌ No embedded source available. Cannot restore.');
      }
    } else {
      console.log('🔒 daemon.cjs already exists. No action needed.');
    }
    break;
  }

  default:
    console.log(`
DokuPro Daemon - Persistent dev server manager

Usage:
  node daemon.cjs            Start daemon in foreground (auto-restart)
  node daemon.cjs start      Start daemon in background (detached)
  node daemon.cjs stop       Stop the daemon
  node daemon.cjs status     Check daemon & server status
  node daemon.cjs restart    Restart the daemon
  node daemon.cjs log        Show recent log entries
  node daemon.cjs protect    Manually restore daemon.cjs if deleted

🔒 This file is self-healing: if deleted while daemon is running,
   it will be automatically recreated within 5 seconds.
`);
    break;
}
