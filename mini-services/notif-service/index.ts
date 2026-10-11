// ============================================================
// notif-service — Realtime notification mini service (port 3003)
// ============================================================
// Socket.io server untuk notifikasi realtime Darrell Soft.
//
// Frontend connect:  io('/?XTransformPort=3003')  — path SELALU '/'
//                   (Caddy meneruskan via query XTransformPort)
//
// Room:
//   - 'admins'      : semua client yang auth dengan role admin/superadmin
//   - 'user:<id>'   : room pribadi per pengguna
//
// Client auth setelah connect:
//   socket.emit('auth', { userId, role })
//
// Broadcast event 'notif:new' dengan payload:
//   { id, type, title, body, link, createdAt, userId? }
//   - userId ada    → dikirim ke room user:<id> (targeted)
//   - userId kosong → dikirim ke room admins (broadcast admin)
//
// Endpoint internal (dipakai server Next.js, BUKAN browser):
//   POST http://127.0.0.1:3004/emit   header x-notif-secret
//   GET  http://127.0.0.1:3004/health
//
// PENTING: endpoint internal berada di port TERPISAH (3004) karena
// engine.io (socket.io path '/') menangkap SEMUA request di port 3003.
// Port 3004 tidak boleh diakses browser — selalu cek secret header.
import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003        // socket.io (browser via Caddy XTransformPort)
const INTERNAL_PORT = 3004 // internal emit endpoint (Next.js server saja)
const SECRET = process.env.NOTIF_WS_SECRET || 'ds-notif-internal-v1'

// ---- Socket.io (port 3003) ----
const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path — it is used by Caddy to forward the request
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  socket.on('auth', (data: { userId?: string; role?: string } = {}) => {
    try {
      const role = String(data?.role || 'user')
      if (role === 'admin' || role === 'superadmin') socket.join('admins')
      const userId = data?.userId ? String(data.userId).slice(0, 64) : ''
      if (userId) socket.join(`user:${userId}`)
    } catch (err) {
      console.error('auth error:', err)
    }
  })

  socket.on('ping-rt', (cb) => {
    if (typeof cb === 'function') cb(Date.now())
  })
})

httpServer.listen(PORT, () => {
  console.log(`✅ notif-service (socket.io) running on port ${PORT}`)
})

// ---- Internal HTTP API (port 3004, localhost only) ----
const internalServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }))
    return
  }

  if (req.method === 'POST' && req.url === '/emit') {
    if (req.headers['x-notif-secret'] !== SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Secret tidak valid' }))
      return
    }
    let body = ''
    let oversized = false
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64_000) {
        oversized = true
        req.destroy()
      }
    })
    req.on('end', () => {
      if (oversized) return
      try {
        const data = JSON.parse(body || '{}')
        const title = String(data.title || '').slice(0, 120)
        if (!title) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'title wajib' }))
          return
        }
        const payload = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: String(data.type || 'info').slice(0, 32),
          title,
          body: String(data.body || '').slice(0, 300),
          link: String(data.link || '').slice(0, 200),
          userId: data.userId ? String(data.userId).slice(0, 64) : '',
          createdAt: new Date().toISOString(),
        }
        if (payload.userId) {
          io.to(`user:${payload.userId}`).emit('notif:new', payload)
        } else {
          io.to('admins').emit('notif:new', payload)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, delivered: payload.userId ? 'user' : 'admins' }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Body JSON tidak valid' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

internalServer.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`✅ notif-service internal emit API on 127.0.0.1:${INTERNAL_PORT}`)
})

process.on('SIGTERM', () => {
  console.log('notif-service: SIGTERM — shutting down...')
  httpServer.close(() => process.exit(0))
  internalServer.close()
  setTimeout(() => process.exit(0), 3000)
})
