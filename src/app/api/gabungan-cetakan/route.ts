import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { generateGabunganCetakanNumber, previewGabunganCetakanNumber } from '@/lib/doc-number'
import { hitungGabungan, buildSnapshot, type GabunganMetodeProfit } from '@/lib/gabungan-calc'

// ============================================================
// /api/gabungan-cetakan — CRUD dokumen GABUNGAN 2 Riwayat Hitung Cetakan
//
// GET  ?preview=next-number  → nomor GB berikutnya (tanpa menyimpan)
// GET  ?id=xxx               → detail satu dokumen
// GET                        → daftar semua dokumen gabungan milik user
// POST                       → buat dokumen gabungan baru
//
// Keamanan mengikuti pola proyek: cookie auth (getServerUser) + isolasi
// data ketat per-user (getDataFilter). Kedua riwayat sumber diverifikasi
// milik user & tidak boleh sama. Hasil kalkulasi SELALU dihitung ulang
// server-side dari data asli database.
// ============================================================

/** Ambil dua riwayat sumber milik user — return error NextResponse bila invalid. */
async function loadSources(
  id1: unknown,
  id2: unknown,
  dataFilter: Record<string, unknown>
): Promise<{ err?: NextResponse; r1?: Record<string, unknown>; r2?: Record<string, unknown> }> {
  const s1 = String(id1 ?? '').trim()
  const s2 = String(id2 ?? '').trim()
  if (!s1 || !s2) {
    return { err: NextResponse.json({ error: 'Pilih dua riwayat hitung cetakan terlebih dahulu.' }, { status: 400 }) }
  }
  if (s1 === s2) {
    return { err: NextResponse.json({ error: 'Kedua riwayat sumber tidak boleh sama.' }, { status: 400 }) }
  }
  const rows = await db.riwayatCetakan.findMany({
    where: { id: { in: [s1, s2] }, ...dataFilter },
  })
  const r1 = rows.find((r) => r.id === s1)
  const r2 = rows.find((r) => r.id === s2)
  if (!r1 || !r2) {
    return { err: NextResponse.json({ error: 'Riwayat sumber tidak ditemukan atau bukan milik Anda.' }, { status: 404 }) }
  }
  return { r1: r1 as unknown as Record<string, unknown>, r2: r2 as unknown as Record<string, unknown> }
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const preview = searchParams.get('preview')

    if (preview === 'next-number') {
      const nextNumber = await previewGabunganCetakanNumber(dataFilter)
      return NextResponse.json({ nextNumber })
    }

    if (id) {
      const doc = await db.gabunganHitungCetakan.findFirst({
        where: { id, ...dataFilter },
      })
      if (!doc) {
        return NextResponse.json({ error: 'Dokumen gabungan tidak ditemukan' }, { status: 404 })
      }
      return NextResponse.json(doc)
    }

    const docs = await db.gabunganHitungCetakan.findMany({
      where: dataFilter,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(docs)
  } catch (error) {
    console.error('Error fetching gabungan cetakan:', error)
    return NextResponse.json({ error: 'Gagal memuat dokumen gabungan' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)
    const body = await request.json()

    // === Validasi & verifikasi sumber ===
    const { err, r1, r2 } = await loadSources(body?.riwayatCetakanId1, body?.riwayatCetakanId2, dataFilter)
    if (err || !r1 || !r2) return (err ?? NextResponse.json({ error: 'Sumber tidak valid' }, { status: 400 }))

    // === Kalkulasi ulang server-side dari data asli ===
    const metode: GabunganMetodeProfit = body?.metodeProfit === 'seragam' ? 'seragam' : 'masing_masing'
    const hasil = hitungGabungan({
      src1: r1,
      src2: r2,
      jumlahPesananGabungan: body?.jumlahPesananGabungan,
      metodeProfit: metode,
      profitPercent: body?.profitPercent,
    })
    if (hasil.jumlahPesananGabungan <= 0) {
      return NextResponse.json(
        { error: 'Jumlah Pesanan Gabungan belum valid — tentukan jumlah pesanan gabungan terlebih dahulu.', peringatan: hasil.peringatan },
        { status: 400 }
      )
    }

    const nomorUrut = await generateGabunganCetakanNumber(dataFilter)
    const snapshot = buildSnapshot(r1, r2)

    const doc = await db.gabunganHitungCetakan.create({
      data: {
        nomorUrut,
        namaProyek: String(body?.namaProyek ?? '').slice(0, 200),
        customerName: String(r1.customerName ?? r2.customerName ?? ''),
        riwayatCetakanId1: String(r1.id),
        riwayatCetakanId2: String(r2.id),
        nomorSumber1: String(r1.nomorUrut ?? ''),
        nomorSumber2: String(r2.nomorUrut ?? ''),
        jumlahPesananGabungan: hasil.jumlahPesananGabungan,
        metodeProfit: hasil.metodeProfit,
        profitPercent: hasil.profitPercent,
        totalBiayaDasar: hasil.totalBiayaDasar,
        totalProfit: hasil.totalProfit,
        grandTotal: hasil.grandTotal,
        modalPerPcs: hasil.modalPerPcs,
        hargaJualPerPcs: hasil.hargaJualPerPcs,
        catatan: String(body?.catatan ?? '').slice(0, 2000),
        snapshotData: snapshot.length <= 500000 ? snapshot : buildSnapshot(null, null),
        userId: user.id,
      },
    })

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('Error creating gabungan cetakan:', error)
    return NextResponse.json({ error: 'Gagal menyimpan dokumen gabungan' }, { status: 500 })
  }
}
