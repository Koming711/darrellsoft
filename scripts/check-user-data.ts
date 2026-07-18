import { db } from '../src/lib/db'

async function main() {
  // Check what each user has
  const users = await db.pengguna.findMany({ select: { id: true, username: true, role: true, namaLengkap: true } })
  console.log('Users:')
  for (const u of users) {
    const invoices = await db.documentHistory.findMany({
      where: { docType: 'invoice', userId: u.id },
      select: { id: true, dataJson: true }
    })
    let withDp = 0
    for (const inv of invoices) {
      try {
        const d = JSON.parse(inv.dataJson)
        if ((d.dp || 0) > 0) withDp++
      } catch {}
    }
    console.log(`  ${u.username} (${u.role}) [id=${u.id}]: ${invoices.length} invoice, ${withDp} with DP`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
