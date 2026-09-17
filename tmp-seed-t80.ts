import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const before = await db.riwayatCetakan.count()
  console.log('Baseline RiwayatCetakan:', before)
  const row = await db.riwayatCetakan.create({
    data: {
      nomorUrut: 'TES-A5L-80',
      type: 'hitung_cetakan',
      printName: 'Katalog Produk A5L',
      customerName: 'CV Maju Jaya Printing',
      paperName: 'Art Paper',
      paperGrammage: '150',
      paperLength: '65',
      paperWidth: '100',
      cutWidth: '32',
      cutHeight: '48',
      quantity: '1000',
      jumlahPesanan: '1000',
      berapaMata: '2',
      setelanKertas: '0',
      warna: '4',
      warnaKhusus: '0',
      machineName: 'SORM',
      hargaPlat: 0,
      ongkosCetak: 500000,
      ongkosCetakDetail: '',
      machineName2: '',
      warna2: '',
      warnaKhusus2: '',
      hargaPlat2: 0,
      ongkosCetak2: 0,
      ongkosCetak2Detail: '',
      totalPaperPrice: 800000,
      pricePerSheet: 800,
      finishingNames: 'Laminating',
      finishingBreakdown: 'Laminating: Glossy = Rp 150000',
      finishingCost: 150000,
      packingCost: 50000,
      shippingCost: 75000,
      otherCost: 30000,
      otherCost2: 0,
      otherCostLabel: '',
      otherCostLabel2: '',
      glueCost: 0,
      glueBorongan: 0,
      glueLengthCm: '',
      glueCostPerCm: '',
      subTotal: 1605000,
      profitPercent: 10,
      profitAmount: 160500,
      grandTotal: 1765500,
      userId: 'user-superadmin',
    },
  })
  console.log('Created:', row.id)
  const after = await db.riwayatCetakan.count()
  console.log('After:', after)
}
main().finally(() => db.$disconnect())
