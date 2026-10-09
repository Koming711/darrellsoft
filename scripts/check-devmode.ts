import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const s = await db.setting.findUnique({ where: { key: 'otp_dev_mode' } })
  console.log('otp_dev_mode:', JSON.stringify(s))
}
main().finally(() => db.$disconnect())
