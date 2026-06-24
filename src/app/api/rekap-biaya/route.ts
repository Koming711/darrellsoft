import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

// ===== Types =====
interface RekapBiayaItem {
  id: string
  nomorUrut: string
  printName: string
  customerName: string
  quantity: string
  paperName: string
  biayaBahanKertas: number
  biayaCetak: number
  biayaFinishing: number
  biayaOngkosLem: number
  biayaOngkosLemBorongan: number
  biayaBikinPiso: number
  biayaBikinPisoLabel: string
  subTotal: number
  createdAt: string
}

interface RekapBiayaResponse {
  success: true
  periode: { startDate: string | null; endDate: string | null }
  items: RekapBiayaItem[]
  grandTotal: {
    totalCetakan: number
    totalBahanKertas: number
    totalCetak: number
    totalFinishing: number
    totalOngkosLem: number
    totalOngkosLemBorongan: number
    totalBikinPiso: number
    totalBiaya: number
  }
}

// GET /api/rekap-biaya?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Aggregates all cost components from RiwayatCetakan (per-user isolation).
export async function GET(request: NextRequest): Promise<NextResponse<RekapBiayaResponse | { error: string }>> {
  try {
    const user = getServerUser(request)
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')

    const dataFilter = await getDataFilter(user)

    // Build date filter on createdAt
    const dateFilter: Record<string, Date> = {}
    if (startDateStr) {
      const start = new Date(startDateStr)
      start.setHours(0, 0, 0, 0)
      dateFilter.gte = start
    }
    if (endDateStr) {
      const end = new Date(endDateStr)
      end.setHours(23, 59, 59, 999)
      dateFilter.lte = end
    }

    const where: Record<string, unknown> = { ...dataFilter }
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter
    }

    // Fetch all RiwayatCetakan records for the user (and period).
    // take: 5000 is more than enough for any small/medium print shop.
    const records = await db.riwayatCetakan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    // Map each record to a normalized RekapBiayaItem with all 6 cost components.
    const items: RekapBiayaItem[] = records.map((r) => {
      // Biaya Cetak = ongkosCetak + ongkosCetak2 + hargaPlat + hargaPlat2
      // (plate cost + print labor cost, possibly across 2 machines)
      const biayaCetak =
        (r.ongkosCetak || 0) +
        (r.ongkosCetak2 || 0) +
        (r.hargaPlat || 0) +
        (r.hargaPlat2 || 0)

      // otherCost is the customizable "Biaya Lain 1" — default label is
      // "Biaya Bikin Piso" (set in hitung-cetakan/page.tsx).
      // We treat it as "Biaya Bikin Piso" and preserve the user's custom label.
      const biayaBikinPiso = r.otherCost || 0
      const biayaBikinPisoLabel = (r.otherCostLabel || 'Biaya Bikin Piso').trim() || 'Biaya Bikin Piso'

      return {
        id: r.id,
        nomorUrut: r.nomorUrut || '',
        printName: r.printName || '',
        customerName: r.customerName || '',
        quantity: r.quantity || '',
        paperName: r.paperName || '',
        biayaBahanKertas: r.totalPaperPrice || 0,
        biayaCetak,
        biayaFinishing: r.finishingCost || 0,
        biayaOngkosLem: r.glueCost || 0,
        biayaOngkosLemBorongan: r.glueBorongan || 0,
        biayaBikinPiso,
        biayaBikinPisoLabel,
        subTotal: r.subTotal || 0,
        createdAt: r.createdAt.toISOString(),
      }
    })

    const grandTotal = {
      totalCetakan: items.length,
      totalBahanKertas: items.reduce((s, it) => s + it.biayaBahanKertas, 0),
      totalCetak: items.reduce((s, it) => s + it.biayaCetak, 0),
      totalFinishing: items.reduce((s, it) => s + it.biayaFinishing, 0),
      totalOngkosLem: items.reduce((s, it) => s + it.biayaOngkosLem, 0),
      totalOngkosLemBorongan: items.reduce((s, it) => s + it.biayaOngkosLemBorongan, 0),
      totalBikinPiso: items.reduce((s, it) => s + it.biayaBikinPiso, 0),
      totalBiaya: 0,
    }
    grandTotal.totalBiaya =
      grandTotal.totalBahanKertas +
      grandTotal.totalCetak +
      grandTotal.totalFinishing +
      grandTotal.totalOngkosLem +
      grandTotal.totalOngkosLemBorongan +
      grandTotal.totalBikinPiso

    return NextResponse.json({
      success: true,
      periode: { startDate: startDateStr, endDate: endDateStr },
      items,
      grandTotal,
    })
  } catch (error) {
    console.error('GET /api/rekap-biaya error:', error)
    return NextResponse.json({ error: 'Gagal mengambil rekap biaya' }, { status: 500 })
  }
}
