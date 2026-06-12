import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * POST /api/database/deduplicate
 * Remove duplicate master data records for a specific userId, keeping only one of each unique name.
 * Also deduplicates riwayat records by nomorUrut (unique field).
 *
 * Body: { userId: string, tables?: string[] }
 * - userId: the user whose data to deduplicate
 * - tables: optional array of tables to deduplicate (default: all master tables)
 *   Options: 'finishing', 'customer', 'paper', 'printingCost', 'riwayatCetakan', 'riwayatPotongKertas'
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json().catch(() => ({}))
    const { userId, tables } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId diperlukan' }, { status: 400 })
    }

    const allTables = ['finishing', 'customer', 'paper', 'printingCost', 'riwayatCetakan', 'riwayatPotongKertas']
    const targetTables = tables && tables.length > 0 ? tables : allTables

    const results: string[] = []
    let totalDeleted = 0

    // Deduplicate master tables by name
    const masterConfigs: Record<string, { model: any; uniqueField: string; label: string; compareFields?: string[] }> = {
      finishing: { model: db.finishing, uniqueField: 'name', label: 'Master Finishing', compareFields: ['minimumSheets', 'minimumPrice', 'additionalPrice', 'pricePerCm'] },
      customer: { model: db.customer, uniqueField: 'name', label: 'Master Customer', compareFields: ['companyName', 'phone', 'email'] },
      paper: { model: db.paper, uniqueField: 'name', label: 'Master Harga Kertas', compareFields: ['grammage', 'width', 'height', 'pricePerRim'] },
      printingCost: { model: db.printingCost, uniqueField: 'machineName', label: 'Master Ongkos Cetak', compareFields: ['grammage', 'printAreaWidth', 'printAreaHeight', 'pricePerColor'] },
    }

    for (const tableKey of targetTables) {
      if (masterConfigs[tableKey]) {
        const config = masterConfigs[tableKey]
        if (!targetTables.includes(tableKey)) continue

        try {
          // Get all records for this user, ordered by createdAt (keep oldest)
          const records = await config.model.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' }
          })

          // Group by uniqueField
          const groups: Record<string, typeof records> = {}
          for (const record of records) {
            const key = record[config.uniqueField]
            if (!groups[key]) groups[key] = []
            groups[key].push(record)
          }

          // Delete duplicates, keep the first (oldest) record
          for (const [name, group] of Object.entries(groups)) {
            if (group.length > 1) {
              // Keep first record, delete the rest
              const toDelete = group.slice(1).map(r => r.id)
              for (const id of toDelete) {
                await config.model.delete({ where: { id } })
              }
              const deleted = toDelete.length
              totalDeleted += deleted
              results.push(`${config.label} "${name}": ${group.length} → 1 (deleted ${deleted})`)
            }
          }

          const totalRemaining = await config.model.count({ where: { userId } })
          results.push(`${config.label}: total remaining = ${totalRemaining}`)
        } catch (err: any) {
          results.push(`${config.label}: Error - ${sanitizeError(err, 'Error')}`)
        }
      }
    }

    // Deduplicate riwayat cetakan by nomorUrut
    if (targetTables.includes('riwayatCetakan')) {
      try {
        const records = await db.riwayatCetakan.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' }
        })

        const groups: Record<string, typeof records> = {}
        for (const record of records) {
          const key = record.nomorUrut || record.id
          if (!groups[key]) groups[key] = []
          groups[key].push(record)
        }

        for (const [key, group] of Object.entries(groups)) {
          if (group.length > 1) {
            const toDelete = group.slice(1).map(r => r.id)
            for (const id of toDelete) {
              await db.riwayatCetakan.delete({ where: { id } })
            }
            totalDeleted += toDelete.length
            results.push(`Riwayat Cetakan "${key}": ${group.length} → 1 (deleted ${toDelete.length})`)
          }
        }
      } catch (err: any) {
        results.push(`Riwayat Cetakan: Error - ${sanitizeError(err, 'Error')}`)
      }
    }

    // Deduplicate riwayat potong kertas by nomorUrut
    if (targetTables.includes('riwayatPotongKertas')) {
      try {
        const records = await db.riwayatPotongKertas.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' }
        })

        const groups: Record<string, typeof records> = {}
        for (const record of records) {
          const key = record.nomorUrut || record.id
          if (!groups[key]) groups[key] = []
          groups[key].push(record)
        }

        for (const [key, group] of Object.entries(groups)) {
          if (group.length > 1) {
            const toDelete = group.slice(1).map(r => r.id)
            for (const id of toDelete) {
              await db.riwayatPotongKertas.delete({ where: { id } })
            }
            totalDeleted += toDelete.length
            results.push(`Riwayat Potong Kertas "${key}": ${group.length} → 1 (deleted ${toDelete.length})`)
          }
        }
      } catch (err: any) {
        results.push(`Riwayat Potong Kertas: Error - ${sanitizeError(err, 'Error')}`)
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      totalDeleted,
      details: results,
    })
  } catch (error: any) {
    console.error('Deduplicate error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mendeduplikasi data') },
      { status: 500 }
    )
  }
}
