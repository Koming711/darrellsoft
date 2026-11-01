import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireGroupMenu, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * PUT    /api/harga-customer/[id] — ubah harga / periode berlaku / status.
 *        Body: { price?, validFrom?, validUntil?, isActive? }
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
    customerName: reg.customer?.companyName?.trim() || reg.customer?.name || '',
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
    const { price, validFrom, validUntil, isActive } = body as {
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
      price?: number
      validFrom?: string | null
      validUntil?: string | null
      isActive?: boolean
    } = {}

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

    const reg = await db.barangCustomer.findUnique({ where: { id } })
    if (!reg || !(await canAccessRecord(user, reg.userId))) {
      return NextResponse.json({ error: 'Data harga tidak ditemukan' }, { status: 404 })
    }

    await db.barangCustomer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('DELETE /api/harga-customer/[id] error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus harga customer') },
      { status: 500 }
    )
  }
}
