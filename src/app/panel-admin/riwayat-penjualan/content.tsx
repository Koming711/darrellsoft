'use client'

import { useEffect, useState } from 'react'
import { Loader2, Receipt, TrendingUp, Clock } from 'lucide-react'
import { panelFetch } from '../panel-fetch'

interface PenjualanItem {
  id: string
  orderId: string
  packageName: string
  packageType: string
  grossAmount: number
  customerName: string
  customerPhone: string
  paymentType: string | null
  status: string
  settled: boolean
  createdAt: string
}

interface PenjualanData {
  items: PenjualanItem[]
  summary: {
    count: number
    total: number
    totalSettled: number
    pendingCount: number
    byStatus: Record<string, { count: number; total: number }>
  }
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

const STATUS_TINT: Record<string, string> = {
  settlement: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  capture: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  deny: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancel: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  expire: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  failure: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const fmtWaktu = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * RIWAYAT PENJUALAN — riwayat penjualan paket kepada akun yang mendaftar
 * (semua transaksi pembelian paket), dengan filter bulanan.
 */
export function RiwayatPenjualanContent() {
  const [month, setMonth] = useState('') // kosong = semua bulan
  const [data, setData] = useState<PenjualanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    const qs = month ? `?month=${encodeURIComponent(month)}` : ''
    panelFetch<PenjualanData>(`/api/panel-admin/penjualan${qs}`)
      .then(({ data, error, authError }) => {
        if (!alive || authError) return
        if (error) { setError(error); setData(null) }
        else if (data) { setData(data); setError('') }
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [month])

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      {/* Header halaman */}
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Riwayat Penjualan</h1>
        <p className="text-sm text-muted-foreground mt-1">Riwayat penjualan paket kepada akun yang mendaftar, dengan filter bulanan</p>
      </header>

      {/* Filter bulan */}
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="month-input" className="text-sm font-medium text-foreground">Bulan:</label>
        <input
          id="month-input"
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="border border-input rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {month && (
          <button
            onClick={() => setMonth('')}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Tampilkan semua
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-rose-50 text-rose-600 dark:bg-rose-950/40">
                <Receipt className="w-4.5 h-4.5" />
              </div>
              <p className="text-xl font-bold text-foreground">{data.summary.count}</p>
              <p className="text-xs text-muted-foreground mt-1">Jumlah Transaksi</p>
            </div>
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
              <p className="text-xl font-bold text-foreground truncate" title={rupiah(data.summary.totalSettled)}>{rupiah(data.summary.totalSettled)}</p>
              <p className="text-xs text-muted-foreground mt-1">Omset Berhasil (settled)</p>
            </div>
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-amber-50 text-amber-600 dark:bg-amber-950/40">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <p className="text-xl font-bold text-foreground">{data.summary.pendingCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Menunggu Pembayaran</p>
            </div>
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <p className="text-xl font-bold text-foreground truncate" title={rupiah(data.summary.total)}>{rupiah(data.summary.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Nilai Semua Transaksi</p>
            </div>
          </div>

          {/* Tabel transaksi */}
          {data.items.length === 0 ? (
            <div className="bg-card rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-muted-foreground text-sm">
              Belum ada penjualan paket untuk filter ini.
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tanggal</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pembeli</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paket</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Order ID</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Jumlah</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(p => (
                      <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmtWaktu(p.createdAt)}</td>
                        <td className="px-4 py-2.5 text-foreground max-w-40 truncate" title={`${p.customerName || '—'}${p.customerPhone ? ` • ${p.customerPhone}` : ''}`}>
                          {p.customerName || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{p.packageName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell max-w-44 truncate" title={p.orderId}>{p.orderId}</td>
                        <td className="px-4 py-2.5 text-right text-foreground whitespace-nowrap">{rupiah(p.grossAmount)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_TINT[p.status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
