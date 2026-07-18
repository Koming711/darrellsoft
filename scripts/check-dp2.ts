import { db } from '../src/lib/db'

async function main() {
  const all = await db.documentHistory.findMany({
    where: { docType: 'invoice' },
    select: { id: true, nomor: true, dataJson: true, createdAt: true, userId: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  })
  console.log('Total invoices:', all.length)
  const byUser = new Map<string, number>()
  let withDp = 0
  for (const h of all) {
    const u = h.userId || '(null)'
    byUser.set(u, (byUser.get(u) || 0) + 1)
    try {
      const d = JSON.parse(h.dataJson)
      if ((d.dp || 0) > 0) withDp++
    } catch {}
  }
  console.log('With DP > 0:', withDp)
  console.log('By user:')
  for (const [u, c] of byUser) console.log(`  ${u}: ${c}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
