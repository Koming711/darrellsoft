import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireGroupMenu, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError, isSchemaMissingError } from '@/lib/api-error'
import { ensurePgSchema } from '@/lib/auto-seed'

/**
 * PUT    /api/harga-customer/[id] — ubah customer / barang / harga / periode
 *        berlaku / status.
 *        Body: { customerId?, barangId?, price?, validFrom?, validUntil?, isActive? }
 *        Dropdown customer & barang di form aktif juga saat edit — pasangan
 *        baru divalidasi kepemilikan + unik per (barang, customer).
 * DELETE /api/harga-customer/[id] — hapus harga khusus (konfirmasi di UI).
 * id = id registrasi BarangCustomer. Akses dijaga canAccessRecord (isolasi
 * grup/user) + requireGroupMenu('harga-customer') untuk anggota grup.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function rowOf(reg: {
  id: string
  customerId: string
  barangId: string
  price: number
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
  updatedAt: Date
  barang: { kode: string; nama: string; satuan: string; jual: number; modal: number } | null
  customer: { name: string; companyName: string | null } | null
}) {
  return {
    id: reg.id,
    customerId: reg.customerId,
    // Nama pelanggan = nama yang terisi di Master Customer (Customer.name) —
    // sama persis dgn tampilan halaman Master Customer. companyName hanya
    // fallback bila nama kosong, agar tidak muncul nama lain di tabel.
    customerName: reg.customer?.name || reg.customer?.companyName?.trim() || '',
    barangId: reg.barangId,
    kode: reg.barang?.kode ?? '',
    namaBarang: reg.barang?.nama ?? '',
    satuan: reg.barang?.satuan ?? 'pcs',
    standardPrice: reg.barang?.jual ?? 0,
    hargaPokok: reg.barang?.modal ?? 0,
    harga: reg.price,
    validFrom: reg.validFrom,
    validUntil: reg.validUntil,
    isActive: reg.isActive,
    updatedAt: reg.updatedAt,
  }
}

const INCLUDE = {
  barang: { select: { kode: true, nama: true, satuan: true, jual: true, modal: true } },
  customer: { select: { name: true, companyName: true } },
} as const

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const menuErr = await requireGroupMenu(request, 'harga-customer')
    if (menuErr) return menuErr
    const user = getServerUser(request)!
    const { id } = await params
    const body = await request.json()
    const { customerId, barangId, price, validFrom, validUntil, isActive } = body as {
      customerId?: string
      barangId?: string
      price?: number | string
      validFrom?: string | null
      validUntil?: string | null
      isActive?: boolean
    }

    const reg = await db.barangCustomer.findUnique({ where: { id } })
    if (!reg || !(await canAccessRecord(user, reg.userId))) {
      return NextResponse.json({ error: 'Data harga tidak ditemukan' }, { status: 404 })
    }

    const data: {
      customerId?: string
      barangId?: string
      price?: number
      validFrom?: string | null
      validUntil?: string | null
      isActive?: boolean
    } = {}

    // Ganti pasangan customer/barang (dropdown form aktif juga saat edit).
    // Kepemilikan master baru divalidasi dgn canAccessRecord — sama seperti POST.
    const nextCustomerId = (customerId ?? '').toString().trim()
    const nextBarangId = (barangId ?? '').toString().trim()
    if (nextCustomerId && nextCustomerId !== reg.customerId) {
      const customer = await db.customer.findUnique({ where: { id: nextCustomerId } })
      if (!customer || !(await canAccessRecord(user, customer.userId))) {
        return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
      }
      data.customerId = nextCustomerId
    }
    if (nextBarangId && nextBarangId !== reg.barangId) {
      const barang = await db.barang.findUnique({ where: { id: nextBarangId } })
      if (!barang || !(await canAccessRecord(user, barang.userId))) {
        return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
      }
      data.barangId = nextBarangId
    }
    if (data.customerId || data.barangId) {
      // Unik per (barang, customer): pasangan baru tidak boleh sudah terdaftar
      // pada record lain — edit record itu atau hapus dulu.
      const dup = await db.barangCustomer.findUnique({
        where: {
          barangId_customerId: {
            barangId: data.barangId ?? reg.barangId,
            customerId: data.customerId ?? reg.customerId,
          },
        },
        select: { id: true },
      })
      if (dup && dup.id !== reg.id) {
        return NextResponse.json(
          {
            error:
              'Sudah ada harga khusus untuk customer & barang ini. Edit harga yang ada atau hapus dulu — tidak boleh ada dua harga aktif untuk pasangan yang sama.',
          },
          { status: 409 }
        )
      }
    }

    if (price !== undefined) {
      const harga = Number(price)
      if (!Number.isFinite(harga) || harga < 0) {
        return NextResponse.json({ error: 'Harga tidak boleh negatif' }, { status: 400 })
      }
      data.price = harga
    }
    if (validFrom !== undefined) {
      const from = (validFrom ?? '').toString().trim() || null
      if (from && !DATE_RE.test(from)) {
        return NextResponse.json({ error: 'Format tanggal harus yyyy-mm-dd' }, { status: 400 })
      }
      data.validFrom = from
    }
    if (validUntil !== undefined) {
      const until = (validUntil ?? '').toString().trim() || null
      if (until && !DATE_RE.test(until)) {
        return NextResponse.json({ error: 'Format tanggal harus yyyy-mm-dd' }, { status: 400 })
      }
      data.validUntil = until
    }
    if (isActive !== undefined) data.isActive = !!isActive

    const from = data.validFrom !== undefined ? data.validFrom : reg.validFrom
    const until = data.validUntil !== undefined ? data.validUntil : reg.validUntil
    if (from && until && until < from) {
      return NextResponse.json(
        { error: 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai' },
        { status: 400 }
      )
    }

    const updated = await db.barangCustomer.update({
      where: { id },
      data,
      include: INCLUDE,
    })
    return NextResponse.json(rowOf(updated))
  } catch (error: unknown) {
    // Unique (barangId, customerId) terlanggar di level DB — balas 409 ramah.
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        {
          error:
            'Sudah ada harga khusus untuk customer & barang ini. Edit harga yang ada atau hapus dulu.',
        },
        { status: 409 }
      )
    }
    console.error('PUT /api/harga-customer/[id] error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memperbarui harga customer') },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const menuErr = await requireGroupMenu(request, 'harga-customer')
    if (menuErr) return menuErr
    const user = getServerUser(request)!
    const { id } = await params

    // Self-heal: P2021/P2022 (skema PG belum termigrasi penuh) → migrate → retry sekali.
    // (Pola sama dgn GET /api/harga-customer — cegah "Gagal menghapus harga customer".)
    const attempt = async (): Promise<'ok' | 'notfound'> => {
      const reg = await db.barangCustomer.findUnique({ where: { id } })
      if (!reg || !(await canAccessRecord(user, reg.userId))) return 'notfound'
      await db.barangCustomer.delete({ where: { id } })
      return 'ok'
    }

    let result: 'ok' | 'notfound'
    try {
      result = await attempt()
    } catch (err) {
      if (!isSchemaMissingError(err)) throw err
      console.warn('⚠️ DELETE /api/harga-customer/[id] schema missing → ensurePgSchema & retry')
      await ensurePgSchema()
      result = await attempt()
    }

    if (result === 'notfound') {
      return NextResponse.json({ error: 'Data harga tidak ditemukan' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('DELETE /api/harga-customer/[id] error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus harga customer') },
      { status: 500 }
    )
  }
}
