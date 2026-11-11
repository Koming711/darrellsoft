'use client'

/**
 * MenuTagihanRekap — kartu "Rekap Tagihan per Customer" di popup menu Lainnya (mobile).
 *
 * - Sumber data sama dengan halaman Piutang Dagang: /api/history docType=invoice
 *   (rentang lebar), sisa = total − DP, status lunas = p.lunas === true
 *   (identik dgn perhitungan Piutang Dagang supaya angka konsisten).
 * - Hanya invoice BELUM lunas yang dihitung (invoice batal & lunas di-skip,
 *   selaras /api/beranda & laporan penjualan).
 * - Ringkas: total tagihan + daftar per customer (jumlah invoice & nominal sisa),
 *   tap baris / "Lihat semua" → buka halaman Piutang Dagang.
 * - Dimount hanya saat popup menu terbuka; GET dilayani smart-fetch (cache) jadi
 *   buka ulang menu tidak selalu memakan jaringan.
 * - Gagal memuat → kartu disembunyikan diam-diam (menu utama tetap fokus).
 */

import { useEffect, useState } from 'react'
import { ChevronRight, Coins } from 'lucide-react'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { useLanguage } from '@/contexts/language-context'
import type { TranslationKey } from '@/lib/i18n'

interface HistoryEntry {
  id: string
  nomor: string
  pihakKedua?: string
  dataJson: string
  tanggal?: string
}

interface CustomerTagihan {
  nama: string
  count: number
  total: number
}

// Maksimal baris customer yang tampil di kartu menu — sisanya diringkas
// menjadi "+ N customer lain" agar popup menu tetap ringkas (tanpa scroll
// bersarang di dalam popup).
const MAX_ROWS = 10

export function MenuTagihanRekap({ onOpenAll }: { onOpenAll: () => void }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [customers, setCustomers] = useState<CustomerTagihan[]>([])
  const [totalTagihan, setTotalTagihan] = useState(0)
  const [invoiceBelum, setInvoiceBelum] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const headers = getAuthHeaders()
        const resInv = await authFetch(
          '/api/history?docType=invoice&startDate=2000-01-01&endDate=2099-12-31',
          { headers }
        )
        if (!resInv.ok) throw new Error('gagal memuat invoice')
        const json = await resInv.json()
        const entries: HistoryEntry[] = json.data || []

        // Agregasi per customer: hanya invoice belum lunas (sisa = total − DP)
        const map = new Map<string, { count: number; total: number }>()
        let totalAll = 0
        let countAll = 0
        for (const entry of entries) {
          try {
            const p = JSON.parse(entry.dataJson) as Record<string, unknown>
            if (p.batal === true || p.batal === 'true') continue
            // Status lunas diambil dari field invoice itu sendiri — SAMA dengan
            // halaman Piutang Dagang supaya rekap menu & halaman konsisten.
            if (p.lunas === true) continue
            const itemsRaw = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []
            const subtotal = itemsRaw.reduce(
              (acc, it) => acc + Number(it.qty ?? 0) * Number(it.harga ?? 0),
              0
            )
            const ppn = Number(p.ppn ?? 0)
            const total = Math.round(subtotal + subtotal * (ppn / 100))
            const dpAmount =
              p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
                ? Math.round(Number(p.dpAmount))
                : Math.round(total * (Number(p.dp ?? 0) / 100))
            const sisa = Math.max(0, total - dpAmount)
            if (sisa <= 0) continue
            const clientObj = p.client as Record<string, unknown> | undefined
            const nama = String(clientObj?.nama ?? '') || entry.pihakKedua || '-'
            const prev = map.get(nama) ?? { count: 0, total: 0 }
            map.set(nama, { count: prev.count + 1, total: prev.total + sisa })
            totalAll += sisa
            countAll += 1
          } catch {
            /* skip dataJson rusak */
          }
        }

        if (cancelled) return
        const list: CustomerTagihan[] = Array.from(map.entries())
          .map(([nama, agg]) => ({ nama, count: agg.count, total: agg.total }))
          .sort((a, b) => b.total - a.total)
        setCustomers(list)
        setTotalTagihan(totalAll)
        setInvoiceBelum(countAll)
        setLoading(false)
      } catch {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) return null

  const shown = customers.slice(0, MAX_ROWS)
  const sisaCount = customers.length - shown.length

  return (
    <div
      className="mx-[12px] mt-[10px] rounded-[12px] border border-white/15 bg-white/10 p-[10px]"
      data-testid="menu-tagihan-rekap"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-[8px]">
        <p className="flex min-w-0 items-center gap-[6px] text-[10px] font-semibold uppercase tracking-wider text-white/60">
          <Coins className="h-[13px] w-[13px] shrink-0 text-amber-300" aria-hidden="true" />
          <span className="truncate">{t('rekap_tagihan' as TranslationKey)}</span>
        </p>
        <button
          type="button"
          onClick={onOpenAll}
          className="flex shrink-0 items-center gap-[2px] rounded-[6px] px-[6px] py-[3px] text-[11px] font-semibold text-amber-300 transition-colors hover:bg-white/15 active:bg-white/20"
          aria-label={t('rekap_tagihan_semua' as TranslationKey)}
        >
          {t('rekap_tagihan_semua' as TranslationKey)}
          <ChevronRight className="h-[13px] w-[13px]" aria-hidden="true" />
        </button>
      </div>

      {/* Total tagihan */}
      {loading ? (
        <div className="mt-[8px] space-y-[6px]" aria-hidden="true">
          <div className="h-[20px] w-[55%] animate-pulse rounded-[6px] bg-white/15" />
          <div className="h-[14px] w-[85%] animate-pulse rounded-[6px] bg-white/10" />
          <div className="h-[14px] w-[70%] animate-pulse rounded-[6px] bg-white/10" />
        </div>
      ) : customers.length === 0 ? (
        <p className="mt-[6px] flex items-center gap-[6px] text-[12px] font-medium text-emerald-300">
          <Coins className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
          {t('rekap_tagihan_lunas' as TranslationKey)}
        </p>
      ) : (
        <>
          <div className="mt-[6px] flex items-baseline gap-[6px]">
            <p className="text-[16px] font-bold leading-tight text-amber-300 tabular-nums">
              {formatRupiah(totalTagihan)}
            </p>
            <p className="shrink-0 text-[10px] text-white/60 tabular-nums">
              {invoiceBelum} {t('rekap_tagihan_belum' as TranslationKey)}
            </p>
          </div>

          {/* Daftar per customer */}
          <ul className="mt-[4px] divide-y divide-white/10" aria-label={t('rekap_tagihan' as TranslationKey)}>
            {shown.map((s) => (
              <li key={s.nama}>
                <button
                  type="button"
                  onClick={onOpenAll}
                  className="flex w-full items-center justify-between gap-[8px] rounded-[6px] px-[2px] py-[6px] text-left transition-colors hover:bg-white/10 active:bg-white/15"
                >
                  <span className="flex min-w-0 items-baseline gap-[5px]">
                    <span className="truncate text-[12px] font-semibold text-white">{s.nama}</span>
                    <span className="shrink-0 text-[10px] text-white/50 tabular-nums">
                      {s.count} inv
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-bold text-amber-300 tabular-nums">
                    {formatRupiah(s.total)}
                  </span>
                </button>
              </li>
            ))}
            {sisaCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={onOpenAll}
                  className="w-full rounded-[6px] px-[2px] py-[6px] text-left text-[11px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  + {sisaCount} customer lain
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
