'use client'

/**
 * POPUP PREVIEW INVOICE — lightbox pratinjau A5 fit layar.
 * Dipakai halaman Daftar Invoice Pelanggan (/master-customer/[id]):
 * klik baris/kartu invoice → fetch entry via /api/history/[id] →
 * tampilkan pratinjau dokumen A5 (InvoicePreview) di fullscreen dialog,
 * di-scale fit LEBAR & TINGGI viewport (mobile: memenuhi layar; desktop: fit tinggi).
 * Pola yang sama dengan lightbox pratinjau di halaman Invoice (Task 122).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Loader2, Printer, Image as ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import { fetcher } from '@/lib/fetcher'
import { getAuthHeaders } from '@/lib/auth'
import { captureDocumentPaperJpg } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { DEFAULT_COMPANY, type CompanyInfo, type InvoiceData } from '@/lib/types'

interface HistoryEntry {
  id: string
  docType: string
  nomor: string
  tanggal: string
  dataJson: string
}

// --- Parse dataJson → InvoiceData (identik dgn src/app/invoice/page.tsx) ---
function parseInvoiceData(entry: HistoryEntry): InvoiceData {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const company: CompanyInfo = {
      nama: parsed.company?.nama || DEFAULT_COMPANY.nama,
      telepon: parsed.company?.telepon || DEFAULT_COMPANY.telepon,
      alamat: parsed.company?.alamat || DEFAULT_COMPANY.alamat,
      email: parsed.company?.email || DEFAULT_COMPANY.email,
      npwp: parsed.company?.npwp || '',
      website: parsed.company?.website || '',
      ppn: parsed.company?.ppn ?? parsed.ppn ?? 11,
      logo: parsed.company?.logo || '',
      bankName: parsed.company?.bankName || '',
      bankAccount: parsed.company?.bankAccount || '',
      bankHolder: parsed.company?.bankHolder || '',
      bankName2: parsed.company?.bankName2 || '',
      bankAccount2: parsed.company?.bankAccount2 || '',
      bankHolder2: parsed.company?.bankHolder2 || '',
    }
    const client = parsed.client || { nama: '', kontak: '', alamat: '' }
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number; modal?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
      ...(it.modal !== undefined ? { modal: it.modal } : {}),
    }))
    const docType = (entry.docType === 'invoice-pelunasan' ? 'invoice-pelunasan' : 'invoice') as 'invoice' | 'invoice-pelunasan'
    return {
      type: docType,
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      client,
      items,
      ppn: parsed.ppn ?? 11,
      dp: parsed.dp || 0,
      dpAmount: parsed.dpAmount,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
      lunas: parsed.lunas === true,
      tanggalPelunasan: parsed.tanggalPelunasan || '',
      referensiInvoiceId: parsed.referensiInvoiceId || '',
      referensiInvoiceNomor: parsed.referensiInvoiceNomor || '',
      originalTotal: parsed.originalTotal,
      uangCapek: parsed.uangCapek || 0,
    }
  } catch {
    const docType = (entry.docType === 'invoice-pelunasan' ? 'invoice-pelunasan' : 'invoice') as 'invoice' | 'invoice-pelunasan'
    return {
      type: docType,
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      client: { nama: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      dp: 0,
      catatan: '',
      tanggalJatuhTempo: '',
      caraPembayaran: '',
      tanggalGiro: '',
      lunas: false,
      tanggalPelunasan: '',
      referensiInvoiceId: '',
      referensiInvoiceNomor: '',
      uangCapek: 0,
    }
  }
}

interface InvoicePreviewPopupProps {
  /** Id invoice (documentHistory) yang mau dipratinjau; null = popup tertutup */
  invoiceId: string | null
  /** Dipanggil saat popup minta ditutup (✕ / Esc / klik luar) */
  onClose: () => void
}

