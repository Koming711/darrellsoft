import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const tables = await db.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%aper%' OR name LIKE '%utting%' OR name LIKE '%iwayatPotong%') ORDER BY name`)
console.log(tables.map(t => t.name).join('\n'))
await db.$disconnect()
