import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // === MASTER HARGA KERTAS ===
  const papers = [
    { name: 'HVS', grammage: 70, width: 21.0, height: 29.7, pricePerRim: 45000 },
    { name: 'HVS', grammage: 80, width: 21.0, height: 29.7, pricePerRim: 52000 },
    { name: 'Art Paper', grammage: 120, width: 31.5, height: 47.0, pricePerRim: 95000 },
    { name: 'Art Paper', grammage: 150, width: 31.5, height: 47.0, pricePerRim: 115000 },
    { name: 'Art Paper', grammage: 260, width: 31.5, height: 47.0, pricePerRim: 185000 },
    { name: 'Art Carton', grammage: 230, width: 31.5, height: 47.0, pricePerRim: 165000 },
    { name: 'Art Carton', grammage: 260, width: 31.5, height: 47.0, pricePerRim: 195000 },
    { name: 'Art Carton', grammage: 310, width: 31.5, height: 47.0, pricePerRim: 235000 },
    { name: 'Ivory', grammage: 210, width: 79.0, height: 109.0, pricePerRim: 1356233 },
    { name: 'Ivory', grammage: 300, width: 79.0, height: 109.0, pricePerRim: 1937475 },
    { name: 'Duplex', grammage: 250, width: 70.0, height: 100.0, pricePerRim: 350000 },
    { name: 'FBB', grammage: 250, width: 70.0, height: 100.0, pricePerRim: 380000 },
    { name: 'Kraft', grammage: 150, width: 70.0, height: 100.0, pricePerRim: 280000 },
    { name: 'Kraft', grammage: 200, width: 70.0, height: 100.0, pricePerRim: 340000 },
  ]

  for (const paper of papers) {
    await prisma.paper.upsert({
      where: { id: `${paper.name.toLowerCase().replace(/\s+/g, '-')}-${paper.grammage}-seed` },
      update: paper,
      create: { ...paper, id: `${paper.name.toLowerCase().replace(/\s+/g, '-')}-${paper.grammage}-seed` },
    })
  }
  console.log(`✅ Seeded ${papers.length} papers`)

  // === MASTER ONGKOS CETAK ===
  const printingCosts = [
    { machineName: 'SM 52', grammage: 0, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 65000, specialColorPrice: 80000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 60, platePricePerSheet: 16500 },
    { machineName: 'SM 52', grammage: 150, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 75000, specialColorPrice: 90000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 70, platePricePerSheet: 16500 },
    { machineName: 'SM 52', grammage: 260, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 85000, specialColorPrice: 100000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 80, platePricePerSheet: 16500 },
    { machineName: 'SM 74', grammage: 0, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 130000, specialColorPrice: 160000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 120, platePricePerSheet: 33000 },
    { machineName: 'SM 74', grammage: 150, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 150000, specialColorPrice: 180000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 140, platePricePerSheet: 33000 },
    { machineName: 'SM 74', grammage: 260, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 170000, specialColorPrice: 200000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 160, platePricePerSheet: 33000 },
    { machineName: 'SM 102', grammage: 0, printAreaWidth: 102, printAreaHeight: 72, pricePerColor: 250000, specialColorPrice: 300000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 230, platePricePerSheet: 55000 },
    { machineName: 'Digital', grammage: 0, printAreaWidth: 33, printAreaHeight: 48, pricePerColor: 1500, specialColorPrice: 3000, minimumPrintQuantity: 1, priceAboveMinimumPerSheet: 1200, platePricePerSheet: 0 },
  ]

  for (const cost of printingCosts) {
    await prisma.printingCost.upsert({
      where: { id: `pc-${cost.machineName.toLowerCase().replace(/\s+/g, '-')}-${cost.grammage}-seed` },
      update: cost,
      create: { ...cost, id: `pc-${cost.machineName.toLowerCase().replace(/\s+/g, '-')}-${cost.grammage}-seed` },
    })
  }
  console.log(`✅ Seeded ${printingCosts.length} printing costs`)

  // === MASTER FINISHING ===
  const finishings = [
    { name: 'Laminating Glossy', minimumSheets: 0, minimumPrice: 250000, additionalPrice: 0, pricePerCm: 0.18 },
    { name: 'Laminating Doff', minimumSheets: 0, minimumPrice: 400000, additionalPrice: 0, pricePerCm: 0.2 },
    { name: 'Laminating Soft', minimumSheets: 0, minimumPrice: 350000, additionalPrice: 0, pricePerCm: 0.19 },
    { name: 'Pond / Bending', minimumSheets: 1000, minimumPrice: 70000, additionalPrice: 40, pricePerCm: 0 },
    { name: 'UV Spot Varnish', minimumSheets: 500, minimumPrice: 500000, additionalPrice: 100, pricePerCm: 0.5 },
    { name: 'UV Full Varnish', minimumSheets: 500, minimumPrice: 400000, additionalPrice: 80, pricePerCm: 0.4 },
    { name: 'Emboss', minimumSheets: 500, minimumPrice: 300000, additionalPrice: 60, pricePerCm: 0.45 },
    { name: 'Deboss', minimumSheets: 500, minimumPrice: 300000, additionalPrice: 60, pricePerCm: 0.45 },
    { name: 'Hot Print Gold', minimumSheets: 500, minimumPrice: 500000, additionalPrice: 100, pricePerCm: 0.6 },
    { name: 'Hot Print Silver', minimumSheets: 500, minimumPrice: 500000, additionalPrice: 100, pricePerCm: 0.6 },
    { name: 'Potong / Cutting', minimumSheets: 1, minimumPrice: 50000, additionalPrice: 0, pricePerCm: 0.05 },
    { name: 'Folding / Lipat', minimumSheets: 100, minimumPrice: 3000, additionalPrice: 50, pricePerCm: 0.15 },
    { name: 'Jahit / Spine', minimumSheets: 25, minimumPrice: 5000, additionalPrice: 100, pricePerCm: 0.3 },
    { name: 'Jilid Spiral', minimumSheets: 1, minimumPrice: 5000, additionalPrice: 200, pricePerCm: 0.25 },
    { name: 'Jilid Perfect Binding', minimumSheets: 50, minimumPrice: 15000, additionalPrice: 300, pricePerCm: 0.4 },
  ]

  for (const finishing of finishings) {
    await prisma.finishing.upsert({
      where: { id: `fin-${finishing.name.toLowerCase().replace(/[\s/]+/g, '-')}-seed` },
      update: finishing,
      create: { ...finishing, id: `fin-${finishing.name.toLowerCase().replace(/[\s/]+/g, '-')}-seed` },
    })
  }
  console.log(`✅ Seeded ${finishings.length} finishings`)

  // === MASTER CUSTOMER ===
  const customers = [
    { name: 'Budi Santoso', companyName: 'PT. Maju Jaya', address: 'Jl. Raya Industri No. 45, Surabaya', phone: '081234567890', email: 'budi@majujaya.co.id' },
    { name: 'Siti Rahayu', companyName: 'CV. Berkah Abadi', address: 'Jl. Gatot Subroto No. 12, Jakarta', phone: '082345678901', email: 'siti@berkahabadi.com' },
    { name: 'Ahmad Wijaya', companyName: 'UD. Sumber Rejeki', address: 'Jl. Diponegoro No. 78, Bandung', phone: '083456789012', email: 'ahmad@sumberrejeki.co.id' },
    { name: 'Dewi Lestari', companyName: 'PT. Karya Mandiri', address: 'Jl. Ahmad Yani No. 33, Semarang', phone: '084567890123', email: 'dewi@karyamandiri.co.id' },
    { name: 'Rudi Hartono', companyName: 'CV. Prima Cetak', address: 'Jl. Pahlawan No. 15, Yogyakarta', phone: '085678901234', email: 'rudi@primacetak.com' },
    { name: 'Maya Putri', companyName: 'PT. Sentosa Grafika', address: 'Jl. Sudirman No. 99, Malang', phone: '086789012345', email: 'maya@sentosagrafika.co.id' },
    { name: 'Hendra Kusuma', companyName: 'Toko Cetak Nusantara', address: 'Jl. Merdeka No. 20, Medan', phone: '087890123456', email: 'hendra@cetaknusantara.com' },
    { name: 'Linda Permata', companyName: 'PT. Gemilang Printing', address: 'Jl. Asia Afrika No. 55, Bandung', phone: '088901234567', email: 'linda@gemilangprinting.co.id' },
  ]

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { id: `${customer.name.toLowerCase().replace(/[\s,.]+/g, '-')}-seed` },
      update: customer,
      create: { ...customer, id: `${customer.name.toLowerCase().replace(/[\s,.]+/g, '-')}-seed` },
    })
  }
  console.log(`✅ Seeded ${customers.length} customers`)

  // === DEFAULT SETTINGS ===
  const settings = [
    { key: 'appName', value: 'Sistem Cetak' },
    { key: 'companyName', value: 'Percetakan' },
    { key: 'currency', value: 'IDR' },
    { key: 'defaultProfitPercent', value: '10' },
    { key: 'packingCostDefault', value: '5000' },
    { key: 'shippingCostDefault', value: '15000' },
  ]

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    })
  }
  console.log(`✅ Seeded ${settings.length} settings`)
  console.log('🎉 Database seeding completed!')
}

main()
  .catch((e) => { console.error('❌ Seed error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
