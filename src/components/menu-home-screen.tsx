'use client'

/**
 * MenuHomeScreen — tampilan "app drawer" untuk popup Lainnya (mobile).
 * - Semua menu tampil sebagai ikon lepas dalam grid 4 KOLOM (tanpa folder),
 *   setiap ikon punya NAMA di bawahnya.
 * - Tekan lama ikon lalu geser untuk mengubah urutan (reorder).
 * - Susunan tersimpan di localStorage per user — geometri memakai satuan px
 *   eksplisit agar kebal pengaturan ukuran font user (rem).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Warna tile ala launcher Android (gradient) — key = href menu */
const TILE_GRADIENT: Record<string, string> = {
  '/pembukaan': 'from-sky-400 to-blue-600',
  '/potong-kertas': 'from-rose-500 to-red-600',
  '/hitung-cetakan': 'from-violet-500 to-purple-600',
  '/invoice': 'from-amber-400 to-orange-500',
  '/riwayat-pembayaran': 'from-emerald-400 to-green-600',
  '/surat-jalan': 'from-orange-400 to-amber-600',
  '/purchase-order': 'from-teal-400 to-cyan-600',
  '/hutang-dagang': 'from-red-500 to-rose-700',
  '/piutang-dagang': 'from-lime-400 to-green-600',
  '/master-customer': 'from-cyan-400 to-sky-600',
  '/master-barang': 'from-blue-400 to-blue-600',
  '/laporan/penjualan': 'from-green-400 to-emerald-600',
  '/laporan/rugi-laba': 'from-fuchsia-500 to-purple-600',
  '/biaya-operasional': 'from-pink-500 to-rose-600',
  '/hitung-finishing': 'from-purple-400 to-violet-600',
  '/hitung-ongkos-cetak': 'from-yellow-400 to-amber-500',
  '/hitung-harga-kertas': 'from-cyan-500 to-teal-600',
  '/master-harga-kertas': 'from-amber-500 to-yellow-600',
  '/master-ongkos-cetak': 'from-green-500 to-teal-600',
  '/master-finishing': 'from-pink-400 to-fuchsia-600',
  '/master-toko-pemasok': 'from-orange-500 to-red-600',
  '/administrasi/hak-akses': 'from-red-400 to-rose-600',
  '/administrasi/pengguna': 'from-sky-500 to-blue-600',
  '/administrasi/pengaturan': 'from-slate-400 to-slate-600',
}

