// ============================================================================
// API SINKRONISASI PERMANEN POTONG KERTAS ↔ HITUNG CETAKAN
// ============================================================================
// GET  ?pkId=... [&hcId=...]
//   → Status relasi + ringkasan sumber + daftar field yang akan diperbarui:
//     status: 'unlinked' (belum ada HC) | 'synced' | 'stale' (sumber berubah)
//     Dipakai panel status di kedua halaman + polling perubahan sumber.
//
// POST { pkId, hcId? }
//   → Terapkan sinkronisasi PK → HC (SATU transaksi):
//     1. Update field sumber HC dari PK terkini (14 field — lihat potong-sync.ts)
//     2. Hitung ulang nilai turunan dgn engine/rumus yang sama dgn editor:
//        kertas (cutting-engine), ongkos cetak (formula mesin, input mesin
//        TIDAK diubah), finishing (formula master, daftar finishing tetap),
//        subTotal/profit/grandTotal
//     3. Simpan snapshot sumber + waktu sinkron + riwayat perubahan (audit §11)
//     Input manual yang tidak terdampak DIPERTAHANKAN (Wajib Audit §6C).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import {
  extractPkSource, extractHcSource, diffSources,
  parseSnapshot, parseSyncHistory, buildPkSummary,
} from '@/lib/potong-sync'
import { applyPkToHcSync } from '@/lib/potong-sync-apply'
import type { SourceFieldChange } from '@/lib/potong-sync'

// Ambil HC terhubung: by hcId (harus ter-link ke pk ini) atau HC terbaru utk pkId.
async function findLinkedHc(pkId: string, hcId: string | null, dataFilter: Record<string, unknown>) {
  if (hcId) {
    const hc = await db.riwayatCetakan.findFirst({ where: { id: hcId, ...dataFilter } })
    if (hc && hc.pkRiwayatId !== pkId) return null // hcId bukan milik relasi ini
    return hc
  }
  return db.riwayatCetakan.findFirst({
    where: { pkRiwayatId: pkId, ...dataFilter },
    orderBy: { createdAt: 'desc' },
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)
    const { searchParams } = new URL(request.url)
    const pkId = searchParams.get('pkId') || ''
    const hcId = searchParams.get('hcId') || ''
    if (!pkId) return NextResponse.json({ error: 'pkId wajib diisi' }, { status: 400 })

    const pk = await db.riwayatPotongKertas.findFirst({ where: { id: pkId, ...dataFilter } })
    if (!pk) return NextResponse.json({ error: 'Riwayat Potong Kertas tidak ditemukan' }, { status: 404 })

    const hc = await findLinkedHc(pkId, hcId || null, dataFilter)
    const source = extractPkSource(pk)
    const willUpdate: SourceFieldChange[] = hc ? diffSources(extractHcSource(hc), source) : []
    const snapshot = hc ? parseSnapshot(hc.pkSourceSnapshot) : null
    const changedSinceSync = hc ? diffSources(snapshot, source) : []
    const status = !hc ? 'unlinked' : (willUpdate.length > 0 ? 'stale' : 'synced')

    return NextResponse.json({
      status,
      pk: buildPkSummary(pk),
      linkedHc: hc ? {
        id: hc.id,
        nomor: hc.nomorUrut,
        pkSyncStatus: hc.pkSyncStatus || '',
        pkLastSyncedAt: hc.pkLastSyncedAt ? hc.pkLastSyncedAt.toISOString() : null,
        subTotal: hc.subTotal,
        grandTotal: hc.grandTotal,
        totalPaperPrice: hc.totalPaperPrice,
        quantity: hc.quantity,
        updatedAt: hc.updatedAt.toISOString(),
      } : null,
      willUpdate,
      changedSinceSync,
      snapshotExists: !!snapshot,
      history: hc ? parseSyncHistory(hc.pkSyncHistory).slice(0, 5) : [],
    })
  } catch (error) {
    console.error('Error potong-cetakan-sync GET:', error)
    return NextResponse.json({ error: 'Gagal memeriksa status sinkronisasi' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)
    const body = await request.json().catch(() => ({}))
    const pkId: string = typeof body.pkId === 'string' ? body.pkId : ''
    const hcId: string = typeof body.hcId === 'string' ? body.hcId : ''
    if (!pkId) return NextResponse.json({ error: 'pkId wajib diisi' }, { status: 400 })

    const pk = await db.riwayatPotongKertas.findFirst({ where: { id: pkId, ...dataFilter } })
    if (!pk) return NextResponse.json({ error: 'Riwayat Potong Kertas tidak ditemukan' }, { status: 404 })

    const hc = await findLinkedHc(pkId, hcId || null, dataFilter)
    if (!hc) {
      return NextResponse.json(
        { error: 'Belum ada Hitung Cetakan yang terhubung dengan riwayat Potong Kertas ini' },
        { status: 404 }
      )
    }

    // Terapkan sinkronisasi lewat helper bersama (dipakai juga oleh auto-sync
    // di PUT /api/riwayat-potong-kertas/[id]) — field sumber + turunan + audit
    // dalam SATU transaksi; input manual dipertahankan.
    const result = await applyPkToHcSync(pk, hc)

    return NextResponse.json({
      status: 'synced',
      changed: result.changed,
      derived: result.derived,
      hc: result.hc,
    })
  } catch (error) {
    console.error('Error potong-cetakan-sync POST:', error)
    return NextResponse.json({ error: 'Sinkronisasi gagal — data tidak diubah' }, { status: 500 })
  }
}
