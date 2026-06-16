/**
 * Robust JPG capture utility for document previews.
 *
 * Solves local-vs-production differences by:
 * 1. Waiting for all web fonts to be ready (document.fonts.ready)
 * 2. Waiting for all <img> elements inside the target to fully load
 * 3. Pre-converting <img> src to data URLs (avoids CORS/tainted-canvas issues)
 * 4. Using cacheBust: true to force fresh resource loading
 * 5. Adding a small delay for CSS/layout to settle
 */

import { toJpeg } from 'html-to-image'

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
 * Capture a DOM element as a high-quality JPG blob.
 *
 * @param element - The HTMLElement to capture (should have data-document-preview)
 * @returns JPG Blob
 */
export async function captureElementAsJpg(element: HTMLElement): Promise<Blob> {
  // 1. Wait for web fonts to be ready (critical for consistent text rendering)
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready } catch {}
  }

  // 2. Wait for all images to load
  await waitForImages(element)

  // 3. Pre-inline images as data URLs (avoids CORS issues on production)
  await inlineImages(element)

  // 4. Small delay for layout/CSS to settle
  await new Promise((r) => setTimeout(r, 100))

  // 5. Capture with html-to-image
  const dataUrl = await toJpeg(element, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
    skipFonts: false,
    // Force cross-origin resources to be fetched with CORS
    fetchRequestInit: { mode: 'cors' as RequestMode },
  })

  // 6. Convert data URL to Blob
  const res = await fetch(dataUrl)
  const blob = await res.blob()

  if (!blob || blob.size === 0) {
    throw new Error('Generated JPG blob is empty')
  }

  return blob
}
