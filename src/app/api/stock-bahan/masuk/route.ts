import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { recalcBahan, nextStkNumber, todayStr } from '@/lib/stock-bahan-server'

/**
 * CRUD Stok Masuk (pembelian/penerimaan bahan).
 * Setiap create/update/delete memicu recalcBahan → stok & saldo riwayat
 * selalu konsisten (stok = replay seluruh transaksi).
 *
 * GET    ?bahanId= &dari= &sampai= &q=
 * POST   { bahanId, tanggal?, qty, hargaBeli?, suplierId?, suplierNama?, nomorNota?, catatan? }
 * PUT    { id, tanggal?, qty?, hargaBeli?, suplierId?, suplierNama?, nomorNota?, catatan? }
 * DELETE ?id=xxx
 */

async function loadMasuk(user: Awaited<ReturnType<typeof getServerUser>>, sp: URLSearchParams) {
  const bahanId = sp.get('bahanId') || undefined
  const dari = sp.get('dari') || ''
  const sampai = sp.get('sampai') || ''
  const q = (sp.get('q') || '').trim().toLowerCase()

  const bahanWhere = bahanId ? { bahanId } : {}
  let rows = await db.bahanMasuk.findMany({
    where: { ...(await getDataFilter(user)), ...bahanWhere },
    orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  })

  if (dari) rows = rows.filter((r) => r.tanggal >= dari)
  if (sampai) rows = rows.filter((r) => r.tanggal <= sampai)
  if (q) {
    rows = rows.filter(
      (r) =>
        r.bahanNama.toLowerCase().includes(q) ||
        r.suplierNama.toLowerCase().includes(q) ||
        r.nomorNota.toLowerCase().includes(q) ||
        r.nomor.toLowerCase().includes(q)
    )
  }
  return rows
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const rows = await loadMasuk(user, request.nextUrl.searchParams)
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching stok masuk:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch stok masuk') },
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
    const { bahanId, tanggal, qty, hargaBeli, suplierId, suplierNama, nomorNota, catatan } = body

    if (!bahanId) return NextResponse.json({ error: 'Bahan wajib dipilih' }, { status: 400 })
    const qtyNum = Number(qty)
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Jumlah masuk harus lebih dari 0' }, { status: 400 })
    }
    const hargaNum = Math.max(0, Number(hargaBeli) || 0)

    const bahan = await db.bahan.findUnique({ where: { id: String(bahanId) } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const userId = user?.id || null
    const nomor = await nextStkNumber(userId)
    const created = await db.bahanMasuk.create({
      data: {
        nomor,
        tanggal: tanggal ? String(tanggal) : todayStr(),
        bahanId: bahan.id,
        bahanNama: bahan.nama,
        satuan: bahan.satuan,
        qty: qtyNum,
        hargaBeli: hargaNum,
        total: qtyNum * hargaNum,
        suplierId: suplierId ? String(suplierId) : null,
        suplierNama: suplierNama ? String(suplierNama).trim() : bahan.suplierNama,
        nomorNota: nomorNota ? String(nomorNota).trim() : '',
        catatan: catatan ? String(catatan) : '',
        userId,
      },
    })

    await recalcBahan(bahan.id)
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating stok masuk:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create stok masuk') },
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
    const { id, tanggal, qty, hargaBeli, suplierId, suplierNama, nomorNota, catatan } = body

    if (!id) return NextResponse.json({ error: 'ID transaksi wajib diisi' }, { status: 400 })
    const existing = await db.bahanMasuk.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    const qtyNum = qty !== undefined ? Number(qty) : existing.qty
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Jumlah masuk harus lebih dari 0' }, { status: 400 })
    }
    const hargaNum = hargaBeli !== undefined ? Math.max(0, Number(hargaBeli) || 0) : existing.hargaBeli

    await db.bahanMasuk.update({
      where: { id },
      data: {
        tanggal: tanggal ? String(tanggal) : existing.tanggal,
        qty: qtyNum,
        hargaBeli: hargaNum,
        total: qtyNum * hargaNum,
        suplierId: suplierId !== undefined ? (suplierId ? String(suplierId) : null) : existing.suplierId,
        suplierNama: suplierNama !== undefined ? String(suplierNama).trim() : existing.suplierNama,
        nomorNota: nomorNota !== undefined ? String(nomorNota).trim() : existing.nomorNota,
        catatan: catatan !== undefined ? String(catatan) : existing.catatan,
      },
    })

    await recalcBahan(existing.bahanId)
    const fresh = await db.bahanMasuk.findUnique({ where: { id } })
    return NextResponse.json(fresh)
  } catch (error: any) {
    console.error('Error updating stok masuk:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update stok masuk') },
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

    const existing = await db.bahanMasuk.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    await db.bahanMasuk.delete({ where: { id } })
    await recalcBahan(existing.bahanId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting stok masuk:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete stok masuk') },
      { status: 500 }
    )
  }
}
