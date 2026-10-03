import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { recalcBahan, nextStkNumber, todayStr } from '@/lib/stock-bahan-server'

/**
 * CRUD Penyesuaian Stok (stok opname — stok fisik ≠ stok sistem).
 * POST  { bahanId, tanggal?, stokFisik, alasan, catatan? }
 *       - stokSistem di-snapshot otomatis dari stok bahan saat itu.
 *       - Setelah disimpan, stok sistem = stok fisik (via recalcBahan).
 * Semua penyesuaian otomatis masuk Riwayat Stok (ledger BahanMutasi).
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const sp = request.nextUrl.searchParams
    const bahanId = sp.get('bahanId') || undefined
    const dari = sp.get('dari') || ''
    const sampai = sp.get('sampai') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    let rows = await db.bahanPenyesuaian.findMany({
      where: { ...(await getDataFilter(user)), ...(bahanId ? { bahanId } : {}) },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })

    if (dari) rows = rows.filter((r) => r.tanggal >= dari)
    if (sampai) rows = rows.filter((r) => r.tanggal <= sampai)
    if (q) {
      rows = rows.filter(
        (r) => r.bahanNama.toLowerCase().includes(q) || r.nomor.toLowerCase().includes(q) || r.alasan.toLowerCase().includes(q)
      )
    }
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching penyesuaian:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch penyesuaian') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { bahanId, tanggal, stokFisik, selisih, alasan, catatan } = body

    if (!bahanId) return NextResponse.json({ error: 'Bahan wajib dipilih' }, { status: 400 })
    if (!alasan || String(alasan).trim() === '') {
      return NextResponse.json({ error: 'Alasan penyesuaian wajib diisi' }, { status: 400 })
    }

    const bahan = await db.bahan.findUnique({ where: { id: String(bahanId) } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const stokSistem = bahan.stok
    let stokFisikNum: number
    if (stokFisik !== undefined && stokFisik !== null && stokFisik !== '') {
      stokFisikNum = Number(stokFisik)
    } else if (selisih !== undefined && selisih !== null && selisih !== '') {
      stokFisikNum = stokSistem + Number(selisih)
    } else {
      return NextResponse.json({ error: 'Stok fisik wajib diisi' }, { status: 400 })
    }
    if (!Number.isFinite(stokFisikNum) || stokFisikNum < 0) {
      return NextResponse.json({ error: 'Stok fisik tidak boleh minus' }, { status: 400 })
    }

    const userId = user?.id || null
    const nomor = await nextStkNumber(userId)
    const created = await db.bahanPenyesuaian.create({
      data: {
        nomor,
        tanggal: tanggal ? String(tanggal) : todayStr(),
        bahanId: bahan.id,
        bahanNama: bahan.nama,
        satuan: bahan.satuan,
        stokSistem,
        stokFisik: stokFisikNum,
        selisih: Math.round((stokFisikNum - stokSistem) * 100) / 100,
        alasan: String(alasan).trim(),
        catatan: catatan ? String(catatan) : '',
        userId,
      },
    })

    await recalcBahan(bahan.id)
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating penyesuaian:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create penyesuaian') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, tanggal, stokFisik, alasan, catatan } = body

    if (!id) return NextResponse.json({ error: 'ID transaksi wajib diisi' }, { status: 400 })
    const existing = await db.bahanPenyesuaian.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    const stokFisikNum = stokFisik !== undefined ? Number(stokFisik) : existing.stokFisik
    if (!Number.isFinite(stokFisikNum) || stokFisikNum < 0) {
      return NextResponse.json({ error: 'Stok fisik tidak boleh minus' }, { status: 400 })
    }

    await db.bahanPenyesuaian.update({
      where: { id },
      data: {
        tanggal: tanggal ? String(tanggal) : existing.tanggal,
        stokFisik: stokFisikNum,
        selisih: Math.round((stokFisikNum - existing.stokSistem) * 100) / 100,
        alasan: alasan !== undefined ? String(alasan).trim() : existing.alasan,
        catatan: catatan !== undefined ? String(catatan) : existing.catatan,
      },
    })

    await recalcBahan(existing.bahanId)
    const fresh = await db.bahanPenyesuaian.findUnique({ where: { id } })
    return NextResponse.json(fresh)
  } catch (error: any) {
    console.error('Error updating penyesuaian:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update penyesuaian') },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID transaksi wajib diisi' }, { status: 400 })

    const existing = await db.bahanPenyesuaian.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    await db.bahanPenyesuaian.delete({ where: { id } })
    await recalcBahan(existing.bahanId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting penyesuaian:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete penyesuaian') },
      { status: 500 }
    )
  }
}
