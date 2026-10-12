// notif-ws — mini-service socket.io untuk NOTIFIKASI REALTIME Darrellsoft.
//
// Port 3004 (frontend selalu: io('/?XTransformPort=3004', { path: '/' })).
// Sumber data: tabel `Notification` di db/custom.db (dibaca readonly via bun:sqlite).
// Setiap notifikasi baru (rowid > lastRowid) di-emit ke room tujuan:
//   - userId ''      → room 'admins' (broadcast admin/superadmin)
//   - userId '<id>'  → room 'user:<id>'
// Protokol klien:
//   emit('subscribe', { userId, role })  → join room user + (admin) room admins
//   on('notification', payload)          → toast/ubah badge
//   on('pong-test')                      → balasan 'test' (health check)

import { createServer } from 'http'
import { Server } from 'socket.io'
import { Database } from 'bun:sqlite'
import { existsSync } from 'fs'
import path from 'path'

const PORT = 3004
// DB utama project — relatif ke folder mini-service ini
const DB_PATH = path.resolve(import.meta.dir, '..', '..', 'db', 'custom.db')

if (!existsSync(DB_PATH)) {
  console.error(`[notif-ws] DB tidak ditemukan: ${DB_PATH}`)
  process.exit(1)
}

// Readonly: service ini TIDAK PERNAH menulis — aman berjalan bersama Prisma.
const sq = new Database(DB_PATH, { readonly: true })
try {
  sq.exec('PRAGMA busy_timeout = 3000')
} catch { /* abaikan */ }

interface NotifRow {
  rowid: number
  id: string
  userId: string
  title: string
  body: string
  type: string
  link: string
  createdAt: string
}

function maxRowid(): number {
  try {
    const row = sq.query('SELECT COALESCE(MAX(rowid), 0) AS m FROM Notification').get() as { m: number } | null
    return row?.m ?? 0
  } catch (e) {
    console.error('[notif-ws] maxRowid error:', e)
    return 0
  }
}

function rowsSince(last: number): NotifRow[] {
  try {
    return sq
      .query(
        `SELECT rowid, id, userId, title, body, type, link, createdAt
         FROM Notification WHERE rowid > ? ORDER BY rowid ASC LIMIT 100`
      )
      .all(last) as unknown as NotifRow[]
  } catch (e) {
    // SQLITE_BUSY dsb — coba lagi di tick berikutnya
    console.error('[notif-ws] rowsSince error:', e)
    return []
  }
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, service: 'notif-ws', clients: io.engine.clientsCount }))
})

const io = new Server(httpServer, {
  // JANGAN ubah path — dipakai Caddy untuk forward ke port ini
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  socket.on('subscribe', (data: { userId?: string; role?: string } = {}) => {
    const userId = String(data?.userId ?? '')
    const role = String(data?.role ?? '')
    if (userId) socket.join(`user:${userId}`)
    if (role === 'admin' || role === 'superadmin') socket.join('admins')
    socket.emit('subscribed', { userId, role, at: new Date().toISOString() })
  })

  socket.on('test', (_cb?: (r: unknown) => void) => {
    socket.emit('pong-test', { at: new Date().toISOString() })
  })
})

// ==== Poll notifikasi baru ====
let lastRowid = maxRowid()
console.log(`[notif-ws] start port ${PORT} · db=${DB_PATH} · lastRowid=${lastRowid}`)

const POLL_MS = 1500
setInterval(() => {
  const rows = rowsSince(lastRowid)
  if (rows.length === 0) return
  for (const r of rows) {
    const payload = {
      id: r.id,
      userId: r.userId,
      title: r.title,
      body: r.body ?? '',
      type: r.type ?? 'info',
      link: r.link ?? '',
      createdAt: r.createdAt,
    }
    if (r.userId) {
      io.to(`user:${r.userId}`).emit('notification', payload)
      console.log(`[notif-ws] → user:${r.userId} "${r.title}"`)
    } else {
      io.to('admins').emit('notification', payload)
      console.log(`[notif-ws] → admins "${r.title}"`)
    }
    lastRowid = Math.max(lastRowid, r.rowid)
  }
}, POLL_MS)

httpServer.listen(PORT, () => {
  console.log(`[notif-ws] socket.io listening on :${PORT}`)
})
