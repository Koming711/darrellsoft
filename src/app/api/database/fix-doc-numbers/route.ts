import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getDataFilter } from '@/lib/server-auth'
import { counterKeyFor, previewPotongKertasNumber, previewHitungCetakanNumber, previewGabunganCetakanNumber } from '@/lib/doc-number'
import { sanitizeError } from '@/lib/api-error'

/**
 * POST /api/database/fix-doc-numbers
 *
 * Tool admin utk mendiagnosa & memperbaiki DocumentCounter (sumber nomor urut
 * kontinu PK / HC / GB / INV / PO / SJ). Background: penomoran kontinu tidak
 * pernah reset tiap bulan, tapi bila counter pernah "tercemar" angka fallback
 * timestamp 6 digit (skema lama), semua nomor berikutnya ikut 6 digit
 * (mis. PK/11/26/359384). Tool ini memungkinkan reset counter ke nilai yang
 * benar tanpa akses DB langsung (DB produksi tidak bisa dijangkau dari luar).
 *
 * Modes:
 * 1. { mode: "scan", username?: "aming", userId?: "..." }
 *    → daftar semua DocumentCounter + statistik nomor per konteks untuk
 *      user yang dituju (total, jumlah nomor >4 digit, max 4 digit).
 * 2. { mode: "set-counter", username?|userId?, target: "potongKertas"|"cetakan"|"gabungan"|"INV"|"PO"|"SJ"|"PEL"|"SPK", lastNum: 129 }
 *    → set counter target = lastNum, sehingga nomor BERIKUTNYA = lastNum+1
 *      (dengan padding 4 digit). Respons menyertakan preview nomor berikutnya.
 *
 * Admin-only (requireAdmin). Tidak pernah mengubah record dokumen — hanya
 * baris DocumentCounter.
 */

type TargetSpec = { context: string; prefix: string; docType?: string }

const TARGETS: Record<string, TargetSpec> = {
  potongKertas: { context: 'riwayatPotongKertas', prefix: 'PK' },
  cetakan: { context: 'riwayatCetakan', prefix: 'HC' },
  gabungan: { context: 'gabunganHitungCetakan', prefix: 'GB' },
  INV: { context: 'documentHistory', prefix: 'INV', docType: 'invoice' },
  PEL: { context: 'documentHistory', prefix: 'PEL', docType: 'pelunasan' },
  PO: { context: 'documentHistory', prefix: 'PO', docType: 'purchase-order' },
  SJ: { context: 'documentHistory', prefix: 'SJ', docType: 'surat-jalan' },
  SPK: { context: 'documentHistory', prefix: 'SPK', docType: 'spk' },
}

function seqOf(nomor: string): number {
  const parts = String(nomor || '').split('/')
  const v = parseInt(parts[parts.length - 1], 10)
  return isNaN(v) ? 0 : v
}

async function resolveTargetUser(body: {
  username?: string
  userId?: string
}): Promise<{ id: string; role: string; label: string } | null> {
  if (body.userId) {
    const p = await db.pengguna.findUnique({ where: { id: body.userId } })
    if (p) return { id: p.id, role: p.role, label: `pengguna:${p.username}` }
    const c = await db.calonPembeli.findUnique({ where: { id: body.userId } })
    if (c) return { id: c.id, role: c.role || 'demo', label: `calon:${c.username || c.nama}` }
    return null
  }
  if (body.username) {
    const p = await db.pengguna.findFirst({ where: { username: body.username } })
    if (p) return { id: p.id, role: p.role, label: `pengguna:${p.username}` }
    const c = await db.calonPembeli.findFirst({ where: { username: body.username } })
    if (c) return { id: c.id, role: c.role || 'demo', label: `calon:${c.username || c.nama}` }
  }
  return null
}

