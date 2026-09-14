/** Target ukuran maksimal foto setelah kompresi (≤300KB). */
export const PHOTO_MAX_BYTES = 300 * 1024

/** Hitung jumlah byte dari data URL (base64). */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.split(',')[1] ?? ''
  return Math.floor((b64.length * 3) / 4)
}

/** Format byte agar mudah dibaca (KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Kompres gambar apa pun (JPG/PNG/WebP) menjadi data URL JPEG ≤300KB:
 * mulai dari sisi terpanjang 1600px + quality 0.85, turunkan quality,
 * lalu perkecil dimensi sampai target tercapai. Latar putih untuk PNG transparan.
 * Hanya untuk sisi client (browser) — memakai canvas.
 */
export async function compressImageToJpegDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (JPG/PNG/WebP)')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    let scale = Math.min(1, 1600 / longest)
    let quality = 0.85
    let out = ''
    for (let attempt = 0; attempt < 14; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak didukung browser ini')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)
      out = canvas.toDataURL('image/jpeg', quality)
      if (dataUrlBytes(out) <= PHOTO_MAX_BYTES) return out
      if (quality > 0.45) {
        quality = Math.max(0.45, quality - 0.1)
      } else {
        scale *= 0.85
      }
    }
    return out
  } finally {
    bitmap.close?.()
  }
}

/**
 * Validasi sisi server untuk data URL foto: harus data:image/* dan
 * maks ~700 ribu karakter (base64 dari JPEG ≤300KB). Return null jika tidak valid.
 */
export function validatePhotoDataUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.startsWith('data:image/')) return null
  if (v.length > 700_000) return null
  return v
}
