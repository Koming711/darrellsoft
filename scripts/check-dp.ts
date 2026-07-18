import { db } from '../src/lib/db'

async function main() {
  const all = await db.documentHistory.findMany({
    where: { docType: 'invoice' },
    select: { id: true, nomor: true, dataJson: true, createdAt: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  })
  console.log('Total invoice documents:', all.length)
  let withDp = 0
  let sampleDp: any = null
  const dpValues = new Set<number>()
  for (const h of all) {
    try {
      const d = JSON.parse(h.dataJson)
      const dp = d.dp || 0
      dpValues.add(dp)
      if (dp > 0) {
        withDp++
        if (!sampleDp) sampleDp = { id: h.id, nomor: h.nomor, dp, keys: Object.keys(d) }
      }
    } catch {}
  }
  console.log('With DP > 0:', withDp)
  console.log('Distinct dp values:', [...dpValues])
  console.log('Sample DP invoice:', JSON.stringify(sampleDp, null, 2))
  if (all.length > 0) {
    console.log('First invoice keys:', Object.keys(JSON.parse(all[0].dataJson)))
    console.log('First invoice sample:', all[0].dataJson.substring(0, 500))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
