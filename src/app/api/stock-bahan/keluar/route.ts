import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { recalcBahan, nextStkNumber, todayStr, getStockPengaturan } from '@/lib/stock-bahan-server'

/**
 * CRUD Stok Keluar (pemakaian bahan: produksi, sampel, rusak, internal).
 * - Stok tidak boleh minus, KECUALI pengaturan "Allow Negative Stock" aktif (admin).
 * - Setiap create/update/delete memicu recalcBahan → saldo selalu konsisten.
 *
 * GET    ?bahanId= &tujuan= &dari= &sampai= &q=
 * POST   { bahanId, tanggal?, qty, tujuan?, catatan? }
 * PUT    { id, tanggal?, qty?, tujuan?, catatan? }
 * DELETE ?id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const sp = request.nextUrl.searchParams
    const bahanId = sp.get('bahanId') || undefined
    const tujuan = (sp.get('tujuan') || '').trim()
    const dari = sp.get('dari') || ''
    const sampai = sp.get('sampai') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    let rows = await db.bahanKeluar.findMany({
      where: { ...(await getDataFilter(user)), ...(bahanId ? { bahanId } : {}) },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })

    if (tujuan) rows = rows.filter((r) => r.tujuan === tujuan)
    if (dari) rows = rows.filter((r) => r.tanggal >= dari)
    if (sampai) rows = rows.filter((r) => r.tanggal <= sampai)
    if (q) {
      rows = rows.filter(
        (r) => r.bahanNama.toLowerCase().includes(q) || r.nomor.toLowerCase().includes(q) || r.catatan.toLowerCase().includes(q)
      )
    }
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching stok keluar:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch stok keluar') },
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
    const { bahanId, tanggal, qty, tujuan, catatan } = body

    if (!bahanId) return NextResponse.json({ error: 'Bahan wajib dipilih' }, { status: 400 })
    const qtyNum = Number(qty)
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Jumlah keluar harus lebih dari 0' }, { status: 400 })
    }

    const bahan = await db.bahan.findUnique({ where: { id: String(bahanId) } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const { allowNegativeStock } = await getStockPengaturan()
    if (!allowNegativeStock && qtyNum > bahan.stok) {
      return NextResponse.json(
        { error: `Stok tidak cukup (stok saat ini: ${bahan.stok} ${bahan.satuan})` },
        { status: 400 }
      )
    }

    const userId = user?.id || null
    const nomor = await nextStkNumber(userId)
    const created = await db.bahanKeluar.create({
      data: {
        nomor,
        tanggal: tanggal ? String(tanggal) : todayStr(),
        bahanId: bahan.id,
        bahanNama: bahan.nama,
        satuan: bahan.satuan,
        qty: qtyNum,
        tujuan: tujuan ? String(tujuan).trim() : '',
        catatan: catatan ? String(catatan) : '',
        userId,
      },
    })

    await recalcBahan(bahan.id)
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating stok keluar:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create stok keluar') },
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
    const { id, tanggal, qty, tujuan, catatan } = body

    if (!id) return NextResponse.json({ error: 'ID transaksi wajib diisi' }, { status: 400 })
    const existing = await db.bahanKeluar.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    const qtyNum = qty !== undefined ? Number(qty) : existing.qty
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Jumlah keluar harus lebih dari 0' }, { status: 400 })
    }

    await db.bahanKeluar.update({
      where: { id },
      data: {
        tanggal: tanggal ? String(tanggal) : existing.tanggal,
        qty: qtyNum,
        tujuan: tujuan !== undefined ? String(tujuan).trim() : existing.tujuan,
        catatan: catatan !== undefined ? String(catatan) : existing.catatan,
      },
    })

    await recalcBahan(existing.bahanId)
    const fresh = await db.bahanKeluar.findUnique({ where: { id } })
    return NextResponse.json(fresh)
  } catch (error: any) {
    console.error('Error updating stok keluar:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update stok keluar') },
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

    const existing = await db.bahanKeluar.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    await db.bahanKeluar.delete({ where: { id } })
    await recalcBahan(existing.bahanId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting stok keluar:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete stok keluar') },
      { status: 500 }
    )
  }
}
