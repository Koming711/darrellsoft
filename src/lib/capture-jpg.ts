/**
 * Robust JPG capture utility for document previews.
 *
 * Solves local-vs-production "kepotong" (clipped) issue.
 *
 * Root cause: html-to-image's `toJpeg` uses `node.clientWidth` / `node.clientHeight`
 * to size the SVG canvas that renders the captured node. When the captured node is
 * affected by ancestor `transform: scale(...)` or off-screen positioning quirks,
 * `clientHeight` can return a value SMALLER than the true content height on
 * production (where layout timing differs from local). This causes the bottom of
 * the document (signatures, footer) to be clipped from the JPG.
 *
 * Fix: explicitly compute the natural pixel dimensions from the ORIGINAL element's
 * `scrollWidth` / `scrollHeight` (which are NEVER affected by CSS transforms or
 * ancestor overflow), lock them onto the clone, AND pass them as `width` / `height`
 * options to `toJpeg` so the SVG canvas matches the true content size.
 *
 * This produces identical full-document output on local and production.
 */

import { toJpeg } from 'html-to-image'

// ============================================================
// Hi-res (300 DPI) constants
// ============================================================

/** Target DPI untuk semua hasil JPG & cetak dokumen. */
export const HIRES_DPI = 300
/**
 * CSS reference DPI browser = 96 — elemen berukuran mm (mis. .a5-page 148mm)
 * dirender 96px per inch TIDAK TERGANTUNG viewport/perangkat. Capture dengan
 * pixelRatio 300/96 = 3.125 menghasilkan gambar TEPAT 300 DPI yang SAMA
 * antara mobile & desktop.
 */
export const HIRES_PIXEL_RATIO = HIRES_DPI / 96 // 3.125

/**
 * Resolve elemen pratinjau dokumen yang UKURANNYA TETAP (tidak mengikuti
 * viewport) sebagai sumber capture JPG/cetak hi-res.
 *
 * Semua preview dokumen (InvoicePreview, SuratJalanPreview,
 * PurchaseOrderPreview) me-render root .a5-page berukuran tetap 148mm —
 * menangkap elemen ini (bukan wrapper scaler yang lebar/skala-nya mengikuti
 * layar) membuat hasil JPG & cetak IDENTIK antara mobile & desktop.
 *
 * Prioritas:
 *  1. .a5-page di dalam #document-preview (detail invoice / editor layout)
 *  2. .a5-page di dalam [data-document-preview] (popup pratinjau SJ/PO/riwayat)
 *  3. .a5-page apa pun (root preview — elemen itu sendiri membawa atribut)
 *  4. [data-document-preview] apa pun (fallback — wrapper responsif)
 */
export function resolveDocumentPreviewEl(): HTMLElement | null {
  return (
    document.querySelector('#document-preview .a5-page') ||
    document.querySelector('[data-document-preview] .a5-page') ||
    document.querySelector('.a5-page') ||
    document.querySelector('[data-document-preview]')
  ) as HTMLElement | null
}

/**
 * Wait for all <img> elements within a node to finish loading.
 * Images that fail to load (broken/CORS) are silently skipped.
 */
async function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'))
  if (imgs.length === 0) return

  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000) // max 3s per image
        img.onload = () => { clearTimeout(timeout); resolve() }
        img.onerror = () => { clearTimeout(timeout); resolve() }
      })
    })
  )
}

/**
 * Convert all <img> src attributes to data URLs so html-to-image
 * doesn't need to fetch them (which can fail due to CORS on production).
 * Works on the CLONE so the original DOM is never mutated.
 */
async function inlineImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.src
      if (!src || src.startsWith('data:')) return // already data URL
      try {
        const res = await fetch(src, { mode: 'cors' })
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        img.src = dataUrl
      } catch {
        // If fetch fails, leave original src — html-to-image will try cacheBust
      }
    })
  )
}

/**
 * Compute the natural pixel dimensions of an element.
 *
 * Uses `scrollWidth` / `scrollHeight` first (these are layout properties that
 * represent the FULL content size — they are NEVER affected by CSS transforms,
 * ancestor overflow, or viewport clipping). Falls back to `offsetWidth` /
 * `offsetHeight` (also transform-immune) if scroll dimensions are zero.
 */
