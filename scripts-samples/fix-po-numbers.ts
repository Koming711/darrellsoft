// Fix duplicate PO numbers from sample run — renumber + fix mutasi keterangan + advance counter
// Run: bun scripts-samples/fix-po-numbers.ts
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// createdAt order = creation order: row1 keeps 0008, others get 0009..0012
const target = [
  { suplier: 'Toko Kertas Maju Jaya', nomor: 'PO/09/26/0009' },
  { suplier: 'PT Kimia Cetak Indah', nomor: 'PO/09/26/0010' },
  { suplier: 'PT Mitra Kertas Nusantara', nomor: 'PO/09/26/0011' },
  { suplier: 'PT Grafika Teknik', nomor: 'PO/09/26/0012' },
]

const pos = await db.documentHistory.findMany({
  where: { docType: 'purchase-order', deletedAt: null, nomor: 'PO/09/26/0008' },
  orderBy: { createdAt: 'asc' },
})
console.log(`PO dengan nomor 0008: ${pos.length}`)
if (pos.length !== 5) { console.log('URAIAN:'); for (const p of pos) console.log(` ${p.createdAt.toISOString()} ${p.pihakKedua}`) }

// pos[0] = CV Sinar Grafika (keep 0008), pos[1..4] renumber
for (let i = 1; i < pos.length; i++) {
  const po = pos[i]
  const t = target[i - 1]
  if (po.pihakKedua !== t.suplier) { console.log(`SKIP (suplier tak cocok): ${po.pihakKedua}`); continue }
  const raw = JSON.parse(po.dataJson)
  raw.nomor = t.nomor
  await db.documentHistory.update({ where: { id: po.id }, data: { nomor: t.nomor, dataJson: JSON.stringify(raw) } })
  console.log(`PO ${po.pihakKedua}: 0008 -> ${t.nomor}`)

  // fix mutasi keterangan utk PO diterima
  if (raw.diterima === true) {
    for (const it of raw.receivedItems || []) {
      const res = await db.bahanMutasi.updateMany({
        where: { keterangan: `Penerimaan PO PO/09/26/0008 — ${it.bahanNama}`, bahanId: it.bahanId },
        data: { keterangan: `Penerimaan PO ${t.nomor} — ${it.bahanNama}` },
      })
      console.log(`  mutasi ${it.bahanNama}: ${res.count} baris -> ${t.nomor}`)
    }
  }
}

// advance counter ke 12 agar PO berikutnya = 0013
const key = 'documentHistory|PO|2609|user-superadmin'
const c = await db.documentCounter.upsert({ where: { key }, create: { key, lastNum: 12 }, update: { lastNum: 12 } })
console.log(`Counter ${key} = ${c.lastNum}`)

await db.$disconnect()
console.log('SELESAI')
