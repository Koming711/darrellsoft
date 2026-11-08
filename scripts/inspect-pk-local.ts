/** Local (sqlite) inspection of PK numbering + DocumentCounter. */
import { db } from '../src/lib/db'

async function main() {
  const users = await db.pengguna.findMany({ select: { id: true, username: true, role: true } })
  console.log('USERS:', users.map(u => `${u.id}(${u.username}/${u.role})`).join(', '))

  const pk = await db.riwayatPotongKertas.findMany({
    select: { id: true, nomorUrut: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log('PK records:', pk.length)
  for (const r of pk.slice(-8)) console.log(' ', r.createdAt.toISOString(), '|', r.nomorUrut, '|', r.userId)

  const counters = await db.documentCounter.findMany({ orderBy: { key: 'asc' } })
  console.log('DocumentCounter rows:', counters.length)
  for (const c of counters) console.log(' ', c.key, '=', c.lastNum)
}

main().catch(e => { console.error(e); process.exit(1) })
