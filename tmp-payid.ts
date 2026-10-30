import { db } from '@/lib/db'
async function main() {
  const p = await db.subscriptionPayment.findFirst({ where: { userId: process.env.CALON_ID }, orderBy: { createdAt: 'desc' } })
  console.log(p?.id)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
