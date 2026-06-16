/**
 * No-API JPG sharing to WhatsApp.
 *
 * Strategy (no Fonnte / no API key needed):
 *   1. Try Web Share API with files — works on mobile AND modern desktop
 *      (Chrome 93+, Edge, Safari). Opens the OS share sheet so the user
 *      picks WhatsApp (Desktop or mobile app) and the JPG is auto-attached.
 *   2. Fallback: download the JPG locally + open WhatsApp Web (wa.me) with
 *      the phone number and caption pre-filled. The user attaches the
 *      downloaded file manually (one extra step, but works everywhere).
 *
 * This replaces the previous Fonnte-based direct-send dialog on desktop.
 */

export interface ShareJpgOptions {
  /** JPG blob to share */
  blob: Blob
  /** File name e.g. "INV-06-26-0002.jpg" */
  fileName: string
  /** Human label for the caption e.g. "Invoice INV/06/26/0002" */
  documentLabel: string
  /** Optional phone number (digits, may start with 0 / + / 62) */
  phone?: string
}

/**
 * Normalize a phone number to international digits (62...) for wa.me links.
 * Returns empty string if input is empty/invalid.
 */
function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-()+]/g, '')
  if (!p) return ''
  if (p.startsWith('62')) return p
  if (p.startsWith('0')) return '62' + p.substring(1)
  // Assume local number without leading 0
  return '62' + p
}

/**
 * Trigger a browser download of the JPG blob.
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Open WhatsApp Web / app with a pre-filled phone number and text.
 * Uses https://wa.me/<phone>?text=<msg> which works on both desktop
 * (opens WhatsApp Web) and mobile (opens WhatsApp app).
 */
function openWhatsAppWeb(phone: string, message: string): void {
  const encoded = encodeURIComponent(message)
  const normalized = normalizePhone(phone)
  const url = normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`
  window.open(url, '_blank')
}

export type ShareJpgResult =
  | { status: 'shared' }                       // Web Share API succeeded
  | { status: 'downloaded'; phone: string }    // Downloaded + WhatsApp Web opened
  | { status: 'cancelled' }                    // User cancelled Web Share
  | { status: 'error'; error: string }

/**
 * Share a JPG to WhatsApp without using any API.
 *
 * Tries Web Share API first (auto-attaches the file on supported browsers),
 * then falls back to downloading the file + opening WhatsApp Web with the
 * phone and caption pre-filled.
 */
export async function shareJpgToWhatsApp({
  blob,
  fileName,
  documentLabel,
  phone = '',
}: ShareJpgOptions): Promise<ShareJpgResult> {
  const caption = `${documentLabel} - www.darrellsoft.com`

  // 1. Try Web Share API with files.
  //    Works on: mobile (all), desktop Chrome 93+, Edge, Safari 14+.
  //    Opens the native OS share sheet — user picks WhatsApp, file is
  //    auto-attached with the caption. No API needed.
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'image/jpeg' })
    if (navigator.canShare({ files: [file] })) {
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
        // Other errors → fall through to download fallback
      }
    }
  }

  // 2. Fallback: download the JPG + open WhatsApp Web with phone + caption.
  //    User manually attaches the downloaded file in WhatsApp.
  downloadBlob(blob, fileName)
  openWhatsAppWeb(phone, caption)
  return { status: 'downloaded', phone }
}