export function InvoicePreviewPopup({ invoiceId, onClose }: InvoicePreviewPopupProps) {
  const open = invoiceId !== null
  const [data, setData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)

  // Scaler lightbox
  const stageRef = useRef<HTMLDivElement>(null)
  const scalerRef = useRef<HTMLDivElement>(null)

  // Fetch entry saat popup dibuka
  useEffect(() => {
    if (!invoiceId) {
      setData(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    setData(null)
    void (async () => {
      try {
        const res = await fetcher(`/api/history/${encodeURIComponent(invoiceId)}`, {
          headers: getAuthHeaders(),
        })
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && json?.data) {
          const parsed = parseInvoiceData(json.data as HistoryEntry)
          if (!parsed.nomor && parsed.items.length === 0) {
            setError('Data invoice tidak dapat dibaca')
          } else {
            setData(parsed)
          }
        } else {
          setError(json?.error || 'Invoice tidak ditemukan')
        }
      } catch {
        if (!cancelled) setError('Gagal memuat pratinjau invoice')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [invoiceId])

  // Skala terbesar yang membuat SELURUH halaman A5 muat di viewport
  // (fit lebar & tinggi) — di HP umumnya memenuhi lebar layar.
  useLayoutEffect(() => {
    if (!open || !data) return
    const fit = () => {
      const stage = stageRef.current
      const wrap = scalerRef.current
      if (!stage || !wrap) return
      const a5 = wrap.querySelector('.a5-page') as HTMLElement | null
      if (!a5) return
      const naturalW = a5.offsetWidth
      const naturalH = a5.offsetHeight
      if (naturalW === 0 || naturalH === 0) {
        requestAnimationFrame(fit)
        return
      }
      const availW = stage.clientWidth
      const availH = stage.clientHeight
      if (availW === 0 || availH === 0) {
        requestAnimationFrame(fit)
        return
      }
      const scale = Math.min(availW / naturalW, availH / naturalH)
      a5.style.transform = `scale(${scale})`
      a5.style.transformOrigin = 'top left'
      wrap.style.width = `${naturalW * scale}px`
      wrap.style.height = `${naturalH * scale}px`
    }
    fit()
    const raf = requestAnimationFrame(fit)
    const timer = setTimeout(fit, 250)
    window.addEventListener('resize', fit)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', fit) }
  }, [open, data])

  // Sumber capture JPG/Cetak = .a5-page di dalam popup ini (ukuran tetap
  // 148mm, transform scale fit TIDAK mempengaruhi scrollWidth/offsetWidth).
  const getPreviewEl = () =>
    (scalerRef.current?.querySelector('.a5-page') as HTMLElement | null) || null

  // JPG: hasil = kanvas A5 portrait 300 DPI (1748×2480) — SAMA dengan hasil
  // JPG di halaman Invoice (marginPct 0: pratinjau sudah memuat margin).
  const handleJpg = async () => {
    if (!data) return
    const el = getPreviewEl()
    if (!el) { toast.error('Pratinjau tidak ditemukan'); return }
    setIsGeneratingJpg(true)
    try {
      const blob = await captureDocumentPaperJpg({ el, paper: 'A5', orientation: 'portrait', marginPct: 0 })
      const fileName = `${(data.nomor || 'draft').replace(/\//g, '-')}.jpg`
      const phone = data.client?.kontak || ''
      const result = await shareJpgToWhatsApp({
        blob,
        fileName,
        documentLabel: `Invoice ${data.nomor}`,
        phone,
      })
      if (result.status === 'shared') toast.success('Gambar dibagikan ke WhatsApp')
      else if (result.status === 'cancelled') { /* silent */ }
      else if (result.status === 'downloaded') toast.success(`${fileName} tersimpan ke perangkat`, { description: 'File JPG telah diunduh ke folder Downloads.' })
      else toast.error(result.error || 'Gagal memproses JPG')
    } catch (err) {
      console.error(err)
      toast.error('Gagal membuat JPG')
    } finally {
      setIsGeneratingJpg(false)
    }
  }

  // Cetak: hasil cetak = gambar JPG hi-res 300 DPI yang sama dengan hasil JPG
  // (identik mobile & desktop) — halaman A5 penuh, margin = margin pratinjau.
  const handlePrint = async () => {
    if (!data) return
    const el = getPreviewEl()
    if (!el) { toast.error('Pratinjau tidak ditemukan'); return }
    setIsPrinting(true)
    try {
      const blob = await captureDocumentPaperJpg({ el, paper: 'A5', orientation: 'portrait', marginPct: 0 })
      const label = (data.nomor || 'invoice').replace(/\//g, '-')
      const ok = await printBlobHiRes(blob, { title: `Invoice ${label}`, page: '148mm 210mm', margin: '0' })
      if (!ok) toast.error('Popup diblokir. Izinkan popup untuk mencetak.')
    } catch (e) {
      console.error('Print error:', e)
      toast.error('Gagal menyiapkan cetakan')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        aria-label="Pratinjau invoice"
        aria-describedby={undefined}
        className="h-screen max-h-none w-full max-w-none sm:max-w-none rounded-none border-0 bg-stone-950/95 p-0 overflow-hidden gap-0"
        style={{ height: '100dvh' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pratinjau"
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white transition-colors hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="absolute inset-0 p-3 sm:p-6">
          <div ref={stageRef} className="flex h-full w-full items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-stone-300" role="status" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Memuat pratinjau…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 text-center px-6">
                <p className="text-sm text-stone-300">{error}</p>
                <Button size="sm" variant="outline" onClick={onClose} className="border-white/25 bg-black/40 text-white hover:bg-black/70 hover:text-white">
                  Tutup
                </Button>
              </div>
            ) : data ? (
              <div
                ref={scalerRef}
                className="overflow-hidden rounded-lg bg-white shadow-2xl"
                style={{ border: '1px solid #e7e5e4' }}
              >
                <InvoicePreview data={data} showPelunasanLabel={data.type === 'invoice-pelunasan'} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Tombol aksi: Cetak + JPG — overlay bawah tengah (di luar .a5-page,
            tidak ikut ter-capture). Hasil = sama dengan halaman Invoice. */}
        {data && !loading && !error && (
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/25 bg-black/60 p-1.5 shadow-xl backdrop-blur-sm">
            <Button
              size="sm"
              disabled={isPrinting || isGeneratingJpg}
              onClick={handlePrint}
              className="min-h-[40px] rounded-full bg-white text-stone-900 hover:bg-stone-200 gap-1.5 px-4"
            >
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Cetak
            </Button>
            <Button
              size="sm"
              disabled={isPrinting || isGeneratingJpg}
              onClick={handleJpg}
              className="min-h-[40px] rounded-full bg-emerald-600 text-white hover:bg-emerald-500 gap-1.5 px-4"
            >
              {isGeneratingJpg ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} JPG
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
