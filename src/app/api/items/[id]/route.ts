import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

type Params = { params: Promise<{ id: string }> }

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Validasi data URL foto: harus image/* dan ≤ ~700 ribu karakter (base64 dari ≤300KB JPG). Return null jika tidak valid. */
function validatePhotoUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.startsWith('data:image/')) return null
  if (v.length > 700_000) return null
  return v
}

/**
 * PUT /api/items/:id — update barang (nama, satuan, harga jual, HPP, qty, keterangan, status aktif, foto).
 * Body: { name?, unit?, standardPrice?, hpp?, qty?, keterangan?, isActive?, photoUrl? }
 * photoUrl: null = hapus foto; data URL JPEG (≤300KB hasil kompresi client) = ganti foto;
 * undefined = foto tidak diubah (dipakai toggle status cepat).
 */
export async function PUT(
  request: NextRequest,
  { params }: Params
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.barang.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
    }

    const data: {
      nama?: string
      satuan?: string
      jual?: number
      modal?: number
      qty?: number
      keterangan?: string
      isActive?: boolean
      photoUrl?: string | null
    } = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) {
        return NextResponse.json({ error: 'Nama item wajib diisi' }, { status: 400 })
      }
      data.nama = name
    }
    if (body.unit !== undefined) {
      const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : null
      if (unit) data.satuan = unit
    }
    if (body.standardPrice !== undefined) {
      const standardPrice = toNumber(body.standardPrice)
      if (standardPrice === null || standardPrice < 0) {
        return NextResponse.json({ error: 'Harga standar tidak valid' }, { status: 400 })
      }
      data.jual = standardPrice
    }
    if (body.hpp !== undefined) {
      const hpp = toNumber(body.hpp)
      if (hpp === null || hpp < 0) {
        return NextResponse.json({ error: 'HPP tidak valid' }, { status: 400 })
      }
      data.modal = hpp
    }
    if (body.qty !== undefined) {
      const qty = body.qty === null || body.qty === '' ? 0 : toNumber(body.qty)
      if (qty === null || qty < 0) {
        return NextResponse.json({ error: 'Qty tidak valid (min 0)' }, { status: 400 })
      }
      data.qty = qty
    }
    if (body.keterangan !== undefined) {
      data.keterangan = typeof body.keterangan === 'string' ? body.keterangan.trim().slice(0, 500) : ''
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive tidak valid' }, { status: 400 })
      }
      data.isActive = body.isActive
    }
    if (body.photoUrl !== undefined) {
      if (body.photoUrl === null || body.photoUrl === '') {
        data.photoUrl = null
      } else {
        const p = validatePhotoUrl(body.photoUrl)
        if (p === null) {
          return NextResponse.json({ error: 'Foto barang tidak valid (maks 300KB, format data URL JPEG)' }, { status: 400 })
        }
        data.photoUrl = p
      }
    }

    const item = await db.barang.update({ where: { id }, data })

    return NextResponse.json({
      item: {
        id: item.id,
        code: item.kode,
        name: item.nama,
        unit: item.satuan,
        standardPrice: item.jual,
        hpp: item.modal,
        qty: item.qty,
        keterangan: item.keterangan,
        isActive: item.isActive,
        photoUrl: item.photoUrl,
        createdAt: item.createdAt.toISOString(),
      },
    })
  } catch (error: unknown) {
    console.error('Error updating item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update item') },
      { status: 500 }
    )
  }
}

/** DELETE /api/items/:id — hapus barang permanen (registrasi pelanggan ikut terhapus). */
export async function DELETE(
  request: NextRequest,
  { params }: Params
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.barang.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })
    }

    await db.barang.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    console.error('Error deleting item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete item') },
      { status: 500 }
    )
  }
}
