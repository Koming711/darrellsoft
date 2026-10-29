import { db } from '@/lib/db'
async function main() {
  const old = await db.grup.findUnique({ where: { kode: 'GRP-TEST' } })
  if (old) { await db.grupAnggota.deleteMany({ where: { grupId: old.id } }); await db.grup.delete({ where: { id: old.id } }) }
  const plan = await db.subscriptionPlan.findFirst({ where: { slug: 'pro' } })
  const g = await db.grup.create({ data: { nama: 'PT Contoh Percetakan', kode: 'GRP-TEST', planId: plan?.id, ownerUserId: 'user-admin', status: 'aktif' } })
  await db.grupAnggota.create({ data: { grupId: g.id, memberId: 'user-admin', tipeAnggota: 'pengguna', peran: 'owner', status: 'aktif', izin: '[]', namaLengkap: 'Administrator' } })
  console.log('GRUP UJI OK: ' + g.id)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
