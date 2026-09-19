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
import { Loader2, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import { fetcher } from '@/lib/fetcher'
import { getAuthHeaders } from '@/lib/auth'
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
      </DialogContent>
    </Dialog>
  )
}
