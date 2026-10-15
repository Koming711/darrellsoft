import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { rankPaperCandidates, type RankCandidateInput } from '@/lib/cutting-optimizer'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/potong-kertas/optimize
 *
 * Mencari ukuran kertas paling efisien dari Master Kertas (tabel Paper) untuk
 * ukuran potongan + jumlah kebutuhan tertentu. Seluruh bahan, gramatur,
 * ukuran kertas dan harga diambil dari data Master Kertas yang sebenarnya —
 * tidak ada ukuran/harga fiktif.
 *
 * Body: { bahan, grammage, cutWidth, cutHeight, quantity, setelanKertas?, suplier?, optimizationMode? }
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
    }

    const bahan = String(body.bahan || '').trim()
    const grammage = Math.round(Number(body.grammage) || 0)
    const cutWidth = Number(body.cutWidth)
    const cutHeight = Number(body.cutHeight)
    const quantity = Math.round(Number(body.quantity) || 0)
    const setelanKertas = Math.max(0, Math.round(Number(body.setelanKertas) || 0))
    const suplier = String(body.suplier || '').trim()
    const optimizationMode = body.optimizationMode === 'fast' ? 'fast' : 'maximal'

    // --- Validasi input ---
    if (!bahan) {
      return NextResponse.json({ error: 'Nama bahan wajib dipilih' }, { status: 400 })
    }
    if (!(grammage > 0)) {
      return NextResponse.json({ error: 'Gramatur wajib dipilih' }, { status: 400 })
    }
    if (!(cutWidth > 0) || !(cutHeight > 0)) {
      return NextResponse.json({ error: 'Lebar & tinggi potongan wajib diisi (cm)' }, { status: 400 })
    }
    if (cutWidth > 500 || cutHeight > 500) {
      return NextResponse.json({ error: 'Ukuran potongan tidak wajar (maks 500 cm)' }, { status: 400 })
    }
    if (quantity < 0) {
      return NextResponse.json({ error: 'Jumlah kebutuhan tidak boleh negatif' }, { status: 400 })
    }

    // --- Ambil kandidat dari Master Kertas (Paper): bahan + gramatur (+ suplier) ---
    const where: Record<string, unknown> = { ...dataFilter }
    void where
    const papers = await db.paper.findMany({
      where: dataFilter,
      select: { id: true, name: true, grammage: true, width: true, height: true, pricePerRim: true, suplier: true },
    })

    const bahanLower = bahan.toLowerCase()
    const supLower = suplier.toLowerCase()
    let matching = papers.filter(p =>
      (p.name || '').trim().toLowerCase() === bahanLower &&
      p.grammage === grammage
    )
    if (suplier) {
      matching = matching.filter(p => (p.suplier || '').trim().toLowerCase() === supLower)
    }
    // dedupe ukuran + harga sama (Master bisa punya entri kembar) agar tabel
    // alternatif tidak penuh baris identik — simpan satu per kombinasi unik.
    const seen = new Set<string>()
    const candidates: RankCandidateInput[] = []
    for (const p of matching) {
      if (!(p.width > 0) || !(p.height > 0) || !(p.pricePerRim > 0)) continue
      const key = `${p.width.toFixed(2)}x${p.height.toFixed(2)}@${Math.round(p.pricePerRim)}|${(p.suplier || '').toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({
        paperId: p.id,
        paperName: p.name,
        suplier: p.suplier,
        grammage: p.grammage,
        paperWidth: p.width,
        paperHeight: p.height,
        pricePerRim: p.pricePerRim,
      })
    }

    if (matching.length === 0) {
      return NextResponse.json({
        ok: false,
        message: `Tidak ada bahan "${bahan}" ${grammage} gsm${suplier ? ` dari suplier ${suplier}` : ''} di Master Kertas. Periksa Master Harga Kertas atau pilih bahan lain.`,
        candidates: [],
      })
    }
    if (candidates.length === 0) {
      return NextResponse.json({
        ok: false,
        message: `Bahan "${bahan}" ${grammage} gsm ada, tetapi belum ada ukuran/harga kertas yang valid di Master Kertas.`,
        candidates: [],
      })
    }

    // --- Optimasi & peringkat ---
    const ranked = rankPaperCandidates(
      candidates,
      { bahan, grammage, cutWidth, cutHeight, quantity, setelanKertas, optimizationMode },
      { customerName: String(body.customerName || ''), optimizationMode }
    )

    if (ranked.length === 0) {
      return NextResponse.json({
        ok: false,
        message: `Tidak ada ukuran kertas ${bahan} ${grammage} gsm yang bisa memproduksi potongan ${cutWidth} × ${cutHeight} cm. Semua ukuran di Master Kertas lebih kecil dari potongan.`,
        candidates: [],
      })
    }

    return NextResponse.json({
      ok: true,
      input: { bahan, grammage, cutWidth, cutHeight, quantity, setelanKertas, suplier, optimizationMode },
      bestIndex: 0,
      candidates: ranked,
    })
  } catch (error) {
    console.error('Error optimizing paper cutting:', error)
    return NextResponse.json({ error: 'Gagal menghitung optimasi potongan kertas' }, { status: 500 })
  }
}