function getNaturalDimensions(element: HTMLElement): { width: number; height: number } {
  // scrollWidth/scrollHeight = full content size including overflow,
  // NOT affected by transforms or ancestor overflow. This is the most
  // reliable source of the element's true rendered size.
  let width = element.scrollWidth || element.offsetWidth
  let height = element.scrollHeight || element.offsetHeight

  // Safety floor — never report zero (would produce an empty/invalid image)
  if (!width || width < 1) width = element.getBoundingClientRect().width || 560
  if (!height || height < 1) height = element.getBoundingClientRect().height || 800

  return { width: Math.ceil(width), height: Math.ceil(height) }
}

/**
 * Wait two animation frames + a short delay so the browser has fully processed
 * layout AND paint for the cloned node. This is more reliable than a single
 * setTimeout on production where font/CSS loading may delay layout.
 */
function waitForLayoutSettle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 120)
      })
    })
  })
}

/**
 * Capture a DOM element as a high-quality JPG blob.
 *
 * The element is cloned into an isolated, fixed-position container appended to
 * document.body. The clone's natural pixel dimensions (computed from the
 * ORIGINAL element's scrollWidth/scrollHeight) are:
 *   1. Locked onto the clone via inline `width` / `height` styles
 *   2. Passed to `toJpeg` as `width` / `height` options
 *
 * This double-lock guarantees the SVG canvas inside html-to-image matches the
 * true content size, so NO part of the document is ever clipped — identical
 * output on local and production regardless of screen size or transform scale.
 *
 * @param element - The HTMLElement to capture (should have data-document-preview)
 * @param opts.pixelRatio - Device-pixel multiplier for output sharpness. Default 2.
 *                          Use HIRES_PIXEL_RATIO (3.125) for 300 DPI output.
 * @param opts.fixedWidth - Force clone layout width (px CSS). For viewport-dependent
 *                          previews (popup tools) so output is identical on
 *                          mobile & desktop.
 * @returns JPG Blob
 */
export async function captureElementAsJpg(
  element: HTMLElement,
  opts?: { pixelRatio?: number; fixedWidth?: number }
): Promise<Blob> {
  const pixelRatio = opts?.pixelRatio ?? 2

  // 1. Wait for web fonts to be ready (critical for consistent text rendering)
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready } catch {}
  }

  // 2. Wait for all images in the ORIGINAL to load (so the clone has them too)
  await waitForImages(element)

  // 3. Compute natural pixel dimensions from the ORIGINAL element BEFORE cloning.
  //    scrollWidth/scrollHeight are immune to ancestor transform: scale() and
  //    overflow, so they always report the TRUE content size.
  //    fixedWidth (jika diset) menimpa lebar — untuk preview yang lebar-
  //    nya mengikuti viewport agar hasil capture identik di semua perangkat.
  const measured = getNaturalDimensions(element)
  const naturalWidth = opts?.fixedWidth ?? measured.width
  const naturalHeight = measured.height

  // 4. Clone the element into an isolated, top-level container.
  const clone = element.cloneNode(true) as HTMLElement

  // Strip any transform/positioning that might affect layout, and LOCK the
  // dimensions to the natural size we computed from the original.
  clone.style.transform = 'none'
  clone.style.margin = '0'
  clone.style.position = 'static'
  clone.style.width = `${naturalWidth}px`
  clone.style.height = `${naturalHeight}px`
  // Override min-height so it doesn't fight with the explicit height
  clone.style.minHeight = `${naturalHeight}px`
  clone.style.maxHeight = 'none'

  const wrapper = document.createElement('div')
  // Position off-screen but still rendered. overflow: visible so the clone
  // is never clipped by the wrapper.
  wrapper.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: -99999px',
    'z-index: -1',
    'pointer-events: none',
    'background: #ffffff',
    'opacity: 1',
    'overflow: visible',
    'width: auto',
    'height: auto',
  ].join(';')

  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    // 5. Inline images on the CLONE as data URLs (avoids CORS issues)
    await inlineImages(clone)

    // 6. Wait for layout + paint to fully settle on the clone
    await waitForLayoutSettle()

    // 7. Re-read dimensions from the now-laid-out clone. If the clone's
    //    scrollHeight is LARGER than what we computed from the original
    //    (e.g. because images pushed content down), use the larger value
    //    so nothing gets clipped.
    const cloneDims = getNaturalDimensions(clone)
    const finalWidth = Math.max(naturalWidth, cloneDims.width)
    const finalHeight = Math.max(naturalHeight, cloneDims.height)

    // Update the clone's locked dimensions if they grew
    if (finalHeight > naturalHeight) {
      clone.style.height = `${finalHeight}px`
      clone.style.minHeight = `${finalHeight}px`
    }

    // 8. Capture the CLONE with EXPLICIT width/height. This is the key fix:
    //    html-to-image uses these for both the SVG canvas size AND sets them
    //    as inline styles on its internal clone (via applyStyle), so the
    //    captured image dimensions ALWAYS match the true content size.
    const dataUrl = await toJpeg(clone, {
      quality: 0.95,
      pixelRatio,
      backgroundColor: '#ffffff',
      cacheBust: true,
      skipFonts: false,
      width: finalWidth,
      height: finalHeight,
      // Force cross-origin resources to be fetched with CORS
      fetchRequestInit: { mode: 'cors' as RequestMode },
    })

    // 9. Convert data URL to Blob
    const res = await fetch(dataUrl)
    const blob = await res.blob()

    if (!blob || blob.size === 0) {
      throw new Error('Generated JPG blob is empty')
    }

    return blob
  } finally {
    // 10. Always clean up the wrapper, even if capture failed
    wrapper.removeChild(clone)
    document.body.removeChild(wrapper)
  }
}

