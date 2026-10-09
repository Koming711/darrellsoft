'use client'

import { useEffect } from 'react'

/**
 * TableColumnResizer — komponen GLOBAL: membuat SEMUA tabel di aplikasi bisa
 * di-resize kolomnya secara manual (drag tepi kanan header kolom untuk
 * membesarkan / mengecilkan; dobel-klik handle untuk mengembalikan SELURUH
 * tabel ke lebar otomatis).
 *
 * Cara kerja:
 * - Memindai semua <table> di dokumen (MutationObserver + resize listener +
 *   retry awal), lalu memasang handle drag di setiap <th> header.
 * - Lebar kolom tersimpan di localStorage per tabel (kunci = pathname +
 *   sidik jari header kolom) → setelah reload / pindah halaman, lebar yang
 *   pernah diatur user dipulihkan otomatis.
 * - Dobel-klik handle = reset SELURUH tabel kembali ke lebar otomatis
 *   (semua inline width dibuang + penyimpanan dihapus).
 * - Lebar diterapkan sebagai inline width di SELURUH sel kolom (layout
 *   tabel tetap "auto" → tampilan tidak berubah sampai user benar-benar
 *   men-drag; konten tidak pernah terpotong paksa).
 * - Aman untuk header kompleks: tabel dengan header multi-baris / colspan /
 *   rowspan / tersembunyi (mobile, print) TIDAK diberi handle. Template
 *   dokumen cetak bisa opt-out dengan atribut data-no-resize-cols.
 * - Handle disembunyikan saat print (@media print) sehingga output cetak
 *   tetap bersih.
 */

const MIN_COL_WIDTH = 56
const STORE_PREFIX = 'tcr-colw:'

const CSS = `
.tcr-handle{position:absolute;top:0;right:-4px;width:9px;height:100%;cursor:col-resize;z-index:30;touch-action:none}
.tcr-handle::after{content:"";position:absolute;top:15%;bottom:15%;left:50%;width:3px;margin-left:-1.5px;border-radius:9999px;background:transparent;transition:background-color .15s ease}
th:hover>.tcr-handle::after{background-color:rgba(148,163,184,.45)}
.tcr-handle:hover::after,.tcr-handle.tcr-active::after{background-color:#10b981}
body.tcr-dragging{cursor:col-resize!important;user-select:none!important;-webkit-user-select:none!important}
@media print{.tcr-handle{display:none!important}}
`

const boundHandles = new WeakSet<HTMLDivElement>()

/** Sidik jari pendek untuk kunci penyimpanan */
function hashSig(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Sel header (hanya tabel dgn TEPAT 1 baris header) */
function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const thead = table.tHead
  if (!thead || thead.rows.length !== 1) return []
  return Array.from(thead.rows[0].cells)
}

/** Tabel layak di-resize: header sederhana, terlihat, bukan template cetak */
function isEligible(table: HTMLTableElement): boolean {
  if (table.closest('[data-no-resize-cols]')) return false
  if (!table.tHead || table.tHead.rows.length !== 1) return false
  const cells = Array.from(table.tHead.rows[0].cells)
  if (cells.length < 2) return false
  for (const c of cells) {
    if (c.colSpan !== 1 || c.rowSpan !== 1) return false
  }
  if (table.offsetParent === null) return false // tersembunyi (mis. tab nonaktif / mobile)
  return true
}

/** Kunci penyimpanan per tabel: pathname + index + sidik jari header */
function tableKey(table: HTMLTableElement, idx: number): string | null {
  const ths = headerCells(table)
  if (ths.length === 0) return null
  const sig =
    ths
      .map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim())
      .join('|') +
    '#' +
    ths.length
  return `${STORE_PREFIX}${window.location.pathname}#${idx}:${hashSig(sig)}`
}

/** Jalankan fn pada sel yang MENUTUPI kolom colIdx di setiap baris (colSpan-aware) */
function forEachColCell(
  table: HTMLTableElement,
  colIdx: number,
  fn: (c: HTMLTableCellElement) => void
) {
  for (const row of Array.from(table.rows)) {
    let ci = 0
    for (const cell of Array.from(row.cells)) {
      if (ci === colIdx) {
        if (cell.colSpan === 1) fn(cell)
        break
      }
      if (ci > colIdx) break
      ci += cell.colSpan
    }
  }
}

function applyColWidth(
  table: HTMLTableElement,
  colIdx: number,
  w: number | null
) {
  forEachColCell(table, colIdx, (c) => {
    const next = w == null ? '' : `${w}px`
    if (c.style.width !== next) c.style.width = next
  })
}

