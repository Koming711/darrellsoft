import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'

// Detect if we're on PostgreSQL
function isPostgreSQL(): boolean {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgres') || url.startsWith('postgresql')
}

export async function POST(req: NextRequest) {
  const err = requireAdmin(req)
  if (err) return err

  const pg = isPostgreSQL()
  const results: string[] = []

  try {
    if (pg) {
      // PostgreSQL: Add missing columns via ALTER TABLE
      const migrations = [
        { table: '"Pembeli"', column: '"penggunaId"', type: 'TEXT' },
        { table: '"RiwayatCetakan"', column: '"type"', type: "TEXT NOT NULL DEFAULT 'hitung_cetakan'" },
        { table: '"RiwayatCetakan"', column: '"warna2"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"warnaKhusus2"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"hargaPlat2"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
        { table: '"RiwayatCetakan"', column: '"pricePerSheet"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
        { table: '"Customer"', column: '"companyName"', type: 'TEXT' },
        { table: '"RiwayatCetakan"', column: '"jumlahPesanan"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"berapaMata"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"otherCost2"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
        { table: '"RiwayatCetakan"', column: '"otherCostLabel"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"otherCostLabel2"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"glueLengthCm"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatCetakan"', column: '"glueCostPerCm"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatOngkosCetak"', column: '"machineId2"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatOngkosCetak"', column: '"machineName2"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatOngkosCetak"', column: '"jumlahWarna2"', type: "TEXT NOT NULL DEFAULT '0'" },
        { table: '"RiwayatOngkosCetak"', column: '"warnaKhusus2"', type: "TEXT NOT NULL DEFAULT '0'" },
        { table: '"RiwayatOngkosCetak"', column: '"hargaPlat2"', type: "TEXT NOT NULL DEFAULT '0'" },
        { table: '"RiwayatOngkosCetak"', column: '"totalOngkosCetak2"', type: 'DOUBLE PRECISION NOT NULL DEFAULT 0' },
        { table: '"RiwayatPotongKertas"', column: '"jumlahPesanan"', type: "TEXT NOT NULL DEFAULT ''" },
        { table: '"RiwayatPotongKertas"', column: '"berapaMata"', type: "TEXT NOT NULL DEFAULT ''" },
      ]

      let added = 0
      for (const m of migrations) {
        try {
          await db.$executeRawUnsafe(
            `ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS ${m.column} ${m.type}`
          )
          added++
        } catch (err: any) {
          results.push(`⚠️ ${m.table}.${m.column}: ${err?.message || 'skipped'}`)
        }
      }
      results.push(`✅ ${added} kolom diperiksa/ditambahkan di PostgreSQL`)
    } else {
      // SQLite: Check current schema status
      results.push('ℹ️ SQLite: Schema diupdate otomatis via db:push')
    }

    // Check all tables exist
    const tableChecks = [
      'Pengguna', 'User', 'Customer', 'Paper', 'PrintingCost', 'Finishing',
      'CalonPembeli', 'Pembeli', 'Setting', 'RiwayatCetakan', 'RiwayatFinishing',
      'RiwayatOngkosCetak', 'RiwayatHargaKertas', 'RiwayatPotongKertas',
      'Invoice', 'Payment', 'SuratJalan',
    ]

    let tablesOk = 0
    for (const table of tableChecks) {
      try {
        await db.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`)
        tablesOk++
      } catch {
        results.push(`❌ Tabel "${table}" tidak ditemukan`)
      }
    }
    results.push(`✅ ${tablesOk}/${tableChecks.length} tabel ditemukan`)

    return NextResponse.json({
      success: true,
      message: 'Database berhasil diupdate',
      details: results,
    })
  } catch (error: any) {
    console.error('Update database error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal mengupdate database', details: results },
      { status: 500 }
    )
  }
}