/** Statistik nomor utk satu konteks — mendeteksi nomor fallback >4 digit. */
async function numberStats(
  model: 'riwayatPotongKertas' | 'riwayatCetakan' | 'gabunganHitungCetakan',
  dataFilter: Record<string, unknown>,
  prefix: string
) {
  const rows = await (db[model] as any).findMany({
    where: { ...dataFilter, nomorUrut: { startsWith: `${prefix}/` } },
    select: { nomorUrut: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  let max4 = 0
  let badCount = 0
  const badExamples: string[] = []
  for (const r of rows) {
    const seq = seqOf(r.nomorUrut)
    if (seq > 9999) {
      badCount++
      if (badExamples.length < 8) badExamples.push(r.nomorUrut)
    } else if (seq > max4) {
      max4 = seq
    }
  }
  return { total: rows.length, badCount, max4, badExamples }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json().catch(() => ({}))
    const mode = body.mode || 'scan'

    // ---------- SCAN ----------
    if (mode === 'scan') {
      const counters = await db.documentCounter.findMany({
        select: { key: true, lastNum: true, updatedAt: true },
        orderBy: { key: 'asc' },
        take: 300,
      })

      let target: Awaited<ReturnType<typeof resolveTargetUser>> = null
      let scope: Record<string, unknown> | null = null
      let stats: Record<string, unknown> | null = null
      let keys: Record<string, string> | null = null

      const tu = await resolveTargetUser(body)
      if (tu) {
        target = tu
        scope = await getDataFilter({ id: tu.id, role: tu.role } as any)
        keys = {
          potongKertas: counterKeyFor('riwayatPotongKertas', 'PK', scope),
          cetakan: counterKeyFor('riwayatCetakan', 'HC', scope),
          gabungan: counterKeyFor('gabunganHitungCetakan', 'GB', scope),
          INV: counterKeyFor('documentHistory', 'INV', scope),
        }
        const [pk, hc, gb] = await Promise.all([
          numberStats('riwayatPotongKertas', scope, 'PK').catch(() => null),
          numberStats('riwayatCetakan', scope, 'HC').catch(() => null),
          numberStats('gabunganHitungCetakan', scope, 'GB').catch(() => null),
        ])
        stats = { potongKertas: pk, cetakan: hc, gabungan: gb }
      }

      return NextResponse.json({
        success: true,
        mode,
        target,
        scopeKind:
          scope && typeof (scope as any).userId === 'object' ? 'grup' : scope ? 'user' : null,
        keys,
        stats,
        counters,
      })
    }

    // ---------- SET-COUNTER ----------
    if (mode === 'set-counter') {
      const targetName = String(body.target || '')
      const spec = TARGETS[targetName]
      if (!spec) {
        return NextResponse.json(
          { error: `target tidak valid. Gunakan salah satu: ${Object.keys(TARGETS).join(', ')}` },
          { status: 400 }
        )
      }
      const lastNum = Number(body.lastNum)
      if (!Number.isInteger(lastNum) || lastNum < 0 || lastNum > 99999) {
        return NextResponse.json({ error: 'lastNum harus integer 0..99999' }, { status: 400 })
      }

      const tu = await resolveTargetUser(body)
      if (!tu) {
        return NextResponse.json({ error: 'User tidak ditemukan (username/userId)' }, { status: 404 })
      }
      const dataFilter = await getDataFilter({ id: tu.id, role: tu.role } as any)
      const key = counterKeyFor(spec.context, spec.prefix, dataFilter)

      // Info diagnostik: nomor berikutnya yang akan diterbitkan setelah di-set.
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const year = String(now.getFullYear()).slice(-2)
      const upcoming = `${spec.prefix}/${month}/${year}/${String(lastNum + 1).padStart(4, '0')}`
      let collisionWarning: string | null = null
      if (spec.context === 'documentHistory') {
        const exists = await db.documentHistory.findFirst({
          where: { docType: spec.docType!, nomor: upcoming, ...dataFilter },
          select: { id: true },
        })
        if (exists) collisionWarning = `Nomor ${upcoming} sudah dipakai dokumen lain — generator akan otomatis lanjut ke nomor berikutnya.`
      } else {
        const exists = await (db as any)[spec.context].findUnique({
          where: { nomorUrut: upcoming },
          select: { id: true },
        })
        if (exists) collisionWarning = `Nomor ${upcoming} sudah dipakai dokumen lain — generator akan otomatis lanjut ke nomor berikutnya.`
      }

      const saved = await db.documentCounter.upsert({
        where: { key },
        create: { key, lastNum },
        update: { lastNum },
      })

      // Preview nomor berikutnya (bukti nyata counter sudah benar).
      let nextPreview: string | null = null
      try {
        if (targetName === 'potongKertas') nextPreview = await previewPotongKertasNumber(dataFilter)
        else if (targetName === 'cetakan') nextPreview = await previewHitungCetakanNumber(dataFilter)
        else if (targetName === 'gabungan') nextPreview = await previewGabunganCetakanNumber(dataFilter)
      } catch { /* preview opsional */ }

      return NextResponse.json({
        success: true,
        mode,
        targetUser: tu,
        scopeKind: typeof (dataFilter as any).userId === 'object' ? 'grup' : 'user',
        key,
        lastNum: saved.lastNum,
        upcomingNumber: upcoming,
        collisionWarning,
        nextPreview,
      })
    }

    return NextResponse.json(
      { error: 'Mode tidak valid. Gunakan "scan" atau "set-counter"' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Fix doc numbers error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memperbaiki counter nomor dokumen') },
      { status: 500 }
    )
  }
}
