'use client'

import { useEffect, useState } from 'react'
import { Loader2, UserPlus, FlaskConical, UserCheck, CalendarRange } from 'lucide-react'
import { panelFetch } from '../panel-fetch'

interface MonthRow {
  bulan: string
  bulanKe: number
  akunBaru: number
  demo: number
  aktif: number
  penggunaSistem: number
  kumulatif: number
}

interface LaporanData {
  year: number
  months: MonthRow[]
  totals: {
    akunBaru: number
    demo: number
    aktif: number
    penggunaSistem: number
  }
  bulanTerbanyak: { bulan: string; akunBaru: number }
}

/**
 * LAPORAN BULANAN — rekap pendaftaran akun per bulan:
 * berapa akun yang mendaftar setiap bulannya (demo vs aktif) + kumulatif.
 */
export function LaporanBulananContent() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<LaporanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    panelFetch<LaporanData>(`/api/panel-admin/laporan-bulanan?year=${year}`)
      .then(({ data, error, authError }) => {
        if (!alive || authError) return
        if (error) { setError(error); setData(null) }
        else if (data) { setData(data); setError('') }
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [year])

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const maxAkun = data ? Math.max(...data.months.map(m => m.akunBaru), 1) : 1

  const summaryCards = [
    { label: 'Total Akun Baru', value: data ? String(data.totals.akunBaru) : '—', sub: `tahun ${year}`, icon: UserPlus, tint: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Akun Demo', value: data ? String(data.totals.demo) : '—', sub: 'masa uji coba', icon: FlaskConical, tint: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Akun Aktif', value: data ? String(data.totals.aktif) : '—', sub: 'role pembeli', icon: UserCheck, tint: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Bulan Terbanyak', value: data ? data.bulanTerbanyak.bulan : '—', sub: data ? `${data.bulanTerbanyak.akunBaru} akun` : '', icon: CalendarRange, tint: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Header halaman */}
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Laporan Bulanan</h1>
        <p className="text-sm text-muted-foreground mt-1">Rekap pendaftaran akun per bulan — akun demo, akun aktif, dan kumulatif</p>
      </header>

      {/* Pilih tahun */}
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="year-select" className="text-sm font-medium text-foreground">Tahun:</label>
        <select
          id="year-select"
          value={year}
          onChange={e => setYear(parseInt(e.target.value, 10))}
          className="border border-input rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
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
          {/* Ringkasan tahunan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {summaryCards.map(c => (
              <div key={c.label} className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.tint}`}>
                  <c.icon className="w-4.5 h-4.5" />
                </div>
                <p className="text-lg md:text-xl font-bold text-foreground leading-tight truncate" title={c.value}>{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.label}{c.sub ? ` • ${c.sub}` : ''}</p>
              </div>
            ))}
          </div>

          {/* Grafik akun baru per bulan */}
          <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 md:p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground mb-4">Pendaftaran Akun per Bulan {data.year}</h2>
            <div className="flex items-end gap-1.5 md:gap-3 h-40">
              {data.months.map(m => (
                <div key={m.bulanKe} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${m.bulan}: ${m.akunBaru} akun baru`}>
                  <span className="text-[10px] text-muted-foreground hidden md:block">{m.akunBaru !== 0 ? m.akunBaru : ''}</span>
                  <div
                    className="w-full rounded-t-md bg-emerald-500/80 transition-all"
                    style={{ height: `${Math.max(4, (m.akunBaru / maxAkun) * 100)}%` }}
                  />
                  <span className="text-[10px] md:text-xs text-muted-foreground">{m.bulan}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabel detail */}
          <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bulan</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Akun Baru</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Demo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aktif</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Pengguna Sistem</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kumulatif</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map(m => (
                    <tr key={m.bulanKe} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-medium text-foreground">{m.bulan}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${m.akunBaru > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{m.akunBaru}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 dark:text-amber-400">{m.demo || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400">{m.aktif || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{m.penggunaSistem || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{m.kumulatif}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-muted/40 font-semibold">
                    <td className="px-4 py-3 text-foreground">TOTAL {data.year}</td>
                    <td className="px-4 py-3 text-right text-foreground">{data.totals.akunBaru}</td>
                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">{data.totals.demo}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-400">{data.totals.aktif}</td>
                    <td className="px-4 py-3 text-right text-foreground">{data.totals.penggunaSistem}</td>
                    <td className="px-4 py-3 text-right text-foreground">{data.totals.akunBaru}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
