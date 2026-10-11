'use client'

import { useEffect, useState } from 'react'
import { Loader2, UserPlus, MessageCircle } from 'lucide-react'
import { panelFetch } from '../panel-fetch'

interface AuditItem {
  id: string
  type: 'registrasi' | 'otp'
  message: string
  detail: string
  timestamp: string
}

interface AuditData {
  items: AuditItem[]
  counts: Record<string, number>
  total: number
}

const TYPE_META: Record<AuditItem['type'], { label: string; icon: any; tint: string }> = {
  registrasi: { label: 'Registrasi', icon: UserPlus, tint: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40' },
  otp: { label: 'OTP', icon: MessageCircle, tint: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
}

const fmtWaktu = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * LAPORAN DAN AUDIT — jejak aktivitas PENDAFTARAN AKUN:
 * akun yang terdaftar & OTP WhatsApp yang dikirim dalam alur pendaftaran.
 */
export function LaporanAuditContent() {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'semua' | AuditItem['type']>('semua')

  useEffect(() => {
    let alive = true
    panelFetch<AuditData>('/api/panel-admin/audit?limit=150')
      .then(({ data, error, authError }) => {
        if (!alive || authError) return
        if (error) setError(error)
        else if (data) setData(data)
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const items = data ? (filter === 'semua' ? data.items : data.items.filter(i => i.type === filter)) : []

  const filterTabs: Array<{ key: 'semua' | AuditItem['type']; label: string }> = [
    { key: 'semua', label: `Semua${data ? ` (${data.items.length})` : ''}` },
    { key: 'registrasi', label: `Registrasi${data ? ` (${data.counts.registrasi || 0})` : ''}` },
    { key: 'otp', label: `OTP${data ? ` (${data.counts.otp || 0})` : ''}` },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">
      {/* Header halaman */}
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Laporan dan Audit</h1>
        <p className="text-sm text-muted-foreground mt-1">Laporan dan audit pendaftaran akun: akun terdaftar &amp; OTP WhatsApp</p>
      </header>

      {/* Filter tipe */}
      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Filter jenis aktivitas pendaftaran">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors border ${
              filter === tab.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-card text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
        items.length === 0 ? (
          <div className="bg-card rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-muted-foreground text-sm">
            Belum ada aktivitas pendaftaran akun untuk filter ini.
          </div>
        ) : (
          <ol className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-4">
            {items.map(item => {
              const meta = TYPE_META[item.type]
              return (
                <li key={item.id} className="ml-6">
                  <span className={`absolute -left-[15px] w-7 h-7 rounded-full border-2 border-background flex items-center justify-center ${meta.tint}`}>
                    <meta.icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{item.message}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtWaktu(item.timestamp)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{item.detail}</p>
                    <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.tint}`}>
                      {meta.label}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        )
      )}
    </div>
  )
}
