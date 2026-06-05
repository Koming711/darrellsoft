'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Package, ArrowRight, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const pemasok = parsed.pemasok || {}
    const namaToko = pemasok.nama || entry.pihakKedua || ''
    const ppn = parsed.ppn || 0
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const totalHarga = subtotal + (subtotal * ppn / 100)
    return { namaToko, totalHarga }
  } catch {
    return { namaToko: '', totalHarga: 0 }
  }
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

export default function PembelianPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPOHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/history?docType=purchase-order', { headers: { 'Content-Type': 'application/json' } })
      if (res.ok) {
        const json = await res.json()
        setPoHistory(json.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPOHistory()
  }, [fetchPOHistory])

  const totalPembelian = poHistory.reduce((sum, po) => {
    const info = parseDocInfo(po)
    return sum + (info.totalHarga || 0)
  }, 0)

  return (
    <DashboardLayout title="Pembelian Barang" subtitle={t('subtitle_pembelian')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Pembelian</p>
            <p className="text-base sm:text-lg font-bold text-blue-700 leading-tight">{poHistory.length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Nilai Pembelian</p>
            <p className="text-base sm:text-lg font-bold text-emerald-700 leading-tight">{formatRupiahShort(totalPembelian)}</p>
          </div>
        </div>

        {/* Navigate to Riwayat Pembelian */}
        <button
          onClick={() => router.push('/riwayat-pembelian')}
          className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-slate-800">Riwayat Pembelian</p>
            <p className="text-xs text-slate-500 mt-0.5">Lihat semua riwayat purchase order</p>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </DashboardLayout>
  )
}
