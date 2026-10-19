import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const invoices = await db.subscriptionInvoice.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, invoiceNumber: true, userId: true, status: true },
  })
  console.log('INVOICES:', JSON.stringify(invoices))
  const payments = await db.subscriptionPayment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, invoiceId: true, status: true, proofFileName: true, proofFileUrl: true },
  })
  console.log('PAYMENTS:', JSON.stringify(payments))
  await db.$disconnect()
}
main()
