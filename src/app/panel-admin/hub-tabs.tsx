'use client'

// HubTabs — navigasi tab untuk halaman hub Panel Admin.
// Tab tersimpan di query ?tab= agar deep-link dapat dibagikan
// (mis. /panel-admin/pelanggan?tab=baru) dan sidebar tetap menyorot hub yang benar.
// Hanya tab aktif yang dirender (data dimuat ulang saat ganti tab).

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

export function HubTabs({ tabs, param = 'tab' }: { tabs: HubTab[]; param?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get(param) || tabs[0]?.key || ''

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
            onClick={() =>
              router.replace(`${pathname}?${param}=${t.key}`, { scroll: false })
            }
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

/** Baca tab aktif dari query ?tab= (fallback: tab pertama) */
export function useHubTab(tabs: HubTab[], param = 'tab'): string {
  const searchParams = useSearchParams()
  const raw = searchParams.get(param) || ''
  return tabs.some((t) => t.key === raw) ? raw : tabs[0]?.key || ''
}
