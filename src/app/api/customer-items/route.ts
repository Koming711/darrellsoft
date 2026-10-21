import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/customer-items?customerId=xxx
 * Daftar barang milik satu customer (harus milik user yang login).
 * Tanpa customerId → semua barang milik user (dipakai untuk lookup cepat).
 *
 * DIBANGUN DI ATAS MODEL REAL: Barang (master barang per user) + BarangCustomer
 * (registrasi barang→customer + harga khusus). Kontrak flat dipertahankan:
 * { id, customerId, barangId, name, satuan, harga, userId, createdAt }
 * — id = id registrasi BarangCustomer (dipakai PUT/DELETE [id]).
 */

/** Registrasi BarangCustomer (+ barang) → bentuk flat yang dikonsumsi UI. */
function toFlat(reg: {
  id: string
  customerId: string
  barangId: string
  price: number
  userId: string | null
  createdAt: Date
  barang: { nama: string; satuan: string } | null
}) {
  return {
    id: reg.id,
    customerId: reg.customerId,
    barangId: reg.barangId,
    name: reg.barang?.nama ?? '',
    satuan: reg.barang?.satuan ?? 'pcs',
    harga: reg.price,
    userId: reg.userId,
    createdAt: reg.createdAt,
  }
}

async function loadFlat(customerId?: string | null) {
  const regs = await db.barangCustomer.findMany({
    where: customerId ? { customerId } : {},
    include: { barang: { select: { nama: true, satuan: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return regs.filter((r) => r.barang).map(toFlat)
}

/** Kode ITM-xxx unik per user: mulai dari count+1, loop sampai unik. (Sama dgn /api/items) */
async function nextKode(userId: string): Promise<string> {
  const count = await db.barang.count({ where: { userId } })
  let n = count + 1
  for (;;) {
    const kode = `ITM-${String(n).padStart(3, '0')}`
    const exists = await db.barang.findFirst({ where: { userId, kode } })
    if (!exists) return kode
    n += 1
  }
}

export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const customerId = request.nextUrl.searchParams.get('customerId')

    if (customerId) {
      // Pastikan customer benar-benar milik user (strict per-user isolation)
      const customer = await db.customer.findUnique({ where: { id: customerId } })
      if (!customer) {
        return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
      }
      if (customer.userId !== user.id) {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
      }
    }

    const items = await loadFlat(customerId)
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching customer items:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memuat daftar barang') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/customer-items
 * Body: { customerId, name, satuan?, harga? }
 * Barang master (Barang) dibuat/dipakai-ulang by nama, lalu diregistrasikan
 * ke customer (BarangCustomer) dengan harga khusus.
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { customerId, name, satuan, harga } = body

    if (!customerId || !name || String(name).trim() === '') {
      return NextResponse.json(
        { error: 'Customer dan nama barang wajib diisi' },
        { status: 400 }
      )
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }
    if (customer.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const nama = String(name).trim()
    const satuanNorm = satuan ? String(satuan).trim() || 'pcs' : 'pcs'
    const hargaNum = Number(harga) || 0

    // Barang master milik user: pakai-ulang bila nama sama, else buat baru (kode ITM-xxx)
    let barang = await db.barang.findFirst({ where: { userId: user.id, nama: nama } })
    if (!barang) {
      barang = await db.barang.create({
        data: {
          userId: user.id,
          kode: await nextKode(user.id),
          nama,
          satuan: satuanNorm,
          jual: hargaNum,
        },
      })
    }

    // Registrasi barang → customer (harga khusus), unik per (barangId, customerId)
    const reg = await db.barangCustomer.upsert({
      where: { barangId_customerId: { barangId: barang.id, customerId } },
      update: { price: hargaNum },
      create: { barangId: barang.id, customerId, price: hargaNum, userId: user.id },
    })

    return NextResponse.json(
      toFlat({ ...reg, barang: { nama: barang.nama, satuan: barang.satuan } }),
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating customer item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menambahkan barang') },
      { status: 500 }
    )
  }
}
