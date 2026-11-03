import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, requireGroupMenu, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError, isSchemaMissingError } from '@/lib/api-error'
import { ensurePgSchema } from '@/lib/auto-seed'
import { containsI } from '@/lib/search'

/**
 * HARGA CUSTOMER — daftar harga jual khusus per customer per barang.
 * Dibangun DI ATAS tabel BarangCustomer yang sudah ada (registrasi barang→
 * customer + harga khusus) — tidak membuat master customer/barang baru.
 *
 * Kolom periode berlaku: validFrom / validUntil ('yyyy-mm-dd', null = bebas)
 * + isActive. Unik per (barangId, customerId) — struktur DB mencegah dua
 * harga aktif tumpang tindih untuk pasangan yang sama (aturan prioritas harga).
 *
 * GET  /api/harga-customer?q=&customerId=&barangId=&status=aktif|nonaktif
 *      → daftar harga (join customer + barang), terisolasi per grup/user.
 * POST /api/harga-customer { customerId, barangId, price, validFrom?, validUntil? }
 *      → tambah harga khusus (tolak duplikat & harga negatif).
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

/** Query daftar harga (dipisah agar bisa di-retry setelah self-heal schema). */
async function loadHargaCustomer(
  dataFilter: Record<string, unknown>,
  sp: URLSearchParams
) {
  const q = (sp.get('q') ?? '').trim()
  const customerId = (sp.get('customerId') ?? '').trim()
  const barangId = (sp.get('barangId') ?? '').trim()
  const status = (sp.get('status') ?? '').trim()

  const where: Record<string, unknown> = { ...dataFilter }
  if (customerId) where.customerId = customerId
  if (barangId) where.barangId = barangId
  if (status === 'aktif') where.isActive = true
  else if (status === 'nonaktif') where.isActive = false
  if (q) {
    where.OR = [
      { customer: { is: { name: containsI(q) } } },
      { customer: { is: { companyName: containsI(q) } } },
      { barang: { is: { nama: containsI(q) } } },
      { barang: { is: { kode: containsI(q) } } },
    ]
  }

  const regs = await db.barangCustomer.findMany({
    where,
    include: {
      barang: { select: { kode: true, nama: true, satuan: true, jual: true, modal: true } },
      customer: { select: { name: true, companyName: true } },
    },
    orderBy: [{ customer: { name: 'asc' } }, { barang: { nama: 'asc' } }],
    take: 2000,
  })

  return regs.filter((r) => r.barang && r.customer).map(rowOf)
}

export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)
    const sp = new URL(request.url).searchParams

    try {
      const rows = await loadHargaCustomer(dataFilter, sp)
      return NextResponse.json(rows, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    } catch (error: unknown) {
      // Self-heal produksi (PG): kolom/tabel BarangCustomer belum termigrasi
      // (mis. validFrom/validUntil/isActive) → migrasi lalu coba ulang sekali
      // sehingga user yang masih login tidak perlu logout/login dulu.
      if (!isSchemaMissingError(error)) throw error
      console.warn('GET /api/harga-customer: schema lama terdeteksi, jalankan migrasi & retry')
      await ensurePgSchema()
      const rows = await loadHargaCustomer(dataFilter, sp)
      return NextResponse.json(rows, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }
  } catch (error: unknown) {
    console.error('GET /api/harga-customer error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memuat daftar harga customer') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const menuErr = await requireGroupMenu(request, 'harga-customer')
    if (menuErr) return menuErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { customerId, barangId, price, validFrom, validUntil } = body as {
      customerId?: string
      barangId?: string
      price?: number | string
      validFrom?: string | null
      validUntil?: string | null
    }

    if (!customerId || !barangId) {
      return NextResponse.json({ error: 'Customer dan barang wajib dipilih' }, { status: 400 })
    }
    const harga = Number(price)
    if (!Number.isFinite(harga) || harga < 0) {
      return NextResponse.json({ error: 'Harga tidak boleh negatif' }, { status: 400 })
    }
    const from = (validFrom ?? '').toString().trim() || null
    const until = (validUntil ?? '').toString().trim() || null
    if ((from && !DATE_RE.test(from)) || (until && !DATE_RE.test(until))) {
      return NextResponse.json({ error: 'Format tanggal harus yyyy-mm-dd' }, { status: 400 })
    }
    if (from && until && until < from) {
      return NextResponse.json(
        { error: 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai' },
        { status: 400 }
      )
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer || !(await canAccessRecord(user, customer.userId))) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }
    const barang = await db.barang.findUnique({ where: { id: barangId } })
    if (!barang || !(await canAccessRecord(user, barang.userId))) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }

    // Cegah duplikasi ATOMIK (spec: transaksi database + validasi server):
    // dup-check + create dalam satu transaksi; unique DB (barangId_customerId)
    // menjadi pengaman terakhir bila ada race condition.
    const reg = await db.$transaction(async (tx) => {
      const dup = await tx.barangCustomer.findUnique({
        where: { barangId_customerId: { barangId, customerId } },
        select: { id: true },
      })
      if (dup) return null
      return tx.barangCustomer.create({
        data: {
          barangId,
          customerId,
          price: harga,
          validFrom: from,
          validUntil: until,
          isActive: true,
          userId: user.id,
        },
        include: {
          barang: { select: { kode: true, nama: true, satuan: true, jual: true, modal: true } },
          customer: { select: { name: true, companyName: true } },
        },
      })
    })

    if (!reg) {
      return NextResponse.json(
        {
          error:
            'Sudah ada harga khusus untuk customer & barang ini. Edit harga yang ada atau hapus dulu — tidak boleh ada dua harga aktif untuk pasangan yang sama.',
        },
        { status: 409 }
      )
    }

    return NextResponse.json(rowOf(reg), { status: 201 })
  } catch (error: unknown) {
    console.error('POST /api/harga-customer error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menyimpan harga customer') },
      { status: 500 }
    )
  }
}
