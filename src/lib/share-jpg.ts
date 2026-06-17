/**
 * JPG sharing / download utility.
 *
 * Behavior:
 *   - Mobile (Android/iOS): use Web Share API — opens WhatsApp app with the
 *     JPG auto-attached. No API needed.
 *   - Desktop: directly download the JPG file to the user's Downloads folder
 *     (or desktop, depending on browser settings). No WhatsApp Web, no share
 *     sheet, no API. User can then attach the file manually wherever they want.
 *
 * This is the simplest, most reliable approach with zero configuration.
 */

export interface ShareJpgOptions {
  /** JPG blob to share / download */
  blob: Blob
  /** File name e.g. "INV-06-26-0002.jpg" */
  fileName: string
  /** Human label for the caption (mobile only) e.g. "Invoice INV/06/26/0002" */
  documentLabel: string
  /** Optional phone number (unused on desktop, used for mobile caption) */
  phone?: string
}

/**
 * Detect mobile platform (Android / iOS).
 */
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * Trigger a browser download of the JPG blob to the user's device.
 * On desktop this saves to the Downloads folder (or Desktop if configured).
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  // Ensure the link is in the DOM so the click works in all browsers
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type ShareJpgResult =
  | { status: 'shared' }                       // Web Share API succeeded (mobile)
  | { status: 'downloaded' }                   // File downloaded to device (desktop)
  | { status: 'cancelled' }                    // User cancelled Web Share (mobile)
  | { status: 'error'; error: string }

/**
 * Handle a JPG blob based on platform:
 *   - Mobile: share to WhatsApp via Web Share API (file auto-attached)
 *   - Desktop: download the JPG file directly to the user's device
 */
export async function shareJpgToWhatsApp({
  blob,
  fileName,
  documentLabel,
}: ShareJpgOptions): Promise<ShareJpgResult> {
  // Mobile: use Web Share API to send the file directly to WhatsApp app
  if (isMobile() && navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'image/jpeg' })
    if (navigator.canShare({ files: [file] })) {
      const caption = `${documentLabel} - www.darrellsoft.com`
      try {
        await navigator.share({
          files: [file],
          text: caption,
        })
        return { status: 'shared' }
      } catch (err: unknown) {
        // AbortError = user cancelled the share sheet
        if (err instanceof Error && err.name === 'AbortError') {
          return { status: 'cancelled' }
        }
        // Other errors → fall through to download
      }
    }
  }

  // Desktop (or mobile without Web Share): download the JPG file directly
  downloadBlob(blob, fileName)
  return { status: 'downloaded' }
}