// ============================================================
// Fit a captured JPG blob onto an A5-sized canvas (148 × 210 mm)
// ============================================================

const MM_PER_INCH = 25.4

/**
 * Load a Blob into an HTMLImageElement (object URL based, no CORS issues).
 */
function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load captured image')) }
    img.src = url
  })
}

/**
 * Fit a captured JPG blob into an A5-sized image (148mm × 210mm).
 *
 * The source image is scaled to FIT (contain) inside the A5 canvas, centered,
 * with a white background filling the remaining space. The output orientation
 * follows the source content: portrait content → A5 portrait (874 × 1240 px
 * at 150 DPI), landscape content → A5 landscape (1240 × 874 px).
 *
 * This makes the shared JPG print edge-to-edge on A5 paper with the whole
 * document visible.
 *
 * @param blob - Source JPG blob (e.g. from captureElementAsJpg)
 * @param opts.dpi - Output resolution in DPI. Default 300 → 1748 × 2480 px.
 * @param opts.marginPct - White margin around content, % of the short edge. Default 4.
 * @param opts.quality - JPEG quality (0-1). Default 0.95.
 * @param opts.orientation - 'auto' (default, follows content direction), 'portrait', or 'landscape'.
 * @returns A5-fitted JPG Blob
 */
export async function fitBlobToA5(
  blob: Blob,
  opts?: { dpi?: number; marginPct?: number; quality?: number; orientation?: 'auto' | 'portrait' | 'landscape' }
): Promise<Blob> {
  const dpi = opts?.dpi ?? HIRES_DPI
  const marginPct = opts?.marginPct ?? 4
  const quality = opts?.quality ?? 0.95
  const orientation = opts?.orientation ?? 'auto'

  const img = await loadImageElement(blob)
  if (!img.width || !img.height) {
    throw new Error('Captured image has invalid dimensions')
  }

  // A5: short edge = 148mm, long edge = 210mm
  const shortEdge = Math.round((148 / MM_PER_INCH) * dpi) // 1748 @ 300 DPI
  const longEdge = Math.round((210 / MM_PER_INCH) * dpi)  // 2480 @ 300 DPI

  // Orientation: explicit option wins, otherwise auto from content direction
  const isLandscape = orientation === 'auto' ? img.width > img.height : orientation === 'landscape'
  const canvasW = isLandscape ? longEdge : shortEdge
  const canvasH = isLandscape ? shortEdge : longEdge

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Contain-fit with margin, centered
  const margin = Math.round(Math.min(canvasW, canvasH) * (marginPct / 100))
  const availW = canvasW - margin * 2
  const availH = canvasH - margin * 2
  const scale = Math.min(availW / img.width, availH / img.height)
  const drawW = Math.max(1, Math.round(img.width * scale))
  const drawH = Math.max(1, Math.round(img.height * scale))
  const dx = Math.round((canvasW - drawW) / 2)
  const dy = Math.round((canvasH - drawH) / 2)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, drawW, drawH)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => { if (b && b.size > 0) resolve(b); else reject(new Error('Failed to encode A5 JPG')) },
      'image/jpeg',
      quality
    )
  })
}

