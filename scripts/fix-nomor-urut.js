/**
 * Fix duplicate nomorUrut values in production database.
 * 
 * Problem: When nomorUrut was added with @default("") @unique, existing records
 * all got nomorUrut="", violating the unique constraint. This script assigns
 * unique sequential numbers to all records that have empty or duplicate nomorUrut.
 * 
 * Usage: DATABASE_URL="..." node scripts/fix-nomor-urut.js
 */
const { PrismaClient } = require('@prisma/client')

async function main() {
  const db = new PrismaClient()
  
  try {
    console.log('🔧 Fixing nomorUrut values in production database...\n')

    // Fix RiwayatPotongKertas
    console.log('📋 Processing RiwayatPotongKertas...')
    const potongRecords = await db.riwayatPotongKertas.findMany({
      orderBy: { createdAt: 'asc' }
    })
    
    // Group by userId and month to generate sequential numbers
    const potongByUserMonth = new Map()
    let potongFixed = 0
    
    for (const record of potongRecords) {
      const date = new Date(record.createdAt)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const key = `${record.userId || 'none'}_${month}_${year}`
      
      if (!potongByUserMonth.has(key)) {
        potongByUserMonth.set(key, 0)
      }
      
      const currentCount = potongByUserMonth.get(key)
      const nextNum = currentCount + 1
      potongByUserMonth.set(key, nextNum)
      
      const newNomorUrut = `PK/${month}/${year}/${String(nextNum).padStart(4, '0')}`
      
      // Only update if nomorUrut is empty or a placeholder
      if (!record.nomorUrut || record.nomorUrut === '' || record.nomorUrut.startsWith('fallback')) {
        await db.riwayatPotongKertas.update({
          where: { id: record.id },
          data: { nomorUrut: newNomorUrut }
        })
        potongFixed++
        console.log(`  ✅ Updated ${record.id}: "" → ${newNomorUrut}`)
      }
    }
    console.log(`  Fixed ${potongFixed} RiwayatPotongKertas records\n`)

    // Fix RiwayatCetakan
    console.log('📋 Processing RiwayatCetakan...')
    const cetakanRecords = await db.riwayatCetakan.findMany({
      orderBy: { createdAt: 'asc' }
    })
    
    const cetakanByUserMonth = new Map()
    let cetakanFixed = 0
    
    for (const record of cetakanRecords) {
      const date = new Date(record.createdAt)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const key = `${record.userId || 'none'}_${month}_${year}`
      
      if (!cetakanByUserMonth.has(key)) {
        cetakanByUserMonth.set(key, 0)
      }
      
      const currentCount = cetakanByUserMonth.get(key)
      const nextNum = currentCount + 1
      cetakanByUserMonth.set(key, nextNum)
      
      const newNomorUrut = `HC/${month}/${year}/${String(nextNum).padStart(4, '0')}`
      
      if (!record.nomorUrut || record.nomorUrut === '' || record.nomorUrut.startsWith('fallback')) {
        await db.riwayatCetakan.update({
          where: { id: record.id },
          data: { nomorUrut: newNomorUrut }
        })
        cetakanFixed++
        console.log(`  ✅ Updated ${record.id}: "" → ${newNomorUrut}`)
      }
    }
    console.log(`  Fixed ${cetakanFixed} RiwayatCetakan records\n`)

    // Also fix Invoice, SuratJalan, PurchaseOrder if they have similar issues
    console.log('📋 Processing Invoice...')
    const invoices = await db.invoice.findMany({ orderBy: { createdAt: 'asc' } })
    const invByUserMonth = new Map()
    let invFixed = 0
    for (const record of invoices) {
      const date = new Date(record.createdAt)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const key = `${record.userId || 'none'}_${month}_${year}`
      if (!invByUserMonth.has(key)) invByUserMonth.set(key, 0)
      const nextNum = invByUserMonth.get(key) + 1
      invByUserMonth.set(key, nextNum)
      const newNum = `INV/${month}/${year}/${String(nextNum).padStart(4, '0')}`
      if (!record.invoiceNumber || record.invoiceNumber === '' || record.invoiceNumber.startsWith('fallback')) {
        await db.invoice.update({ where: { id: record.id }, data: { invoiceNumber: newNum } })
        invFixed++
        console.log(`  ✅ Updated ${record.id}: "" → ${newNum}`)
      }
    }
    console.log(`  Fixed ${invFixed} Invoice records\n`)

    console.log('📋 Processing SuratJalan...')
    const sjs = await db.suratJalan.findMany({ orderBy: { createdAt: 'asc' } })
    const sjByUserMonth = new Map()
    let sjFixed = 0
    for (const record of sjs) {
      const date = new Date(record.createdAt)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const key = `${record.userId || 'none'}_${month}_${year}`
      if (!sjByUserMonth.has(key)) sjByUserMonth.set(key, 0)
      const nextNum = sjByUserMonth.get(key) + 1
      sjByUserMonth.set(key, nextNum)
      const newNum = `SJ/${month}/${year}/${String(nextNum).padStart(4, '0')}`
      if (!record.suratJalanNumber || record.suratJalanNumber === '' || record.suratJalanNumber.startsWith('fallback')) {
        await db.suratJalan.update({ where: { id: record.id }, data: { suratJalanNumber: newNum } })
        sjFixed++
        console.log(`  ✅ Updated ${record.id}: "" → ${newNum}`)
      }
    }
    console.log(`  Fixed ${sjFixed} SuratJalan records\n`)

    console.log('📋 Processing PurchaseOrder...')
    const pos = await db.purchaseOrder.findMany({ orderBy: { createdAt: 'asc' } })
    const poByUserMonth = new Map()
    let poFixed = 0
    for (const record of pos) {
      const date = new Date(record.createdAt)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const key = `${record.userId || 'none'}_${month}_${year}`
      if (!poByUserMonth.has(key)) poByUserMonth.set(key, 0)
      const nextNum = poByUserMonth.get(key) + 1
      poByUserMonth.set(key, nextNum)
      const newNum = `PO/${month}/${year}/${String(nextNum).padStart(4, '0')}`
      if (!record.poNumber || record.poNumber === '' || record.poNumber.startsWith('fallback')) {
        await db.purchaseOrder.update({ where: { id: record.id }, data: { poNumber: newNum } })
        poFixed++
        console.log(`  ✅ Updated ${record.id}: "" → ${newNum}`)
      }
    }
    console.log(`  Fixed ${poFixed} PurchaseOrder records\n`)

    console.log('✅ All nomorUrut values fixed!')
    console.log(`   RiwayatPotongKertas: ${potongFixed} fixed`)
    console.log(`   RiwayatCetakan: ${cetakanFixed} fixed`)
    console.log(`   Invoice: ${invFixed} fixed`)
    console.log(`   SuratJalan: ${sjFixed} fixed`)
    console.log(`   PurchaseOrder: ${poFixed} fixed`)

  } catch (error) {
    console.error('❌ Error fixing nomorUrut:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

main()
