import { db } from '@/lib/db'

// In-memory flag to avoid repeated seeding within the same serverless instance
let globalSeedChecked = false
let dbPushDone = false

// Detect if we're on PostgreSQL
function isPostgreSQL(): boolean {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgres') || url.startsWith('postgresql')
}

// Create tables via raw SQL if they don't exist (works in Vercel serverless)
async function ensureTablesExist(): Promise<void> {
  if (dbPushDone) return
  dbPushDone = true

  const pg = isPostgreSQL()

  if (pg) {
    // PostgreSQL: use pg-specific syntax (DOUBLE PRECISION, TIMESTAMP(3), ADD COLUMN IF NOT EXISTS)
    try {
      await db.$queryRaw`SELECT 1 FROM "Pengguna" LIMIT 1`
      console.log('✅ Database tables already exist')
      // Even if tables exist, run migration for missing columns
      await migrateExistingTablesPg()
      return
    } catch {
      console.log('📦 Tables not found, creating via raw SQL...')
    }

    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Pengguna" ("id" TEXT NOT NULL PRIMARY KEY, "namaLengkap" TEXT NOT NULL, "nomorHP" TEXT NOT NULL, "email" TEXT NOT NULL, "username" TEXT NOT NULL UNIQUE, "password" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'user', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "validUntil" TIMESTAMP(3));
        CREATE TABLE IF NOT EXISTS "Post" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "content" TEXT, "published" BOOLEAN NOT NULL DEFAULT false, "authorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Customer" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "companyName" TEXT, "address" TEXT, "phone" TEXT, "email" TEXT, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Paper" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "grammage" INTEGER NOT NULL, "width" DOUBLE PRECISION NOT NULL, "height" DOUBLE PRECISION NOT NULL, "pricePerRim" DOUBLE PRECISION NOT NULL, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "PrintingCost" ("id" TEXT NOT NULL PRIMARY KEY, "machineName" TEXT NOT NULL, "grammage" INTEGER NOT NULL, "printAreaWidth" DOUBLE PRECISION NOT NULL, "printAreaHeight" DOUBLE PRECISION NOT NULL, "pricePerColor" DOUBLE PRECISION NOT NULL, "specialColorPrice" DOUBLE PRECISION NOT NULL, "minimumPrintQuantity" INTEGER NOT NULL, "priceAboveMinimumPerSheet" DOUBLE PRECISION NOT NULL, "platePricePerSheet" DOUBLE PRECISION NOT NULL, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Finishing" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "minimumSheets" INTEGER NOT NULL, "minimumPrice" DOUBLE PRECISION NOT NULL, "additionalPrice" DOUBLE PRECISION NOT NULL, "pricePerCm" DOUBLE PRECISION NOT NULL, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "CalonPembeli" ("id" TEXT NOT NULL PRIMARY KEY, "nama" TEXT NOT NULL, "nomorHP" TEXT NOT NULL, "email" TEXT NOT NULL, "alamat" TEXT NOT NULL, "catatan" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'baru', "role" TEXT NOT NULL DEFAULT 'demo', "expiredDate" TIMESTAMP(3), "username" TEXT, "password" TEXT, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Pembeli" ("id" TEXT NOT NULL PRIMARY KEY, "nama" TEXT NOT NULL, "nomorHP" TEXT NOT NULL, "email" TEXT NOT NULL, "alamat" TEXT NOT NULL, "catatan" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'demo', "expiredDate" TIMESTAMP(3), "userId" TEXT, "penggunaId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Setting" ("id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "value" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "RiwayatCetakan" ("id" TEXT NOT NULL PRIMARY KEY, "type" TEXT NOT NULL DEFAULT 'hitung_cetakan', "printName" TEXT NOT NULL, "customerName" TEXT NOT NULL DEFAULT '', "paperName" TEXT NOT NULL, "paperGrammage" TEXT NOT NULL, "paperLength" TEXT NOT NULL, "paperWidth" TEXT NOT NULL, "cutWidth" TEXT NOT NULL, "cutHeight" TEXT NOT NULL, "quantity" TEXT NOT NULL, "jumlahPesanan" TEXT NOT NULL DEFAULT '', "berapaMata" TEXT NOT NULL DEFAULT '', "warna" TEXT NOT NULL, "warnaKhusus" TEXT NOT NULL, "machineName" TEXT NOT NULL, "hargaPlat" DOUBLE PRECISION NOT NULL, "ongkosCetak" DOUBLE PRECISION NOT NULL, "ongkosCetakDetail" TEXT NOT NULL, "machineName2" TEXT NOT NULL DEFAULT '', "warna2" TEXT NOT NULL DEFAULT '', "warnaKhusus2" TEXT NOT NULL DEFAULT '', "hargaPlat2" DOUBLE PRECISION NOT NULL DEFAULT 0, "ongkosCetak2" DOUBLE PRECISION NOT NULL DEFAULT 0, "ongkosCetak2Detail" TEXT NOT NULL DEFAULT '', "totalPaperPrice" DOUBLE PRECISION NOT NULL, "pricePerSheet" DOUBLE PRECISION NOT NULL DEFAULT 0, "finishingNames" TEXT NOT NULL, "finishingBreakdown" TEXT NOT NULL, "finishingCost" DOUBLE PRECISION NOT NULL, "packingCost" DOUBLE PRECISION NOT NULL, "shippingCost" DOUBLE PRECISION NOT NULL, "otherCost" DOUBLE PRECISION NOT NULL DEFAULT 0, "otherCost2" DOUBLE PRECISION NOT NULL DEFAULT 0, "otherCostLabel" TEXT NOT NULL DEFAULT '', "otherCostLabel2" TEXT NOT NULL DEFAULT '', "glueLengthCm" TEXT NOT NULL DEFAULT '', "glueCostPerCm" TEXT NOT NULL DEFAULT '', "glueCost" DOUBLE PRECISION NOT NULL DEFAULT 0, "glueBorongan" DOUBLE PRECISION NOT NULL DEFAULT 0, "subTotal" DOUBLE PRECISION NOT NULL, "profitPercent" DOUBLE PRECISION NOT NULL, "profitAmount" DOUBLE PRECISION NOT NULL, "grandTotal" DOUBLE PRECISION NOT NULL, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "RiwayatFinishing" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT '', "namaCetakan" TEXT NOT NULL, "jumlahLembar" TEXT NOT NULL, "lebarCm" TEXT NOT NULL, "tinggiCm" TEXT NOT NULL, "finishingNames" TEXT NOT NULL, "finishingIds" TEXT NOT NULL, "totalCost" DOUBLE PRECISION NOT NULL, "hargaPerLembar" DOUBLE PRECISION NOT NULL DEFAULT 0, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "RiwayatOngkosCetak" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT '', "namaCetakan" TEXT NOT NULL, "machineName" TEXT NOT NULL, "machineId" TEXT NOT NULL DEFAULT '', "jumlahWarna" TEXT NOT NULL, "warnaKhusus" TEXT NOT NULL DEFAULT '0', "hargaPlat" TEXT NOT NULL DEFAULT '0', "jumlahLembar" TEXT NOT NULL, "totalOngkosCetak" DOUBLE PRECISION NOT NULL, "hargaPerLembar" DOUBLE PRECISION NOT NULL DEFAULT 0, "machineId2" TEXT NOT NULL DEFAULT '', "machineName2" TEXT NOT NULL DEFAULT '', "jumlahWarna2" TEXT NOT NULL DEFAULT '0', "warnaKhusus2" TEXT NOT NULL DEFAULT '0', "hargaPlat2" TEXT NOT NULL DEFAULT '0', "totalOngkosCetak2" DOUBLE PRECISION NOT NULL DEFAULT 0, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "RiwayatHargaKertas" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT '', "namaCetakan" TEXT NOT NULL, "paperName" TEXT NOT NULL, "paperId" TEXT NOT NULL DEFAULT '', "grammage" TEXT NOT NULL DEFAULT '0', "paperWidth" TEXT NOT NULL DEFAULT '0', "paperHeight" TEXT NOT NULL DEFAULT '0', "pricePerRim" TEXT NOT NULL DEFAULT '0', "quantity" TEXT NOT NULL DEFAULT '0', "lebarPotong" TEXT NOT NULL DEFAULT '0', "tinggiPotong" TEXT NOT NULL DEFAULT '0', "totalPrice" DOUBLE PRECISION NOT NULL, "costPerPiece" DOUBLE PRECISION NOT NULL DEFAULT 0, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "RiwayatPotongKertas" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT '', "namaCetakan" TEXT NOT NULL, "paperName" TEXT NOT NULL, "paperId" TEXT NOT NULL DEFAULT '', "grammage" TEXT NOT NULL DEFAULT '0', "paperWidth" TEXT NOT NULL DEFAULT '0', "paperHeight" TEXT NOT NULL DEFAULT '0', "cutWidth" TEXT NOT NULL DEFAULT '0', "cutHeight" TEXT NOT NULL DEFAULT '0', "quantity" TEXT NOT NULL DEFAULT '0', "jumlahPesanan" TEXT NOT NULL DEFAULT '', "berapaMata" TEXT NOT NULL DEFAULT '', "setelanKertas" TEXT NOT NULL DEFAULT '0', "sheetsNeeded" TEXT NOT NULL DEFAULT '0', "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0, "pricePerSheet" DOUBLE PRECISION NOT NULL DEFAULT 0, "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0, "strategy" TEXT NOT NULL DEFAULT '', "resultData" TEXT NOT NULL DEFAULT '', "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Invoice" ("id" TEXT NOT NULL PRIMARY KEY, "invoiceNumber" TEXT NOT NULL UNIQUE, "customerName" TEXT NOT NULL, "customerAddress" TEXT NOT NULL DEFAULT '', "customerPhone" TEXT NOT NULL DEFAULT '', "customerEmail" TEXT NOT NULL DEFAULT '', "invoiceDate" TEXT NOT NULL, "dueDate" TEXT NOT NULL DEFAULT '', "items" TEXT NOT NULL, "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0, "discount" DOUBLE PRECISION NOT NULL DEFAULT 0, "tax" DOUBLE PRECISION NOT NULL DEFAULT 0, "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0, "notes" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'draft', "riwayatCetakanId" TEXT, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "Payment" ("id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT NOT NULL UNIQUE, "packageName" TEXT NOT NULL, "packageType" TEXT NOT NULL, "grossAmount" DOUBLE PRECISION NOT NULL, "customerName" TEXT NOT NULL DEFAULT '', "customerEmail" TEXT NOT NULL DEFAULT '', "customerPhone" TEXT NOT NULL DEFAULT '', "paymentType" TEXT, "transactionId" TEXT, "transactionTime" TIMESTAMP(3), "transactionStatus" TEXT NOT NULL DEFAULT 'pending', "fraudStatus" TEXT, "userId" TEXT, "metadata" TEXT NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
        CREATE TABLE IF NOT EXISTS "SuratJalan" ("id" TEXT NOT NULL PRIMARY KEY, "suratJalanNumber" TEXT NOT NULL UNIQUE, "customerName" TEXT NOT NULL, "customerAddress" TEXT NOT NULL DEFAULT '', "customerPhone" TEXT NOT NULL DEFAULT '', "driverName" TEXT NOT NULL DEFAULT '', "vehicleNumber" TEXT NOT NULL DEFAULT '', "deliveryDate" TEXT NOT NULL, "items" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'draft', "invoiceId" TEXT, "riwayatCetakanId" TEXT, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
      `)
      console.log('✅ Database tables created via raw SQL')
    } catch (err: any) {
      console.error('⚠️ Failed to create tables:', err?.message || err)
    }
  } else {
    // SQLite: local dev - tables managed by prisma db push, just verify connection
    try {
      await db.$queryRaw`SELECT 1 FROM "Pengguna" LIMIT 1`
      console.log('✅ SQLite database connected')
    } catch (err: any) {
      console.error('⚠️ SQLite connection error:', err?.message || err)
    }
  }
}

// Migrate existing PostgreSQL tables to add missing columns
async function migrateExistingTablesPg(): Promise<void> {
  const migrations = [
    { table: '"Pembeli"', column: '"penggunaId"', type: 'TEXT' },
    { table: '"RiwayatCetakan"', column: '"type"', type: "TEXT NOT NULL DEFAULT 'hitung_cetakan'" },
    { table: '"RiwayatCetakan"', column: '"warna2"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"warnaKhusus2"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"hargaPlat2"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
    { table: '"RiwayatCetakan"', column: '"pricePerSheet"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
    { table: '"Customer"', column: '"companyName"', type: 'TEXT' },
    // Missing columns for RiwayatCetakan
    { table: '"RiwayatCetakan"', column: '"jumlahPesanan"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"berapaMata"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"otherCost2"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
    { table: '"RiwayatCetakan"', column: '"otherCostLabel"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"otherCostLabel2"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"glueLengthCm"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatCetakan"', column: '"glueCostPerCm"', type: "TEXT NOT NULL DEFAULT ''" },
    // Missing columns for RiwayatOngkosCetak
    { table: '"RiwayatOngkosCetak"', column: '"machineId2"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatOngkosCetak"', column: '"machineName2"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatOngkosCetak"', column: '"jumlahWarna2"', type: "TEXT NOT NULL DEFAULT '0'" },
    { table: '"RiwayatOngkosCetak"', column: '"warnaKhusus2"', type: "TEXT NOT NULL DEFAULT '0'" },
    { table: '"RiwayatOngkosCetak"', column: '"hargaPlat2"', type: "TEXT NOT NULL DEFAULT '0'" },
    { table: '"RiwayatOngkosCetak"', column: '"totalOngkosCetak2"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
    // Missing columns for RiwayatPotongKertas
    { table: '"RiwayatPotongKertas"', column: '"jumlahPesanan"', type: "TEXT NOT NULL DEFAULT ''" },
    { table: '"RiwayatPotongKertas"', column: '"berapaMata"', type: "TEXT NOT NULL DEFAULT ''" },
  ]
  for (const m of migrations) {
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS ${m.column} ${m.type}`
      )
    } catch (err: any) {
      console.warn(`⚠️ Migration ${m.table}.${m.column} failed:`, err?.message)
    }
  }

  // Also create any missing tables (for upgrades from older versions)
  const missingTableChecks = [
    { table: '"RiwayatFinishing"', sql: 'CREATE TABLE IF NOT EXISTS "RiwayatFinishing" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT \'\', "namaCetakan" TEXT NOT NULL, "jumlahLembar" TEXT NOT NULL, "lebarCm" TEXT NOT NULL, "tinggiCm" TEXT NOT NULL, "finishingNames" TEXT NOT NULL, "finishingIds" TEXT NOT NULL, "totalCost" DOUBLE PRECISION NOT NULL, "hargaPerLembar" DOUBLE PRECISION NOT NULL DEFAULT 0, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)' },
    { table: '"RiwayatOngkosCetak"', sql: 'CREATE TABLE IF NOT EXISTS "RiwayatOngkosCetak" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT \'\', "namaCetakan" TEXT NOT NULL, "machineName" TEXT NOT NULL, "machineId" TEXT NOT NULL DEFAULT \'\', "jumlahWarna" TEXT NOT NULL, "warnaKhusus" TEXT NOT NULL DEFAULT \'0\', "hargaPlat" TEXT NOT NULL DEFAULT \'0\', "jumlahLembar" TEXT NOT NULL, "totalOngkosCetak" DOUBLE PRECISION NOT NULL, "hargaPerLembar" DOUBLE PRECISION NOT NULL DEFAULT 0, "machineId2" TEXT NOT NULL DEFAULT \'\', "machineName2" TEXT NOT NULL DEFAULT \'\', "jumlahWarna2" TEXT NOT NULL DEFAULT \'0\', "warnaKhusus2" TEXT NOT NULL DEFAULT \'0\', "hargaPlat2" TEXT NOT NULL DEFAULT \'0\', "totalOngkosCetak2" DOUBLE PRECISION NOT NULL DEFAULT 0, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)' },
    { table: '"RiwayatHargaKertas"', sql: 'CREATE TABLE IF NOT EXISTS "RiwayatHargaKertas" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT \'\', "namaCetakan" TEXT NOT NULL, "paperName" TEXT NOT NULL, "paperId" TEXT NOT NULL DEFAULT \'\', "grammage" TEXT NOT NULL DEFAULT \'0\', "paperWidth" TEXT NOT NULL DEFAULT \'0\', "paperHeight" TEXT NOT NULL DEFAULT \'0\', "pricePerRim" TEXT NOT NULL DEFAULT \'0\', "quantity" TEXT NOT NULL DEFAULT \'0\', "lebarPotong" TEXT NOT NULL DEFAULT \'0\', "tinggiPotong" TEXT NOT NULL DEFAULT \'0\', "totalPrice" DOUBLE PRECISION NOT NULL, "costPerPiece" DOUBLE PRECISION NOT NULL DEFAULT 0, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)' },
    { table: '"RiwayatPotongKertas"', sql: 'CREATE TABLE IF NOT EXISTS "RiwayatPotongKertas" ("id" TEXT NOT NULL PRIMARY KEY, "namaCustomer" TEXT NOT NULL DEFAULT \'\', "namaCetakan" TEXT NOT NULL, "paperName" TEXT NOT NULL, "paperId" TEXT NOT NULL DEFAULT \'\', "grammage" TEXT NOT NULL DEFAULT \'0\', "paperWidth" TEXT NOT NULL DEFAULT \'0\', "paperHeight" TEXT NOT NULL DEFAULT \'0\', "cutWidth" TEXT NOT NULL DEFAULT \'0\', "cutHeight" TEXT NOT NULL DEFAULT \'0\', "quantity" TEXT NOT NULL DEFAULT \'0\', "jumlahPesanan" TEXT NOT NULL DEFAULT \'\', "berapaMata" TEXT NOT NULL DEFAULT \'\', "setelanKertas" TEXT NOT NULL DEFAULT \'0\', "sheetsNeeded" TEXT NOT NULL DEFAULT \'0\', "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0, "pricePerSheet" DOUBLE PRECISION NOT NULL DEFAULT 0, "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0, "strategy" TEXT NOT NULL DEFAULT \'\', "resultData" TEXT NOT NULL DEFAULT \'\', "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)' },
    { table: '"Invoice"', sql: 'CREATE TABLE IF NOT EXISTS "Invoice" ("id" TEXT NOT NULL PRIMARY KEY, "invoiceNumber" TEXT NOT NULL UNIQUE, "customerName" TEXT NOT NULL, "customerAddress" TEXT NOT NULL DEFAULT \'\', "customerPhone" TEXT NOT NULL DEFAULT \'\', "customerEmail" TEXT NOT NULL DEFAULT \'\', "invoiceDate" TEXT NOT NULL, "dueDate" TEXT NOT NULL DEFAULT \'\', "items" TEXT NOT NULL, "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0, "discount" DOUBLE PRECISION NOT NULL DEFAULT 0, "tax" DOUBLE PRECISION NOT NULL DEFAULT 0, "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0, "notes" TEXT NOT NULL DEFAULT \'\', "status" TEXT NOT NULL DEFAULT \'draft\', "riwayatCetakanId" TEXT, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)' },
    { table: '"SuratJalan"', sql: 'CREATE TABLE IF NOT EXISTS "SuratJalan" ("id" TEXT NOT NULL PRIMARY KEY, "suratJalanNumber" TEXT NOT NULL UNIQUE, "customerName" TEXT NOT NULL, "customerAddress" TEXT NOT NULL DEFAULT \'\', "customerPhone" TEXT NOT NULL DEFAULT \'\', "driverName" TEXT NOT NULL DEFAULT \'\', "vehicleNumber" TEXT NOT NULL DEFAULT \'\', "deliveryDate" TEXT NOT NULL, "items" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT \'\', "status" TEXT NOT NULL DEFAULT \'draft\', "invoiceId" TEXT, "riwayatCetakanId" TEXT, "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)' },
  ]

  for (const check of missingTableChecks) {
    try {
      await db.$queryRawUnsafe(`SELECT 1 FROM ${check.table} LIMIT 1`)
    } catch {
      console.log(`📦 Creating missing table ${check.table}...`)
      try {
        await db.$executeRawUnsafe(check.sql)
        console.log(`✅ Created missing table ${check.table}`)
      } catch (err: any) {
        console.warn(`⚠️ Failed to create ${check.table}:`, err?.message)
      }
    }
  }
}

// Allow external reset (e.g., from seed-admin API)
export function _resetSeedFlag() { globalSeedChecked = false }

// Per-user seed tracking (in-memory cache)
const seededUsers = new Set<string>()

// ============================================================
// Default settings — only seeds if settings don't exist in DB.
// role_permissions is NEVER auto-seeded — it's managed exclusively
// by the Hak Akses page to prevent overwriting user-saved permissions.
// ============================================================

const DEFAULT_SETTINGS: Record<string, string> = {
  currency: 'IDR',
  defaultProfitPercent: '10',
  packingCostDefault: '5000',
  shippingCostDefault: '15000',
  demo_days: '7',
  demo_message: 'Selamat datang! Anda sedang menggunakan akun demo.\nUpgrade ke akun penuh untuk mengakses semua fitur.',
  single_device: 'true',
  single_device_message: 'Akun sudah digunakan, silahkan logout di perangkat yang lain',
  auto_logout_min: '10',
  logout_warning_sec: '20',
  profit: '10',
  // Theme colors
  theme_sidebar_color: '#FF8A80',
  theme_bg_color: '#f8fafc',
  theme_popup_color: '#ffffff',
  theme_banner_color: '#ffffff',
  theme_login_color: '#EFF6FF',
  app_language: 'id',
  app_font_size: 'medium',
  // NOTE: role_permissions is NOT seeded here.
  // It is created/managed exclusively by the Hak Akses page save handler.
  // This prevents auto-seed from overwriting user-customized permissions on cold starts.
}

/**
 * Seed per-user master data (Papers, Printing Costs, Finishings, Customers).
 * Each user gets their own independent copy of template data.
 * Only runs once per user (tracked in-memory).
 */
export async function seedUserData(userId: string): Promise<void> {
  if (seededUsers.has(userId)) return

  try {
    // Check if user already has papers (quick check — if yes, they've been seeded)
    const existingPapers = await db.paper.count({ where: { userId } })
    if (existingPapers > 0) {
      seededUsers.add(userId)
      return
    }

    // Check if master data was explicitly cleared (per-user, prevents auto-reseed after clear)
    // This protects existing accounts from being re-seeded
    const clearedFlag = await db.setting.findUnique({ where: { key: `master_cleared_${userId}` } })
    if (clearedFlag?.value === 'true') {
      seededUsers.add(userId)
      return
    }

    console.log(`🌱 Seeding master data for user: ${userId}`)

    // === MASTER HARGA KERTAS ===
    const papers = [
      { name: 'ivory', grammage: 210, width: 79, height: 109, pricePerRim: 1356233 },
      { name: 'ivory', grammage: 300, width: 79, height: 109, pricePerRim: 1937475 },
      { name: 'duplex', grammage: 270, width: 79, height: 109, pricePerRim: 1765000 },
      { name: 'duplek', grammage: 270, width: 90, height: 120, pricePerRim: 2210000 },
      { name: 'ivory', grammage: 210, width: 65, height: 100, pricePerRim: 1078350 },
      { name: 'art karton', grammage: 260, width: 65, height: 100, pricePerRim: 1394250 },
      { name: 'art karton', grammage: 260, width: 79, height: 109, pricePerRim: 1903031 },
    ]

    // === MASTER ONGKOS CETAK ===
    const printingCosts = [
      { machineName: 'sm52', grammage: 0, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 62500, specialColorPrice: 80000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 60, platePricePerSheet: 18000 },
      { machineName: 'sm74', grammage: 0, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 130000, specialColorPrice: 160000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 120, platePricePerSheet: 36000 },
      { machineName: 'oliver 58', grammage: 150, printAreaWidth: 58, printAreaHeight: 44, pricePerColor: 100000, specialColorPrice: 150000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 70, platePricePerSheet: 20000 },
    ]

    // === MASTER FINISHING ===
    const finishings = [
      { name: 'laminating doff', minimumSheets: 0, minimumPrice: 180000, additionalPrice: 0, pricePerCm: 0.18 },
      { name: 'pond', minimumSheets: 1000, minimumPrice: 75000, additionalPrice: 40, pricePerCm: 0 },
      { name: 'laminating glossy', minimumSheets: 0, minimumPrice: 150000, additionalPrice: 0, pricePerCm: 0.16 },
      { name: 'spot uv', minimumSheets: 0, minimumPrice: 400000, additionalPrice: 0, pricePerCm: 0.25 },
      { name: 'jahit kawat 2 mata', minimumSheets: 0, minimumPrice: 100000, additionalPrice: 120, pricePerCm: 0 },
    ]

    // === MASTER CUSTOMER ===
    const customers = [
      { name: 'Budi Susanto', companyName: 'PT. Maju berkah', address: 'Jl. Raya Industri No. 45, Surabaya', phone: '081234567890', email: '' },
      { name: 'Siti Rohana', companyName: 'CV. Berkah jaya', address: 'Jl. Gatot Subroto No. 12, Jakarta', phone: '082345678901', email: 'siti@berkahabadi.com' },
      { name: 'Jaya Wijaya', companyName: 'UD. Sumber Berkat', address: 'Jl. Diponegoro No. 78, Bandung', phone: '083456789012', email: 'ahmad@sumberrejeki.co.id' },
      { name: 'jaya', companyName: 'mobiletech', address: '', phone: '', email: '' },
      { name: 'Lunggan', companyName: 'skewer', address: '', phone: '', email: '' },
    ]

    await Promise.all([
      // Papers — per user
      ...papers.map(p => db.paper.create({ data: { ...p, userId } })),
      // Printing Costs — per user
      ...printingCosts.map(c => db.printingCost.create({ data: { ...c, userId } })),
      // Finishings — per user
      ...finishings.map(f => db.finishing.create({ data: { ...f, userId } })),
      // Customers — per user
      ...customers.map(c => db.customer.create({ data: { ...c, userId } })),
    ])

    seededUsers.add(userId)
    console.log(`✅ Master data seeded for user: ${userId}`)
  } catch (error) {
    console.error(`❌ Seed data error for user ${userId}:`, error)
  }
}

/**
 * Seed global data (Settings, Pengguna) — runs once per serverless instance.
 * This data is NOT user-specific and is shared across all users.
 */
async function seedGlobalData(): Promise<void> {
  // ========================
  // Seed Pengguna (Default Users)
  // ONLY creates default users if they don't exist — NEVER updates existing users
  // This preserves all user data (passwords, roles, etc.) across deploys
  // ========================
  const penggunaCount = await db.pengguna.count()
  if (penggunaCount === 0) {
    console.log('🌱 Auto-seeding Pengguna (first time only)...')
    const validUntil = new Date()
    validUntil.setFullYear(validUntil.getFullYear() + 10)

    await db.pengguna.create({
      data: {
        id: 'user-superadmin',
        namaLengkap: 'Super Administrator',
        nomorHP: '0000000000',
        email: 'superadmin@sistemcetak.com',
        username: 'superadmin',
        password: '268899',
        role: 'superadmin',
        validUntil,
      },
    })
    await db.pengguna.create({
      data: {
        id: 'user-admin',
        namaLengkap: 'Administrator',
        nomorHP: '0000000001',
        email: 'admin@sistemcetak.com',
        username: 'admin',
        password: '268899',
        role: 'admin',
        validUntil,
      },
    })
    console.log('✅ Pengguna seeded (superadmin, admin)')
  } else {
    // Ensure superadmin and admin exist (create only, never update)
    // This handles the case where a fresh DB has some users but not the defaults
    const existingSuperadmin = await db.pengguna.findUnique({ where: { id: 'user-superadmin' } })
    if (!existingSuperadmin) {
      const validUntil = new Date()
      validUntil.setFullYear(validUntil.getFullYear() + 10)
      await db.pengguna.create({
        data: {
          id: 'user-superadmin',
          namaLengkap: 'Super Administrator',
          nomorHP: '0000000000',
          email: 'superadmin@sistemcetak.com',
          username: 'superadmin',
          password: '268899',
          role: 'superadmin',
          validUntil,
        },
      })
    }
    const existingAdmin = await db.pengguna.findUnique({ where: { id: 'user-admin' } })
    if (!existingAdmin) {
      const validUntil = new Date()
      validUntil.setFullYear(validUntil.getFullYear() + 10)
      await db.pengguna.create({
        data: {
          id: 'user-admin',
          namaLengkap: 'Administrator',
          nomorHP: '0000000001',
          email: 'admin@sistemcetak.com',
          username: 'admin',
          password: '268899',
          role: 'admin',
          validUntil,
        },
      })
    }
    console.log('✅ Pengguna preserved (existing users not modified)')
  }

  // ========================
  // Seed Settings (Pengaturan)
  // ONLY seed if missing — NEVER overwrite user-customized values
  // role_permissions is NOT seeded here — managed by Hak Akses page only
  // ========================
  console.log('🌱 Syncing settings...')

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const existing = await db.setting.findUnique({ where: { key } })
    if (!existing) {
      await db.setting.upsert({
        where: { key },
        update: { value: DEFAULT_SETTINGS[key] },
        create: { key, value: DEFAULT_SETTINGS[key] },
      })
    }
  }
  console.log('✅ Settings synced')
}

/**
 * Main entry point — ensures global data is seeded + per-user data if userId is provided.
 * Backward compatible with existing API calls.
 */
export async function ensureSeedData(userId?: string | null): Promise<void> {
  // First, ensure database tables exist (only runs once per instance)
  await ensureTablesExist()

  // One-time migration: set default branding ONLY if company_name doesn't exist yet
  // NEVER overwrite existing company_name — user may have customized it
  try {
    const migrated = await db.setting.findUnique({ where: { key: 'branding_default_v3' } })
    if (!migrated) {
      // Only set company_name if it doesn't exist yet (create-only, no overwrite)
      const existingCompanyName = await db.setting.findUnique({ where: { key: 'company_name' } })
      if (!existingCompanyName) {
        await db.setting.create({ data: { key: 'company_name', value: 'Darrell Soft' } })
      }
      const existingCompanyLogo = await db.setting.findUnique({ where: { key: 'company_logo' } })
      if (!existingCompanyLogo) {
        await db.setting.create({ data: { key: 'company_logo', value: '' } })
      }
      await db.setting.create({ data: { key: 'branding_default_v3', value: 'done' } })
      console.log('✅ Default branding v3 applied (create-only, no overwrite)')
    }
  } catch (err) {
    console.warn('⚠️ Branding migration error:', err)
  }

  if (!globalSeedChecked) {
    globalSeedChecked = true
    try {
      await seedGlobalData()
    } catch (error) {
      console.error('❌ Global seed error:', error)
      globalSeedChecked = false
    }
  }

  // Seed per-user master data if userId is provided
  if (userId) {
    await seedUserData(userId)
  }
}
