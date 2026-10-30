import { db } from '@/lib/db'
async function main() {
  const p = await db.subscriptionPlan.findFirst({ where: { slug: 'pro' } })
  console.log(p?.id)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
