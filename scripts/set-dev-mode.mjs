import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
await prisma.setting.upsert({
  where: { key: 'otp_dev_mode' },
  update: { value: 'true' },
  create: { key: 'otp_dev_mode', value: 'true' },
})
const s = await prisma.setting.findUnique({ where: { key: 'otp_dev_mode' } })
console.log('otp_dev_mode =', s?.value)
const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Otp%'")
console.log('OTP tables:', JSON.stringify(tables))
await prisma.$disconnect()