export interface MenuAppItem {
  href: string
  title: string
  isPro: boolean
  icon: LucideIcon
  section?: string
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

interface DragInfo {
  x: number
  y: number
  icon: LucideIcon
  gradient: string
}

export function MenuHomeScreen({
  items,
  storageKey,
  isActiveHref,
  onOpenItem,
}: {
  items: MenuAppItem[]
  storageKey: string
  isActiveHref: (href: string) => boolean
  onOpenItem: (item: MenuAppItem) => void
}) {
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const [order, setOrder] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const pressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    sx: number
    sy: number
    started: boolean
    index: number
  } | null>(null)
  const overRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  /* Muat urutan tersimpan — dukung format baru (array string href) & format lama
     (array objek app/folder dari versi folder; entri folder diabaikan/dilepas) */
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(storageKey)
    } catch {
      raw = null
    }
    let parsed: unknown = null
    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
    }
    const byHref = new Map(itemsRef.current.map(i => [i.href, i]))
    const out: string[] = []
    const used = new Set<string>()
    if (Array.isArray(parsed)) {
      for (const r of parsed as unknown[]) {
        const href =
          typeof r === 'string'
            ? r
            : r && typeof r === 'object' &&
                (r as Record<string, unknown>).type === 'app' &&
                typeof (r as Record<string, unknown>).href === 'string'
              ? ((r as Record<string, unknown>).href as string)
              : null
        if (href && byHref.has(href) && !used.has(href)) {
          out.push(href)
          used.add(href)
        }
      }
    }
    for (const i of itemsRef.current) {
      if (!used.has(i.href)) out.push(i.href)
    }
    setOrder(out)
  }, [storageKey])

  const commit = useCallback(
    (next: string[]) => {
      setOrder(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* storage penuh / private mode — abaikan */
      }
    },
    [storageKey]
  )

  const itemByHref = useMemo(() => {
    const m = new Map<string, MenuAppItem>()
    for (const i of items) m.set(i.href, i)
    return m
  }, [items])

  /* ---------- Drag & drop reorder (pointer events, tekan lama) ---------- */

  const clearPress = () => {
    const p = pressRef.current
    if (p?.timer) clearTimeout(p.timer)
    pressRef.current = null
  }

  const startDrag = useCallback(
    (sx: number, sy: number, href: string, index: number) => {
      const it = itemByHref.get(href)
      if (!it) return
      try {
        navigator.vibrate?.(15)
      } catch {
        /* tidak didukung */
      }
      setDrag({ x: sx, y: sy, icon: it.icon, gradient: TILE_GRADIENT[href] ?? 'from-slate-400 to-slate-600' })
      setDragging(index)
      setOverIndex(null)
      overRef.current = null
    },
    [itemByHref]
  )

  const handlePointerDown = (e: React.PointerEvent, info: { index: number; href: string }) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    clearPress()
    const sx = e.clientX
    const sy = e.clientY
    pressRef.current = {
      sx,
      sy,
      started: false,
      index: info.index,
      timer: setTimeout(() => {
        const p = pressRef.current
        if (!p) return
        p.started = true
        startDrag(sx, sy, info.href, info.index)
      }, 280),
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* pointer capture opsional */
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = pressRef.current
    if (!p) return
    if (!p.started) {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) clearPress()
      return
    }
    e.preventDefault()
    setDrag(prev => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const tile = el?.closest('[data-tile-index]') as HTMLElement | null
    const idx = tile ? Number(tile.getAttribute('data-tile-index')) : null
    overRef.current = idx
    setOverIndex(idx)
  }

  const handlePointerEnd = (cancel: boolean) => {
    const p = pressRef.current
    if (!p) return
    clearPress()
    if (!p.started || cancel) {
      setDragging(null)
      setDrag(null)
      return
    }
    setDragging(null)
    setDrag(null)
    suppressClickRef.current = true
    setTimeout(() => {
      suppressClickRef.current = false
    }, 80)

    const o = overRef.current
    if (o === null || o === p.index) return
    setOrder(prev => {
      if (!prev) return prev
      const next = [...prev]
      const [moved] = next.splice(p.index, 1)
      if (!moved) return prev
      let to = o
      if (to > p.index) to -= 1
      next.splice(clamp(to, 0, next.length), 0, moved)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* storage penuh / private mode — abaikan */
      }
      return next
    })
  }

  /* ---------- Render ---------- */

  const renderAppTile = (href: string, index: number) => {
    const item = itemByHref.get(href)
    if (!item) return null
    const active = isActiveHref(item.href)
    const isDragSource = dragging === index
    const isOver = overIndex === index && overIndex !== dragging
    return (
      <button
        key={href}
        type="button"
        data-tile-index={index}
        onClick={() => {
          if (suppressClickRef.current) return
          onOpenItem(item)
        }}
        onPointerDown={e => handlePointerDown(e, { index, href })}
        onPointerMove={handlePointerMove}
        onPointerUp={() => handlePointerEnd(false)}
        onPointerCancel={() => handlePointerEnd(true)}
        className={cn(
          'relative flex touch-none flex-col items-center justify-start gap-[5px] rounded-[12px] px-[3px] py-[6px] transition-colors select-none',
          item.isPro ? 'opacity-70' : '',
          active ? 'bg-white/15' : 'hover:bg-white/10',
          isDragSource && 'opacity-30',
          isOver && 'ring-2 ring-white/70'
        )}
        aria-label={item.title}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-[17px] bg-gradient-to-br shadow-md [&>svg]:h-[31px] [&>svg]:w-[31px] [&>svg]:text-white [&>svg]:drop-shadow-sm',
            '[@media(min-height:800px)]:h-[62px] [@media(min-height:800px)]:w-[62px] [@media(min-height:800px)]:rounded-[19px] [@media(min-height:800px)]:[&>svg]:h-[34px] [@media(min-height:800px)]:[&>svg]:w-[34px]',
            '[@media(max-height:700px)]:h-[46px] [@media(max-height:700px)]:w-[46px] [@media(max-height:700px)]:rounded-[14px] [@media(max-height:700px)]:[&>svg]:h-[25px] [@media(max-height:700px)]:[&>svg]:w-[25px]',
            TILE_GRADIENT[item.href] ?? 'from-slate-400 to-slate-600',
            active && 'ring-2 ring-white/80'
          )}
        >
          <item.icon strokeWidth={2.1} />
        </span>
        <span
          className={cn(
            'line-clamp-2 text-center text-[11px] font-medium leading-[1.15] text-white',
            '[@media(min-height:800px)]:text-[12px]',
            active && 'font-bold'
          )}
        >
          {item.title}
        </span>
        {item.isPro && (
          <span className="absolute right-[2px] top-[2px] rounded-[2px] bg-amber-500 px-[3px] py-px text-[7px] font-black leading-none text-white shadow">
            PRO
          </span>
        )}
      </button>
    )
  }

  if (!order) return null

  return (
    <div className="relative">
      {/* ===== APP DRAWER (grid 4 kolom, semua menu lepas + nama) ===== */}
      <div className="px-[10px] pt-[2px]" data-drop-grid>
        <p className="mb-[8px] text-center text-[9px] leading-snug text-white/55">
          Tekan lama ikon lalu geser untuk memindah
        </p>
        <div className="grid grid-cols-4 gap-x-[4px] gap-y-[10px]">
          {order.map((href, idx) => renderAppTile(href, idx))}
        </div>
      </div>

      {/* ===== GHOST ikon saat digeser ===== */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%)' }}
        >
          <div
            className={cn(
              'flex h-[62px] w-[62px] rotate-3 items-center justify-center rounded-[17px] bg-gradient-to-br shadow-2xl [&>svg]:h-[34px] [&>svg]:w-[34px] [&>svg]:text-white',
              drag.gradient
            )}
          >
            <drag.icon strokeWidth={2.1} />
          </div>
        </div>
      )}
    </div>
  )
}
