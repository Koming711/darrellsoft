/**
 * Cetak hi-res berbasis gambar — hasil cetak = gambar JPG 300 DPI yang SAMA
 * dengan hasil JPG, sehingga output cetak IDENTIK antara mobile & desktop.
 *
 * Menggantikan jalur cetak lama (window.print + @media print CSS) yang di
 * browser mobile sering diabaikan aturan @page size-nya dan ikut mencetak
 * layout responsif layar — penyebab hasil cetak mobile berbeda dengan desktop.
 *
 * Cara kerja: dokumen ditangkap sebagai gambar 300 DPI (capture-jpg.ts),
 * lalu gambar itu dicetak memenuhi halaman kertas via popup window (fallback:
 * iframe tersembunyi bila popup diblokir). Karena yang dicetak sebuah gambar
 * tetap, hasilnya tidak terpengaruh viewport, CSS responsif, atau perbedaan
 * perilaku @page antar browser.
 */

/** Convert Blob → data URL (FileReader). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca data gambar'))
    reader.readAsDataURL(blob)
  })
}

interface PrintHiResOptions {
  /** Judul dokumen (judul popup / header cetak default browser). */
  title?: string
  /** Ukuran halaman @page — mis. 'A5 portrait', '148mm 210mm', 'A4'. */
  page?: string
  /** Margin halaman @page. Default '0' (gambar sudah memuat margin). */
  margin?: string
}

/**
 * Cetak blob gambar (JPG 300 DPI) via popup window; bila popup diblokir,
 * fallback ke iframe tersembunyi.
 *
 * @returns true bila salah satu jalur berhasil disiapkan, false bila
 *          keduanya gagal (caller menampilkan pesan "Popup diblokir").
 */
export async function printBlobHiRes(blob: Blob, opts?: PrintHiResOptions): Promise<boolean> {
  const dataUrl = await blobToDataUrl(blob)
  const page = opts?.page ?? 'A5 portrait'
  const margin = opts?.margin ?? '0'
  const title = opts?.title ?? 'Cetak Dokumen'

  // Gambar memenuhi halaman (object-fit: contain) — margin kertas ditentukan
  // oleh @page; margin dokumen sudah tertanam di dalam gambar.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${title}</title>
<style>
  @page { size: ${page}; margin: ${margin}; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; }
  body { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
</style></head>
<body><img src="${dataUrl}" alt="${title}" onload="setTimeout(function(){ window.focus(); window.print(); }, 250)" /></body></html>`

  // Jalur 1 — popup window (jalur utama, gesture user masih aktif)
  try {
    const pw = window.open('', '_blank')
    if (pw) {
      pw.document.write(html)
      pw.document.close()
      return true
    }
  } catch {
    // popup diblokir / gagal — lanjut ke fallback iframe
  }

  // Jalur 2 — iframe tersembunyi (popup diblokir)
  try {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;'
    document.body.appendChild(iframe)
    const win = iframe.contentWindow
    const doc = win?.document
    if (!win || !doc) {
      iframe.remove()
      return false
    }
    doc.open()
    doc.write(html)
    doc.close()
    // Script onload di dalam HTML sudah memanggil print() pada window iframe.
    // Bersihkan iframe setelah dialog cetak selesai (best-effort).
    setTimeout(() => {
      try { iframe.remove() } catch { /* noop */ }
    }, 60_000)
    return true
  } catch {
    return false
  }
}
