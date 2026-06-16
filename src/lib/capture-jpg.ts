/**
 * Robust JPG capture utility for document previews.
 *
 * Solves local-vs-production "kepotong" (clipped) issue by cloning the target
 * element into an ISOLATED, top-level container before capturing. This removes
 * all ancestor interference that causes html-to-image to clip the output:
 *
 *   - ancestor CSS `transform: scale(...)` on the preview wrapper
 *   - ancestor `overflow: auto/hidden` on the popup container
 *   - element extending beyond the visible viewport (mobile / small screens)
 *
 * The clone renders at the element's natural size (e.g. 148mm × content height)
 * with no transforms and no overflow constraints, so html-to-image always
 * captures the FULL document — identical result on every screen size.
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
 * Capture a DOM element as a high-quality JPG blob.
 *
 * The element is cloned into an isolated, fixed-position container appended to
 * document.body. This guarantees the capture is never clipped by ancestor
 * transforms, overflow, or viewport boundaries — producing identical output
 * on local and production environments regardless of screen size.
 *
 * @param element - The HTMLElement to capture (should have data-document-preview)
 * @returns JPG Blob
 */
export async function captureElementAsJpg(element: HTMLElement): Promise<Blob> {
  // 1. Wait for web fonts to be ready (critical for consistent text rendering)
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready } catch {}
  }

  // 2. Wait for all images in the ORIGINAL to load (so the clone has them too)
  await waitForImages(element)

  // 3. Clone the element into an isolated, top-level container.
  //    This is the KEY fix: the clone has NO ancestor transform/overflow,
  //    so html-to-image captures the FULL element at its natural size.
  const clone = element.cloneNode(true) as HTMLElement

  // The clone must render at its natural size — strip any transform that
  // might have been set on the original, and ensure it's a block element.
  clone.style.transform = 'none'
  clone.style.margin = '0'
  clone.style.position = 'static'

  const wrapper = document.createElement('div')
  // Position off-screen (left: -99999px) so it's rendered but invisible to
  // the user. z-index: -1 keeps it behind everything. No overflow constraint
  // means the clone can be as tall/wide as it needs to be.
  wrapper.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: -99999px',          // way off-screen, but still rendered
    'z-index: -1',              // behind everything
    'pointer-events: none',
    'background: #ffffff',
    'opacity: 1',               // must be visible to html-to-image
    'overflow: visible',        // never clip the clone
    'width: auto',
    'height: auto',
  ].join(';')

  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    // 4. Inline images on the CLONE as data URLs (avoids CORS issues, and
    //    doesn't mutate the original DOM)
    await inlineImages(clone)

    // 5. Small delay for layout/CSS to settle on the clone
    await new Promise((r) => setTimeout(r, 120))

    // 6. Capture the CLONE (not the original) with html-to-image
    const dataUrl = await toJpeg(clone, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
      skipFonts: false,
      // Force cross-origin resources to be fetched with CORS
      fetchRequestInit: { mode: 'cors' as RequestMode },
    })

    // 7. Convert data URL to Blob
    const res = await fetch(dataUrl)
    const blob = await res.blob()

    if (!blob || blob.size === 0) {
      throw new Error('Generated JPG blob is empty')
    }

    return blob
  } finally {
    // 8. Always clean up the wrapper, even if capture failed
    wrapper.removeChild(clone)
    document.body.removeChild(wrapper)
  }
}
