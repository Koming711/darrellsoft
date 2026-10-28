'use client'

// HubTabs — navigasi sub-tab untuk seksi Panel Admin satu halaman.
// Sub-tab tersimpan di query ?sub= agar deep-link dapat dibagikan, sementara
// query lain (mis. ?tab=pembayaran yang memilih seksi sidebar) DIPERTAHANKAN
// saat berpindah sub-tab. Hanya sub aktif yang dirender (data dimuat ulang saat ganti).

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface HubTab {
  key: string
  label: string
  icon: LucideIcon
  /** Angka badge opsional (mis. jumlah antrean) */
  count?: number
}

export function HubTabs({ tabs, param = 'sub' }: { tabs: HubTab[]; param?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get(param) || tabs[0]?.key || ''

  // Ganti sub-tab TANPA menghilangkan query lain — ?tab=<seksi> harus tetap ada
  // agar sidebar tetap menyorot seksi yang benar (bug lama: menimpa ?tab= → lempar ke Beranda).
  const select = (key: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set(param, key)
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  return (
    <div
      role="tablist"
      aria-label="Bagian halaman"
      className="flex flex-wrap gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm dark:bg-slate-950"
    >
      {tabs.map((t) => {
        const isActive = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(t.key)}
            className={cn(
              'flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
            )}
          >
            <t.icon className="h-3.5 w-3.5 shrink-0" />
            <span>{t.label}</span>
            {typeof t.count === 'number' && t.count > 0 && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Baca sub-tab aktif dari query ?sub= (fallback: tab pertama) */
export function useHubTab(tabs: HubTab[], param = 'sub'): string {
  const searchParams = useSearchParams()
  const raw = searchParams.get(param) || ''
  return tabs.some((t) => t.key === raw) ? raw : tabs[0]?.key || ''
}
