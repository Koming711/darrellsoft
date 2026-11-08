/** Cleanup local numbering test: remove ZZ-TEST-NUMBERING rows + restore PK counter. */
import { db } from '../src/lib/db'

async function main() {
  const del = await db.riwayatPotongKertas.deleteMany({ where: { namaCustomer: 'ZZ-TEST-NUMBERING' } })
  console.log('deleted test records:', del.count)
  const restored = await db.documentCounter.update({
    where: { key: 'riwayatPotongKertas|PK|user-admin' },
    data: { lastNum: 51 },
  })
  console.log('counter restored to:', restored.lastNum)
  const pk = await db.riwayatPotongKertas.count()
  console.log('PK records now:', pk)
}

main().catch(e => { console.error(e); process.exit(1) })
