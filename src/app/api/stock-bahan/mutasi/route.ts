import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/stock-bahan/mutasi — riwayat mutasi stok.
 * Query opsional:
 * - bahanId: hanya mutasi bahan tersebut
 * - limit: batasi jumlah baris (default 100)
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const bahanId = request.nextUrl.searchParams.get('bahanId') || undefined
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100

    const where = {
      ...(await getDataFilter(user)),
      ...(bahanId ? { bahanId } : {}),
    }

    const mutasi = await db.bahanMutasi.findMany({
      where,
      include: {
        bahan: { select: { kode: true, nama: true, satuan: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(mutasi, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch mutasi bahan') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/stock-bahan/mutasi — catat stok masuk / keluar.
 * Body: { bahanId, jenis: 'masuk' | 'keluar', qty, keterangan? }
 * - Stok bahan ikut diperbarui (masuk: +qty, keluar: -qty).
 * - Keluar melebihi stok ditolak agar stok tidak minus.
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { bahanId, jenis, qty, keterangan } = body

    if (!bahanId) {
      return NextResponse.json({ error: 'Bahan wajib dipilih' }, { status: 400 })
    }
    if (jenis !== 'masuk' && jenis !== 'keluar') {
      return NextResponse.json({ error: 'Jenis mutasi tidak valid' }, { status: 400 })
    }
    const qtyNum = Number(qty)
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
    }

    const bahan = await db.bahan.findUnique({ where: { id: bahanId } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    if (jenis === 'keluar' && qtyNum > bahan.stok) {
      return NextResponse.json(
        { error: `Stok tidak cukup (stok saat ini: ${bahan.stok} ${bahan.satuan})` },
        { status: 400 }
      )
    }

    const stokBaru = jenis === 'masuk' ? bahan.stok + qtyNum : bahan.stok - qtyNum

    const [mutasi] = await db.$transaction([
      db.bahanMutasi.create({
        data: {
          bahanId,
          jenis,
          qty: qtyNum,
          stokSetelah: stokBaru,
          keterangan: keterangan ? String(keterangan) : '',
          userId: user?.id || null,
        },
      }),
      db.bahan.update({
        where: { id: bahanId },
        data: { stok: stokBaru },
      }),
    ])

    return NextResponse.json(mutasi, { status: 201 })
  } catch (error: any) {
    console.error('Error creating mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create mutasi bahan') },
      { status: 500 }
    )
  }
}
