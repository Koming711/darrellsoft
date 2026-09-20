'use client'

/**
 * MenuHomeScreen — tampilan "home screen Android" untuk popup Lainnya (mobile).
 * - Ikon app (tile squircle gradient berwarna) + FOLDER ala home screen Android
 *   (tile 2 kolom berisi grid mini ikon, label di bawah).
 * - Tekan lama ikon lalu geser untuk memindah: reorder di home, reorder di dalam
 *   folder, masuk folder (geser app ke tile folder), keluar folder (geser ke luar grid).
 * - Susunan tersimpan di localStorage per user — geometri memakai satuan px eksplisit
 *   agar kebal pengaturan ukuran font user (rem).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, FolderPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'
import { TranslationKey } from '@/lib/i18n'

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

/* Definisi folder default — nama diambil dari i18n agar ikut bahasa */
const FOLDER_DEFS: { id: string; labelKey: TranslationKey; sections: (string | undefined)[] }[] = [
  { id: 'dokumen', labelKey: 'section_documents', sections: ['dokumen'] },
  { id: 'laporan', labelKey: 'section_laporan', sections: ['laporan'] },
  { id: 'biaya', labelKey: 'section_biaya', sections: ['biaya', 'biaya_produksi'] },
  { id: 'master', labelKey: 'section_print_master', sections: ['master_cetakan'] },
  { id: 'admin', labelKey: 'section_administration', sections: ['administrasi', 'setting'] },
]

/* Menu yang tampil sebagai ikon lepas di home (sisanya masuk folder) */
const STANDALONE_HREFS = ['/pembukaan', '/potong-kertas', '/hitung-cetakan']

export interface MenuAppItem {
  href: string
  title: string
  isPro: boolean
  icon: LucideIcon
  section?: string
}

type LayoutItem =
  | { type: 'app'; href: string }
  | { type: 'folder'; id: string; hrefs: string[] }

function buildDefaultLayout(items: MenuAppItem[]): LayoutItem[] {
  const byHref = new Map(items.map(i => [i.href, i]))
  const layout: LayoutItem[] = []
  const used = new Set<string>()

  for (const href of STANDALONE_HREFS) {
    if (byHref.has(href)) {
      layout.push({ type: 'app', href })
      used.add(href)
    }
  }
  for (const def of FOLDER_DEFS) {
    const hrefs = items.filter(i => def.sections.includes(i.section) && !used.has(i.href)).map(i => i.href)
    hrefs.forEach(h => used.add(h))
    if (hrefs.length > 0) layout.push({ type: 'folder', id: def.id, hrefs })
  }
  for (const i of items) {
    if (!used.has(i.href)) {
      layout.push({ type: 'app', href: i.href })
      used.add(i.href)
    }
  }
  return layout
}

