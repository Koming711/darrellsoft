import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * POST /api/database/repair-user-data
 *
 * Fixes orphaned data caused by CalonPembeli → Pengguna conversion.
 * When a CalonPembeli is converted, their old userId (= calon.id) becomes
 * orphaned because the CalonPembeli record is deleted and a new Pengguna
 * record with a different ID is created.
 *
 * Modes:
 * 1. { mode: "scan" } — Lists all orphaned userIds and their data counts
 * 2. { mode: "repair", username: "aming" } — Finds orphaned data for a user and reassigns to their Pengguna ID
 * 3. { mode: "repair", oldUserId: "xxx", newUserId: "yyy" } — Reassigns specific userId
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json().catch(() => ({}))
    const { mode = 'scan', username, oldUserId, newUserId } = body

    // Collect all existing valid userIds
    const allPengguna = await db.pengguna.findMany({ select: { id: true, namaLengkap: true, username: true } })
    const allCalon = await db.calonPembeli.findMany({ select: { id: true, nama: true, username: true } })
    const validUserIds = new Set([...allPengguna.map(p => p.id), ...allCalon.map(c => c.id)])

    // Models that have userId field
    const dataModels = [
      { key: 'customer', model: db.customer, label: 'Master Customer' },
      { key: 'paper', model: db.paper, label: 'Master Harga Kertas' },
      { key: 'printingCost', model: db.printingCost, label: 'Master Ongkos Cetak' },
      { key: 'finishing', model: db.finishing, label: 'Master Finishing' },
      { key: 'riwayatCetakan', model: db.riwayatCetakan, label: 'Riwayat Cetakan' },
      { key: 'riwayatFinishing', model: db.riwayatFinishing, label: 'Riwayat Finishing' },
      { key: 'riwayatOngkosCetak', model: db.riwayatOngkosCetak, label: 'Riwayat Ongkos Cetak' },
      { key: 'riwayatHargaKertas', model: db.riwayatHargaKertas, label: 'Riwayat Harga Kertas' },
      { key: 'riwayatPotongKertas', model: db.riwayatPotongKertas, label: 'Riwayat Potong Kertas' },
      { key: 'invoice', model: db.invoice, label: 'Invoice' },
      { key: 'suratJalan', model: db.suratJalan, label: 'Surat Jalan' },
      { key: 'purchaseOrder', model: db.purchaseOrder, label: 'Purchase Order' },
      { key: 'tokoPemasok', model: db.tokoPemasok, label: 'Toko Pemasok' },
      { key: 'documentHistory', model: db.documentHistory, label: 'Document History' },
    ]

    if (mode === 'scan') {
      // Scan for orphaned userIds across all data tables
      const orphanedMap: Record<string, { count: number; tables: string[] }> = {}

      for (const dm of dataModels) {
        try {
          const records = await dm.model.findMany({
            where: { userId: { not: null } },
            select: { userId: true }
          })
          for (const r of records) {
            if (r.userId && !validUserIds.has(r.userId)) {
              if (!orphanedMap[r.userId]) {
                orphanedMap[r.userId] = { count: 0, tables: [] }
              }
              orphanedMap[r.userId].count++
              if (!orphanedMap[r.userId].tables.includes(dm.label)) {
                orphanedMap[r.userId].tables.push(dm.label)
              }
            }
          }
        } catch {}
      }

      const orphanedList = Object.entries(orphanedMap).map(([id, info]) => ({
        orphanedUserId: id,
        totalRecords: info.count,
        tables: info.tables,
        suggestedPengguna: null as any
      }))

      // Try to match orphaned IDs to Pengguna via Pembeli records
      for (const entry of orphanedList) {
        try {
          const sampleRiwayat = await db.riwayatCetakan.findFirst({
            where: { userId: entry.orphanedUserId },
            select: { customerName: true }
          })
          const samplePotong = await db.riwayatPotongKertas.findFirst({
            where: { userId: entry.orphanedUserId },
            select: { namaCustomer: true }
          })

          const customerName = sampleRiwayat?.customerName || samplePotong?.namaCustomer || ''

          if (customerName) {
            const matchingPembeli = await db.pembeli.findFirst({
              where: {
                nama: { contains: customerName.split(' ')[0], mode: 'insensitive' }
              },
              include: { pengguna: true }
            })
            if (matchingPembeli?.penggunaId && matchingPembeli.pengguna) {
              entry.suggestedPengguna = {
                id: matchingPembeli.pengguna.id,
                namaLengkap: matchingPembeli.pengguna.namaLengkap,
                username: matchingPembeli.pengguna.username,
              }
            }
          }
        } catch {}
      }

      return NextResponse.json({
        success: true,
        orphanedCount: orphanedList.length,
        orphaned: orphanedList,
        validPengguna: allPengguna.map(p => ({ id: p.id, namaLengkap: p.namaLengkap, username: p.username })),
      })
    }

    if (mode === 'repair') {
      let targetOldUserId = oldUserId
      let targetNewUserId = newUserId

      // If username provided, auto-detect the old and new userId
      if (username && !targetOldUserId) {
        const pengguna = await db.pengguna.findUnique({ where: { username } })
        if (!pengguna) {
          return NextResponse.json({ error: `Pengguna dengan username "${username}" tidak ditemukan` }, { status: 404 })
        }
        targetNewUserId = pengguna.id

        const pembeli = await db.pembeli.findFirst({
          where: { penggunaId: pengguna.id }
        })

        if (!pembeli) {
          return NextResponse.json({ error: `Pembeli record untuk "${username}" tidak ditemukan` }, { status: 404 })
        }

        // Find ALL orphaned userIds and try to match
        const orphanedCandidates: string[] = []
        for (const dm of dataModels) {
          try {
            const records = await dm.model.findMany({
              where: { userId: { not: null } },
              select: { userId: true }
            })
            for (const r of records) {
              if (r.userId && !validUserIds.has(r.userId) && r.userId !== targetNewUserId) {
                if (!orphanedCandidates.includes(r.userId)) {
                  orphanedCandidates.push(r.userId)
                }
              }
            }
          } catch {}
        }

        // Try to find the best match among orphaned candidates
        for (const candidateId of orphanedCandidates) {
          try {
            // Check if any riwayat data from this orphan has matching customer names
            const sampleRiwayat = await db.riwayatCetakan.findFirst({
              where: { userId: candidateId },
              select: { customerName: true, createdAt: true }
            })
            const samplePotong = await db.riwayatPotongKertas.findFirst({
              where: { userId: candidateId },
              select: { namaCustomer: true, createdAt: true }
            })

            const orphanName = sampleRiwayat?.customerName || samplePotong?.namaCustomer || ''
            const orphanCreated = sampleRiwayat?.createdAt || samplePotong?.createdAt

            // Match by customer name containing pembeli's name
            if (orphanName && pembeli.nama) {
              const pembeliFirstName = pembeli.nama.toLowerCase().split(' ')[0]
              if (pembeliFirstName.length > 2 && orphanName.toLowerCase().includes(pembeliFirstName)) {
                targetOldUserId = candidateId
                break
              }
            }

            // Match by timing: data created before pembeli was created (within 7 days)
            if (orphanCreated && pembeli.createdAt) {
              const timeDiff = new Date(pembeli.createdAt).getTime() - new Date(orphanCreated).getTime()
              if (timeDiff > 0 && timeDiff < 7 * 24 * 60 * 60 * 1000) {
                targetOldUserId = candidateId
                break
              }
            }
          } catch {}
        }

        if (!targetOldUserId) {
          // If only one orphaned candidate, assume it belongs to this user
          if (orphanedCandidates.length === 1) {
            targetOldUserId = orphanedCandidates[0]
          } else {
            return NextResponse.json({
              error: `Tidak ditemukan data orphaned untuk username "${username}".`,
              orphanedCandidates,
              hint: 'Gunakan mode "scan" atau tentukan oldUserId secara manual'
            }, { status: 404 })
          }
        }
      }

      if (!targetOldUserId || !targetNewUserId) {
        return NextResponse.json({ error: 'oldUserId dan newUserId diperlukan, atau gunakan username' }, { status: 400 })
      }

      if (targetOldUserId === targetNewUserId) {
        return NextResponse.json({ error: 'oldUserId dan newUserId tidak boleh sama' }, { status: 400 })
      }

      // Perform the migration
      const results: string[] = []
      let totalMigrated = 0

      for (const dm of dataModels) {
        try {
          const result = await dm.model.updateMany({
            where: { userId: targetOldUserId },
            data: { userId: targetNewUserId }
          })
          if (result.count > 0) {
            results.push(`${dm.label}: ${result.count} records`)
            totalMigrated += result.count
          }
        } catch (err: any) {
          results.push(`${dm.label}: Error - ${sanitizeError(err, 'Error')}`)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Migrated ${totalMigrated} records from ${targetOldUserId} → ${targetNewUserId}`,
        oldUserId: targetOldUserId,
        newUserId: targetNewUserId,
        details: results,
      })
    }

    return NextResponse.json({ error: 'Mode tidak valid. Gunakan "scan" atau "repair"' }, { status: 400 })
  } catch (error: any) {
    console.error('Repair user data error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memperbaiki data user') },
      { status: 500 }
    )
  }
}