/**
 * Fit a captured image onto an A4 canvas (210 × 297 mm) with white margins,
 * contained & centered. Default portrait — like a physical A4 sheet.
 */
export async function fitBlobToA4(
  blob: Blob,
  opts?: { dpi?: number; marginPct?: number; quality?: number; orientation?: 'portrait' | 'landscape' }
): Promise<Blob> {
  const dpi = opts?.dpi ?? HIRES_DPI
  const marginPct = opts?.marginPct ?? 3
  const quality = opts?.quality ?? 0.95
  const orientation = opts?.orientation ?? 'portrait'

  const img = await loadImageElement(blob)
  if (!img.width || !img.height) {
    throw new Error('Captured image has invalid dimensions')
  }

  // A4: short edge = 210mm, long edge = 297mm
  const shortEdge = Math.round((210 / MM_PER_INCH) * dpi) // 2480 @ 300 DPI
  const longEdge = Math.round((297 / MM_PER_INCH) * dpi)  // 3508 @ 300 DPI

  const isLandscape = orientation === 'landscape'
  const canvasW = isLandscape ? longEdge : shortEdge
  const canvasH = isLandscape ? shortEdge : longEdge

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Contain-fit with margin, centered
  const margin = Math.round(Math.min(canvasW, canvasH) * (marginPct / 100))
  const availW = canvasW - margin * 2
  const availH = canvasH - margin * 2
  const scale = Math.min(availW / img.width, availH / img.height)
  const drawW = Math.max(1, Math.round(img.width * scale))
  const drawH = Math.max(1, Math.round(img.height * scale))
  const dx = Math.round((canvasW - drawW) / 2)
  const dy = Math.round((canvasH - drawH) / 2)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, drawW, drawH)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => { if (b && b.size > 0) resolve(b); else reject(new Error('Failed to encode A4 JPG')) },
      'image/jpeg',
      quality
    )
  })
}

/**
 * Capture pratinjau dokumen → JPG hi-res 300 DPI yang SAMA PERSIS antara
 * mobile & desktop, lalu dikomposisi ke kanvas kertas (A5/A4) 300 DPI.
 *
 * Pipeline:
 *  1. Resolve elemen sumber — `el` parameter bila diberikan, else
 *     `resolveDocumentPreviewEl()` (.a5-page berukuran tetap 148mm).
 *  2. Capture pada pixelRatio HIRES_PIXEL_RATIO (3.125 = 300 DPI pada
 *     elemen berukuran mm CSS 96dpi) — tidak terpengaruh viewport.
 *  3. Fit ke kanvas kertas 300 DPI (A5 = 1748×2480 px, A4 = 2480×3508 px).
 *
 * @param opts.el - Elemen sumber eksplisit (opsional; default auto-resolve).
 * @param opts.paper - 'A5' (default) atau 'A4'.
 * @param opts.orientation - Orientasi kertas. Default 'portrait'.
 * @param opts.marginPct - Margin putih % sisi pendek kanvas. Default 0
 *                         (preview .a5-page sudah memuat padding 8/10mm).
 * @param opts.fixedWidth - Paksa lebar konten (untuk preview non-dokumen).
 * @throws Error('PREVIEW_NOT_FOUND') bila elemen pratinjau tidak ditemukan.
 */
export async function captureDocumentPaperJpg(opts?: {
  el?: HTMLElement | null
  paper?: 'A5' | 'A4'
  orientation?: 'portrait' | 'landscape'
  marginPct?: number
  fixedWidth?: number
}): Promise<Blob> {
  const el = opts?.el !== undefined ? opts.el : resolveDocumentPreviewEl()
  if (!el) throw new Error('PREVIEW_NOT_FOUND')

  const raw = await captureElementAsJpg(el, {
    pixelRatio: HIRES_PIXEL_RATIO,
    fixedWidth: opts?.fixedWidth,
  })

  if (opts?.paper === 'A4') {
    return fitBlobToA4(raw, {
      orientation: opts?.orientation ?? 'portrait',
      marginPct: opts?.marginPct ?? 0,
      dpi: HIRES_DPI,
    })
  }
  return fitBlobToA5(raw, {
    orientation: opts?.orientation ?? 'portrait',
    marginPct: opts?.marginPct ?? 0,
    dpi: HIRES_DPI,
  })
}