function normalizeLayout(raw: unknown, items: MenuAppItem[]): LayoutItem[] {
  const byHref = new Map(items.map(i => [i.href, i]))
  const out: LayoutItem[] = []
  const used = new Set<string>()
  if (Array.isArray(raw)) {
    for (const r of raw as Array<Record<string, unknown>>) {
      if (r && r.type === 'app' && typeof r.href === 'string' && byHref.has(r.href) && !used.has(r.href)) {
        out.push({ type: 'app', href: r.href })
        used.add(r.href)
      } else if (r && r.type === 'folder' && typeof r.id === 'string' && Array.isArray(r.hrefs)) {
        const hrefs = (r.hrefs as unknown[]).filter(
          (h): h is string => typeof h === 'string' && byHref.has(h) && !used.has(h)
        )
        hrefs.forEach(h => used.add(h))
        if (hrefs.length > 0) out.push({ type: 'folder', id: r.id, hrefs })
      }
    }
  }
  for (const i of items) {
    if (!used.has(i.href)) out.push({ type: 'app', href: i.href })
  }
  return out
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

interface DragInfo {
  x: number
  y: number
  icon: LucideIcon
  gradient: string
}

interface OverInfo {
  index: number | null
  folderId: string | null
  outside: boolean
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
  const { t } = useLanguage()
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const [layout, setLayout] = useState<LayoutItem[] | null>(null)
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dragging, setDragging] = useState<{ index: number; folderId: string | null } | null>(null)
  const [over, setOver] = useState<OverInfo>({ index: null, folderId: null, outside: false })

  const pressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    sx: number
    sy: number
    started: boolean
    index: number
    kind: 'app' | 'folder'
    folderId: string | null
  } | null>(null)
  const overRef = useRef<OverInfo>({ index: null, folderId: null, outside: false })
  const suppressClickRef = useRef(false)

  /* Muat layout tersimpan — jika belum ada, pakai susunan default (app lepas + folder) */
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
    if (!Array.isArray(parsed)) {
      setLayout(buildDefaultLayout(itemsRef.current))
      return
    }
    setLayout(normalizeLayout(parsed, itemsRef.current))
  }, [storageKey])

  const commit = useCallback(
    (next: LayoutItem[]) => {
      setLayout(next)
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

  const folderName = useCallback(
    (id: string) => {
      const def = FOLDER_DEFS.find(d => d.id === id)
      return def ? t(def.labelKey) : id
    },
    [t]
  )

  /* ---------- Drag & drop (pointer events, tekan lama) ---------- */

  const clearPress = () => {
    const p = pressRef.current
    if (p?.timer) clearTimeout(p.timer)
    pressRef.current = null
  }

  const startDrag = useCallback(
    (sx: number, sy: number, href: string, index: number, folderId: string | null) => {
      const it = itemByHref.get(href)
      if (!it) return
      try {
        navigator.vibrate?.(15)
      } catch {
        /* tidak didukung */
      }
      setDrag({ x: sx, y: sy, icon: it.icon, gradient: TILE_GRADIENT[href] ?? 'from-slate-400 to-slate-600' })
      setDragging({ index, folderId })
      setOver({ index: null, folderId: null, outside: false })
      overRef.current = { index: null, folderId: null, outside: false }
    },
    [itemByHref]
  )

  const handlePointerDown = (
    e: React.PointerEvent,
    info: { index: number; kind: 'app' | 'folder'; href: string; folderId: string | null }
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    clearPress()
    const sx = e.clientX
    const sy = e.clientY
    pressRef.current = {
      sx,
      sy,
      started: false,
      index: info.index,
      kind: info.kind,
      folderId: info.folderId,
      timer: setTimeout(() => {
        const p = pressRef.current
        if (!p) return
        p.started = true
        startDrag(sx, sy, info.href, info.index, info.folderId)
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
    const folderTile = el?.closest('[data-folder-tile]') as HTMLElement | null
    const inGrid = el?.closest('[data-drop-grid]')
    const next: OverInfo = {
      index: tile ? Number(tile.getAttribute('data-tile-index')) : null,
      folderId: folderTile ? folderTile.getAttribute('data-folder-tile') : null,
      outside: !inGrid,
    }
    overRef.current = next
    setOver(next)
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
    const src = layout
    if (!src) return

    if (openFolder) {
      /* ===== DI DALAM FOLDER ===== */
      const fi = src.findIndex(it => it.type === 'folder' && it.id === openFolder)
      if (fi < 0) return
      const folder = src[fi] as Extract<LayoutItem, { type: 'folder' }>
      const hrefs = [...folder.hrefs]
      const [moved] = hrefs.splice(p.index, 1)
      if (!moved) return

      if (o.outside) {
        /* Keluarkan dari folder → sisipkan di home tepat setelah posisi folder */
        const next = [...src]
        if (hrefs.length === 0) {
          next.splice(fi, 1)
          next.splice(clamp(fi, 0, next.length), 0, { type: 'app', href: moved })
        } else {
          next[fi] = { type: 'folder', id: folder.id, hrefs }
          next.splice(clamp(fi + 1, 0, next.length), 0, { type: 'app', href: moved })
        }
        commit(next)
      } else if (o.index !== null) {
        let to = o.index
        if (to > p.index) to -= 1
        hrefs.splice(clamp(to, 0, hrefs.length), 0, moved)
        const next = [...src]
        next[fi] = { type: 'folder', id: folder.id, hrefs }
        commit(next)
      }
      return
    }

    /* ===== DI HOME ===== */
    const next = [...src]
    if (p.kind === 'app') {
      const removed = next.splice(p.index, 1)
      const app = removed[0] as Extract<LayoutItem, { type: 'app' }>
      if (o.folderId) {
        /* Masukkan app ke folder tujuan */
        const fi = next.findIndex(it => it.type === 'folder' && it.id === o.folderId)
        if (fi >= 0) {
          const folder = next[fi] as Extract<LayoutItem, { type: 'folder' }>
          if (!folder.hrefs.includes(app.href)) {
            next[fi] = { type: 'folder', id: folder.id, hrefs: [...folder.hrefs, app.href] }
          }
          commit(next)
          return
        }
      }
      let to = o.index ?? next.length
      if (to > p.index) to -= 1
      next.splice(clamp(to, 0, next.length), 0, app)
      commit(next)
    } else {
      /* Folder dipindah urutannya (tanpa merge) */
      const removed = next.splice(p.index, 1)
      let to = o.index ?? next.length
      if (to > p.index) to -= 1
      next.splice(clamp(to, 0, next.length), 0, removed[0])
      commit(next)
    }
  }

  /* ---------- Render helpers ---------- */

  const renderAppTile = (href: string, index: number, opts: { inFolder: boolean; folderId: string | null }) => {
    const item = itemByHref.get(href)
    if (!item) return null
    const active = isActiveHref(item.href)
    const isDragSource = !!drag && !!dragging && dragging.index === index && dragging.folderId === opts.folderId
    const isOver = over.index === index && !over.outside && !isDragSource
    return (
      <button
        key={`${opts.folderId ?? 'home'}-${href}`}
        type="button"
        data-tile-index={index}
        onClick={() => {
          if (suppressClickRef.current) return
          onOpenItem(item)
        }}
        onPointerDown={e => handlePointerDown(e, { index, kind: 'app', href, folderId: opts.folderId })}
        onPointerMove={handlePointerMove}
        onPointerUp={() => handlePointerEnd(false)}
        onPointerCancel={() => handlePointerEnd(true)}
        className={cn(
          'relative flex touch-none flex-col items-center justify-start gap-[2px] rounded-[12px] px-[4px] py-[2px] transition-colors select-none',
          '[@media(min-height:800px)]:pt-[4px]',
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
            'flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br shadow-md [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:text-white [&>svg]:drop-shadow-sm',
            '[@media(min-height:800px)]:h-[36px] [@media(min-height:800px)]:w-[36px] [@media(min-height:800px)]:rounded-[12px] [@media(min-height:800px)]:[&>svg]:h-[18px] [@media(min-height:800px)]:[&>svg]:w-[18px]',
            '[@media(max-height:700px)]:h-[28px] [@media(max-height:700px)]:w-[28px] [@media(max-height:700px)]:[&>svg]:h-[14px] [@media(max-height:700px)]:[&>svg]:w-[14px]',
            TILE_GRADIENT[item.href] ?? 'from-slate-400 to-slate-600',
            active && 'ring-2 ring-white/80'
          )}
        >
          <item.icon strokeWidth={2.1} />
        </span>
        <span
          className={cn(
            'line-clamp-2 text-center text-[9px] font-medium leading-[1.15] text-white',
            '[@media(max-height:700px)]:leading-[1.05]',
            '[@media(min-height:800px)]:text-[10px]',
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

  const renderFolderTile = (li: Extract<LayoutItem, { type: 'folder' }>, index: number) => {
    const isDragSource = !!drag && !!dragging && dragging.index === index && dragging.folderId === null
    const isOverFolder = over.folderId === li.id
    const shown = li.hrefs.slice(0, 9)
    return (
      <div key={`folder-${li.id}`} className="flex flex-col items-center" data-folder-tile={li.id}>
        <button
          type="button"
          data-tile-index={index}
          onClick={() => {
            if (suppressClickRef.current) return
            setOpenFolder(li.id)
          }}
          onPointerDown={e => handlePointerDown(e, { index, kind: 'folder', href: li.hrefs[0] ?? '', folderId: null })}
          onPointerMove={handlePointerMove}
          onPointerUp={() => handlePointerEnd(false)}
          onPointerCancel={() => handlePointerEnd(true)}
          className={cn(
            'w-full touch-none rounded-[16px] bg-white/10 p-[8px] text-left transition-colors select-none hover:bg-white/15',
            isDragSource && 'opacity-30',
            isOverFolder && 'ring-2 ring-white/80'
          )}
          aria-label={`Buka folder ${folderName(li.id)}`}
        >
          <div className="grid grid-cols-3 justify-items-center gap-[5px]">
            {shown.map(h => {
              const it = itemByHref.get(h)
              if (!it) return null
              return (
                <span
                  key={h}
                  aria-hidden="true"
                  className={cn(
                    'flex h-[32px] w-[32px] items-center justify-center rounded-[9px] bg-gradient-to-br shadow-sm [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:text-white [&>svg]:drop-shadow-sm',
                    TILE_GRADIENT[h] ?? 'from-slate-400 to-slate-600'
                  )}
                >
                  <it.icon strokeWidth={2.2} />
                </span>
              )
            })}
            {li.hrefs.length > 9 && (
              <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] bg-white/15 text-[9px] font-bold text-white">
                +{li.hrefs.length - 9}
              </span>
            )}
            {li.hrefs.length === 0 && (
              <span className="col-span-3 flex h-[32px] items-center justify-center text-white/50">
                <FolderPlus className="h-[16px] w-[16px]" />
              </span>
            )}
          </div>
        </button>
        <span className="mt-[4px] max-w-full truncate text-[11px] font-medium leading-tight text-white">
          {folderName(li.id)}
        </span>
      </div>
    )
  }

  if (!layout) return null

  const folder = openFolder ? (layout.find(it => it.type === 'folder' && it.id === openFolder) as Extract<LayoutItem, { type: 'folder' }> | undefined) : undefined

  return (
    <div className="relative">
      {/* ===== HOME VIEW ===== */}
      <div className="px-[12px] pt-[2px]" data-drop-grid>
        <p className="mb-[6px] text-center text-[9px] leading-snug text-white/55">
          Tekan lama ikon lalu geser untuk memindah
        </p>
        <div className="grid grid-cols-4 gap-x-[4px] gap-y-[6px]">
          {layout.map((li, idx) =>
            li.type === 'app' ? (
              renderAppTile(li.href, idx, { inFolder: false, folderId: null })
            ) : (
              <div key={`folder-wrap-${li.id}`} className="col-span-2">
                {renderFolderTile(li, idx)}
              </div>
            )
          )}
        </div>
      </div>

      {/* ===== FOLDER VIEW (overlay) ===== */}
      {folder && (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ backgroundColor: '#1e40af' }}>
          <div className="flex items-center gap-[8px] px-[12px] pb-[6px] pt-[2px]">
            <button
              type="button"
              onClick={() => setOpenFolder(null)}
              aria-label="Kembali ke home"
              className="flex min-h-[32px] items-center gap-[4px] rounded-[8px] px-[8px] py-[4px] text-white/85 transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="h-[16px] w-[16px]" />
              <span className="text-[11px] font-semibold">Home</span>
            </button>
            <span className="truncate text-[12px] font-bold text-white">{folderName(folder.id)}</span>
          </div>
          <p className="px-[12px] pb-[6px] text-center text-[9px] leading-snug text-white/55">
            Geser ikon ke luar kotak untuk mengeluarkan dari folder
          </p>
          <div
            className="grid flex-1 grid-cols-4 content-start gap-x-[4px] gap-y-[6px] overflow-y-auto px-[12px] pb-[8px] hide-scrollbar"
            data-drop-grid
          >
            {folder.hrefs.map((h, idx) => renderAppTile(h, idx, { inFolder: true, folderId: folder.id }))}
          </div>
        </div>
      )}

      {/* ===== GHOST ikon saat digeser ===== */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%)' }}
        >
          <div
            className={cn(
              'flex h-[48px] w-[48px] rotate-3 items-center justify-center rounded-[13px] bg-gradient-to-br shadow-2xl [&>svg]:h-[24px] [&>svg]:w-[24px] [&>svg]:text-white',
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
