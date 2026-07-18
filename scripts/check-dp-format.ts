import { db } from '../src/lib/db'

async function main() {
  const all = await db.documentHistory.findMany({
    where: { docType: 'invoice' },
    select: { id: true, nomor: true, dataJson: true, userId: true },
    take: 100,
  })
  console.log('Total invoices:', all.length)
  for (const h of all) {
    try {
      const d = JSON.parse(h.dataJson)
      const dp = d.dp
      const dpAmount = d.dpAmount
      console.log(`  [${h.userId}] ${h.nomor}: dp=${dp}, dpAmount=${dpAmount}, lunas=${d.lunas}, tglJatuhTempo=${d.tanggalJatuhTempo}`)
    } catch (e) {
      console.log(`  [${h.userId}] ${h.nomor}: PARSE ERROR`)
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