function readWidths(key: string): (number | null)[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

function writeWidths(key: string, arr: (number | null)[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr))
  } catch {
    /* storage penuh — abaikan */
  }
}

function currentWidths(ths: HTMLTableCellElement[]): number[] {
  return ths.map((t) => Math.round(t.getBoundingClientRect().width))
}

/** Cegah click yang mengikuti drag sampai ke th / baris (mis. sort / row-click) */
function suppressNextClick() {
  const swallow = (ev: MouseEvent) => {
    ev.stopPropagation()
    ev.preventDefault()
    document.removeEventListener('click', swallow, true)
  }
  document.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => document.removeEventListener('click', swallow, true), 1200)
}

function bindDrag(
  table: HTMLTableElement,
  key: string,
  ths: HTMLTableCellElement[],
  colIdx: number,
  handle: HTMLDivElement
) {
  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startW = ths[colIdx].getBoundingClientRect().width
    let moved = false

    handle.classList.add('tcr-active')
    document.body.classList.add('tcr-dragging')
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      const d = ev.clientX - startX
      if (!moved && Math.abs(d) > 2) moved = true
      if (!moved) return
      applyColWidth(table, colIdx, Math.max(MIN_COL_WIDTH, Math.round(startW + d)))
    }
    const finish = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      handle.classList.remove('tcr-active')
      document.body.classList.remove('tcr-dragging')
      try {
        handle.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      if (moved) {
        writeWidths(key, currentWidths(ths))
        suppressNextClick()
      }
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  })

  // Dobel-klik handle → reset SELURUH tabel ke lebar otomatis (dengan layout
  // auto, reset 1 kolom saja tidak deterministik — kolom bebas menyerap
  // sisa ruang — jadi reset massal lebih sesuai ekspektasi user)
  handle.addEventListener('dblclick', (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    for (const row of Array.from(table.rows)) {
      for (const c of Array.from(row.cells)) {
        if (c.style.width) c.style.width = ''
      }
    }
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  })
}

function attachHandles(table: HTMLTableElement, key: string) {
  const ths = headerCells(table)
  const stored = readWidths(key)
  ths.forEach((th, i) => {
    // Handle absolut butuh th positioned — jangan ganggu th yang sudah
    // positioned (mis. sticky)
    if (window.getComputedStyle(th).position === 'static') {
      th.style.position = 'relative'
    }

    // Pulihkan lebar tersimpan (idempoten: hanya sel yang belum punya lebar —
    // baris baru hasil render React ikut terisi)
    const saved = stored && typeof stored[i] === 'number' ? (stored[i] as number) : null
    if (saved != null && saved >= MIN_COL_WIDTH) {
      forEachColCell(table, i, (c) => {
        if (!c.style.width) c.style.width = `${saved}px`
      })
    }

    let handle = th.querySelector<HTMLDivElement>(':scope > .tcr-handle')
    if (!handle) {
      handle = document.createElement('div')
      handle.className = 'tcr-handle'
      handle.setAttribute('aria-hidden', 'true')
      th.appendChild(handle)
    }
    if (boundHandles.has(handle)) return
    boundHandles.add(handle)
    bindDrag(table, key, ths, i, handle)
  })
}

function scan() {
  const tables = document.querySelectorAll('table')
  let eligibleIdx = 0
  tables.forEach((table) => {
    if (!isEligible(table)) return
    const key = tableKey(table, eligibleIdx++)
    if (!key) return
    if (table.dataset.tcrKey !== key) {
      // Identitas tabel berubah (kolom berubah) → bersihkan lebar inline lama
      table.dataset.tcrKey = key
      for (const row of Array.from(table.rows)) {
        for (const c of Array.from(row.cells)) {
          if (c.style.width) c.style.width = ''
        }
      }
    }
    attachHandles(table, key)
  })
}

export function TableColumnResizer() {
  useEffect(() => {
    let scheduled: number | null = null
    const schedule = () => {
      if (scheduled != null) return
      scheduled = window.setTimeout(() => {
        scheduled = null
        scan()
      }, 150)
    }

    const raf = requestAnimationFrame(scan)
    // Retry awal untuk tabel yang dirender belakangan (data fetch, tab, modal)
    const retries = [300, 900, 2500].map((ms) => window.setTimeout(scan, ms))

    const mo = new MutationObserver(schedule)
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })
    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(raf)
      retries.forEach((t) => window.clearTimeout(t))
      if (scheduled != null) window.clearTimeout(scheduled)
      mo.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return <style dangerouslySetInnerHTML={{ __html: CSS }} />
}
