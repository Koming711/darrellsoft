import { PrismaClient, Prisma } from '@prisma/client'

const db = new PrismaClient()

// Helper: tanggal date-only disimpan pukul 12:00 UTC
function day(offsetDays = 0): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  d.setUTCHours(12, 0, 0, 0)
  return d
}
function firstDayOfMonth(monthsAgo = 0): Date {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  d.setUTCDate(1)
  d.setUTCHours(12, 0, 0, 0)
  return d
}

const dec = (v: number | string) => new Prisma.Decimal(v)

async function main() {
  console.log('Seeding Darrellsoft data...')

  // Bersihkan (urutan menghormati FK)
  await db.invoiceItem.deleteMany()
  await db.invoice.deleteMany()
  await db.customerProductPrice.deleteMany()
  await db.product.deleteMany()
  await db.customer.deleteMany()
  await db.user.deleteMany()
  await db.company.deleteMany()

  // ============ Perusahaan 1: Darrell Group ============
  const darrell = await db.company.create({ data: { name: 'Darrell Group' } })

  await db.user.createMany({
    data: [
      { email: 'owner@darrellsoft.id', name: 'Budi Santoso', role: 'OWNER', companyId: darrell.id },
      { email: 'admin@darrellsoft.id', name: 'Sari Dewi', role: 'ADMIN', companyId: darrell.id },
      { email: 'sales@darrellsoft.id', name: 'Andi Pratama', role: 'SALES', companyId: darrell.id },
      { email: 'staff@darrellsoft.id', name: 'Rina Wulandari', role: 'STAFF', companyId: darrell.id },
    ],
  })

  const tokoAmanah = await db.customer.create({ data: { code: 'CUST-001', name: 'Toko Amanah', phone: '0812-3456-7801', email: 'amanah@toko.id', address: 'Jl. Pasar Baru No. 12, Jakarta', companyId: darrell.id } })
  const tokoBerkah = await db.customer.create({ data: { code: 'CUST-002', name: 'Toko Berkah Jaya', phone: '0812-3456-7802', email: 'berkah@toko.id', address: 'Jl. Sudirman No. 45, Bandung', companyId: darrell.id } })
  const cvCahaya = await db.customer.create({ data: { code: 'CUST-003', name: 'CV Cahaya Packs', phone: '0812-3456-7803', address: 'Kawasan Industri Blok C-8, Bekasi', companyId: darrell.id } })
  const tokoDelta = await db.customer.create({ data: { code: 'CUST-004', name: 'Toko Delta Mart', phone: '0812-3456-7804', address: 'Jl. Merdeka No. 9, Semarang', companyId: darrell.id } })

  const bowl = await db.product.create({ data: { code: 'PRD-001', name: 'Paper Bowl 500 ml', unit: 'pcs', sellingPrice: dec(5000), costPrice: dec(3200), stock: 12500, companyId: darrell.id } })
  const cup = await db.product.create({ data: { code: 'PRD-002', name: 'Paper Cup 250 ml', unit: 'pcs', sellingPrice: dec(3500), costPrice: dec(2100), stock: 20000, companyId: darrell.id } })
  const lunchBox = await db.product.create({ data: { code: 'PRD-003', name: 'Paper Lunch Box 750 ml', unit: 'pcs', sellingPrice: dec(7000), costPrice: dec(4600), stock: 8000, companyId: darrell.id } })
  const straw = await db.product.create({ data: { code: 'PRD-004', name: 'Sedotan Kertas 8 mm', unit: 'pack', sellingPrice: dec(8000), costPrice: dec(4500), stock: 5000, companyId: darrell.id } })
  const bag = await db.product.create({ data: { code: 'PRD-005', name: 'Paper Bag Medium', unit: 'pcs', sellingPrice: dec(2500), costPrice: dec(1500), stock: 9500, companyId: darrell.id } })

  // Harga khusus customer (aktif sekarang)
  await db.customerProductPrice.createMany({
    data: [
      { customerId: tokoAmanah.id, productId: bowl.id, sellingPrice: dec(4800), unit: 'pcs', validFrom: firstDayOfMonth(2), isActive: true, note: 'Kontrak harga Q — volume 500 pcs/bulan', companyId: darrell.id },
      { customerId: tokoBerkah.id, productId: bowl.id, sellingPrice: dec(4500), unit: 'pcs', validFrom: firstDayOfMonth(1), isActive: true, note: 'Kesepakatan direksi', companyId: darrell.id },
      { customerId: tokoAmanah.id, productId: cup.id, sellingPrice: dec(3200), unit: 'pcs', validFrom: firstDayOfMonth(1), isActive: true, companyId: darrell.id },
      { customerId: cvCahaya.id, productId: lunchBox.id, sellingPrice: dec(6500), unit: 'pcs', validFrom: firstDayOfMonth(3), validUntil: day(-1), isActive: true, note: 'Kontrak lama (sudah berakhir)', companyId: darrell.id },
    ],
  })

  // Invoice contoh — harga snapshot saat transaksi
  const inv1 = await db.invoice.create({
    data: {
      number: 'INV/20250101/001', // akan tergantikan format saat runtime; ini hanya seed
      customerId: tokoAmanah.id,
      invoiceDate: day(-5),
      dueDate: day(25),
      status: 'PAID',
      subtotal: dec(4800000),
      discount: dec(100000),
      taxPercent: dec(0),
      taxAmount: dec(0),
      total: dec(4700000),
      amountPaid: dec(4700000),
      note: 'Pembayaran lunas via transfer',
      companyId: darrell.id,
      items: {
        create: [
          { productId: bowl.id, productCode: bowl.code, productName: bowl.name, unit: 'pcs', quantity: dec(800), unitPrice: dec(4800), costPrice: dec(3200), priceSource: 'CUSTOMER_PRICE', subtotal: dec(3840000) },
          { productId: cup.id, productCode: cup.code, productName: cup.name, unit: 'pcs', quantity: dec(300), unitPrice: dec(3200), costPrice: dec(2100), priceSource: 'CUSTOMER_PRICE', subtotal: dec(960000) },
        ],
      },
    },
  })

  await db.invoice.create({
    data: {
      number: 'INV/20250102/001',
      customerId: cvCahaya.id,
      invoiceDate: day(-2),
      dueDate: day(28),
      status: 'PARTIAL',
      subtotal: dec(1400000),
      discount: dec(0),
      taxPercent: dec(11),
      taxAmount: dec(154000),
      total: dec(1554000),
      amountPaid: dec(500000),
      companyId: darrell.id,
      items: {
        create: [
          { productId: lunchBox.id, productCode: lunchBox.code, productName: lunchBox.name, unit: 'pcs', quantity: dec(200), unitPrice: dec(7000), costPrice: dec(4600), priceSource: 'STANDARD', subtotal: dec(1400000) },
        ],
      },
    },
  })

  // ============ Perusahaan 2: PT Mitra Sejahtera (uji isolasi data) ============
  const mitra = await db.company.create({ data: { name: 'PT Mitra Sejahtera' } })

  await db.user.createMany({
    data: [
      { email: 'owner@mitrasejahtera.id', name: 'Hendra Gunawan', role: 'OWNER', companyId: mitra.id },
      { email: 'sales@mitrasejahtera.id', name: 'Lina Marlina', role: 'SALES', companyId: mitra.id },
    ],
  })

  const mToko = await db.customer.create({ data: { code: 'MS-001', name: 'Warung Segar Rasa', phone: '0821-1111-2222', address: 'Jl. Kenanga No. 3, Surabaya', companyId: mitra.id } })
  const mCup = await db.product.create({ data: { code: 'MS-P01', name: 'Paper Cup 9 oz', unit: 'pcs', sellingPrice: dec(2800), costPrice: dec(1700), stock: 15000, companyId: mitra.id } })
  await db.product.create({ data: { code: 'MS-P02', name: 'Tutup Cup Dompet', unit: 'pcs', sellingPrice: dec(600), costPrice: dec(350), stock: 30000, companyId: mitra.id } })
  await db.customerProductPrice.create({
    data: { customerId: mToko.id, productId: mCup.id, sellingPrice: dec(2600), unit: 'pcs', validFrom: firstDayOfMonth(1), isActive: true, companyId: mitra.id },
  })
  await db.invoice.create({
    data: {
      number: 'INV-MS/20250103/001',
      customerId: mToko.id,
      invoiceDate: day(-1),
      dueDate: day(14),
      status: 'UNPAID',
      subtotal: dec(1300000),
      discount: dec(0),
      taxPercent: dec(0),
      taxAmount: dec(0),
      total: dec(1300000),
      amountPaid: dec(0),
      companyId: mitra.id,
      items: {
        create: [
          { productId: mCup.id, productCode: mCup.code, productName: mCup.name, unit: 'pcs', quantity: dec(500), unitPrice: dec(2600), costPrice: dec(1700), priceSource: 'CUSTOMER_PRICE', subtotal: dec(1300000) },
        ],
      },
    },
  })

  console.log(`Seeded: 2 companies, 6 users, 5 customers (DG), 7 products, 5 special prices, 3 invoices.`)
  console.log('Darrell company id:', darrell.id)
  console.log('Invoice 1 id:', inv1.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
