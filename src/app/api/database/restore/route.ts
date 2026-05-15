import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, getServerUser } from '@/lib/server-auth'
import fs from 'fs'
import path from 'path'

// ⛔ PROTECTED tables: Pengguna, CalonPembeli, Pembeli
// These are NEVER deleted or modified during restore.
// Only admin/superadmin can manage them through the UI.
// During restore, we MERGE (add missing records) but never overwrite or delete existing ones.

export async function POST(req: NextRequest) {
  const err = requireAdmin(req); if (err) return err;
  try {
    const body = await req.json()
    const { fileName, backupData } = body

    let data: any

    if (backupData && typeof backupData === 'object' && backupData.database) {
      // Restore from uploaded JSON data directly
      data = backupData
    } else if (fileName && typeof fileName === 'string') {
      // Restore from a saved backup file
      const filePath = path.join(process.cwd(), 'backups', fileName)
      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { success: false, error: 'File backup tidak ditemukan' },
          { status: 404 }
        )
      }
      const raw = fs.readFileSync(filePath, 'utf-8')
      data = JSON.parse(raw)
    } else {
      return NextResponse.json(
        { success: false, error: 'Data backup tidak valid' },
        { status: 400 }
      )
    }

    if (!data.database || typeof data.database !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Format backup tidak valid' },
        { status: 400 }
      )
    }

    // Validate required fields
    const requiredTables = ['Pengguna', 'Customer', 'Paper', 'PrintingCost', 'Finishing', 'CalonPembeli', 'Pembeli', 'Setting', 'RiwayatCetakan']
    for (const table of requiredTables) {
      if (!Array.isArray(data.database[table])) {
        return NextResponse.json(
          { success: false, error: `Format backup tidak valid: tabel ${table} tidak ditemukan` },
          { status: 400 }
        )
      }
    }

    // =====================================================
    // ⛔ PROTECT: Save existing Pengguna, CalonPembeli, Pembeli
    // These are NEVER deleted during restore
    // =====================================================
    const existingPengguna = await db.pengguna.findMany()
    const existingCalonPembeli = await db.calonPembeli.findMany()
    const existingPembeli = await db.pembeli.findMany()

    // Preserve master_cleared flags before wiping settings
    let preservedMasterCleared: { key: string; value: string }[] = []
    try {
      const flags = await db.setting.findMany({ where: { key: { startsWith: 'master_cleared_' } } })
      preservedMasterCleared = flags.map(f => ({ key: f.key, value: f.value }))
    } catch {}

    // Delete non-protected data only
    await db.riwayatCetakan.deleteMany()
    await db.finishing.deleteMany()
    await db.printingCost.deleteMany()
    await db.paper.deleteMany()
    await db.customer.deleteMany()
    await db.setting.deleteMany()
    await db.post.deleteMany()
    await db.user.deleteMany()
    // ⛔ NOT deleting: CalonPembeli, Pembeli, Pengguna

    // Restore data in correct order (respect foreign keys)

    if (data.database.User && data.database.User.length > 0) {
      await db.user.createMany({ data: data.database.User.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    // ⛔ Pengguna: MERGE only — restore from backup but keep ALL existing records
    // Existing records are never modified or deleted
    if (data.database.Pengguna && data.database.Pengguna.length > 0) {
      const existingIds = new Set(existingPengguna.map(p => p.id))
      const existingUsernames = new Set(existingPengguna.map(p => p.username))
      const newRecords = data.database.Pengguna.filter((r: any) =>
        !existingIds.has(r.id) && !existingUsernames.has(r.username)
      )
      if (newRecords.length > 0) {
        await db.pengguna.createMany({ data: newRecords.map((r: any) => {
          const { id, ...rest } = r
          return rest
        }) })
      }
    }
    // Always ensure existing Pengguna are preserved
    for (const p of existingPengguna) {
      const exists = await db.pengguna.findUnique({ where: { id: p.id } })
      if (!exists) {
        await db.pengguna.create({ data: p })
      }
    }

    if (data.database.Post && data.database.Post.length > 0) {
      await db.post.createMany({ data: data.database.Post.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.Customer && data.database.Customer.length > 0) {
      await db.customer.createMany({ data: data.database.Customer.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.Paper && data.database.Paper.length > 0) {
      await db.paper.createMany({ data: data.database.Paper.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.PrintingCost && data.database.PrintingCost.length > 0) {
      await db.printingCost.createMany({ data: data.database.PrintingCost.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.Finishing && data.database.Finishing.length > 0) {
      await db.finishing.createMany({ data: data.database.Finishing.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    // ⛔ CalonPembeli: MERGE only — keep existing, add missing from backup
    if (data.database.CalonPembeli && data.database.CalonPembeli.length > 0) {
      const existingIds = new Set(existingCalonPembeli.map(p => p.id))
      const newRecords = data.database.CalonPembeli.filter((r: any) => !existingIds.has(r.id))
      if (newRecords.length > 0) {
        await db.calonPembeli.createMany({ data: newRecords.map((r: any) => {
          const { id, ...rest } = r
          return rest
        }) })
      }
    }

    // ⛔ Pembeli: MERGE only — keep existing, add missing from backup
    if (data.database.Pembeli && data.database.Pembeli.length > 0) {
      const existingIds = new Set(existingPembeli.map(p => p.id))
      const newRecords = data.database.Pembeli.filter((r: any) => !existingIds.has(r.id))
      if (newRecords.length > 0) {
        await db.pembeli.createMany({ data: newRecords.map((r: any) => {
          const { id, ...rest } = r
          return rest
        }) })
      }
    }

    if (data.database.Setting && data.database.Setting.length > 0) {
      await db.setting.createMany({ data: data.database.Setting.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    // Restore preserved master_cleared flags (prevents auto-reseed for existing accounts)
    for (const flag of preservedMasterCleared) {
      await db.setting.upsert({
        where: { key: flag.key },
        update: { value: flag.value },
        create: { key: flag.key, value: flag.value },
      })
    }

    if (data.database.RiwayatCetakan && data.database.RiwayatCetakan.length > 0) {
      await db.riwayatCetakan.createMany({ data: data.database.RiwayatCetakan.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.RiwayatFinishing && data.database.RiwayatFinishing.length > 0) {
      await db.riwayatFinishing.deleteMany()
      await db.riwayatFinishing.createMany({ data: data.database.RiwayatFinishing.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.RiwayatOngkosCetak && data.database.RiwayatOngkosCetak.length > 0) {
      await db.riwayatOngkosCetak.deleteMany()
      await db.riwayatOngkosCetak.createMany({ data: data.database.RiwayatOngkosCetak.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.RiwayatHargaKertas && data.database.RiwayatHargaKertas.length > 0) {
      await db.riwayatHargaKertas.deleteMany()
      await db.riwayatHargaKertas.createMany({ data: data.database.RiwayatHargaKertas.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    if (data.database.RiwayatPotongKertas && data.database.RiwayatPotongKertas.length > 0) {
      await db.riwayatPotongKertas.deleteMany()
      await db.riwayatPotongKertas.createMany({ data: data.database.RiwayatPotongKertas.map((r: any) => {
        const { id, ...rest } = r
        return rest
      }) })
    }

    return NextResponse.json({
      success: true,
      message: 'Database berhasil di-restore (data Pengguna & Pembeli dilindungi)',
      timestamp: data.timestamp,
      restoredTables: Object.keys(data.database).length,
    })
  } catch (error) {
    console.error('Restore error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan restore database: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
