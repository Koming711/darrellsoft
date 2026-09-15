'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InvoiceEditor } from '@/components/dokupro/invoice-editor'
import { InvoicePelunasanEditor } from '@/components/dokupro/invoice-pelunasan-editor'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { fetcher } from '@/lib/fetcher'
import { formatRupiah, formatTanggalShort } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import {
  History,
  Trash2,
  FileText,
  Loader2,
  Search,
  DatabaseBackup,
  Upload,
  CheckCircle2,
  Wallet,
  Banknote,
  Plus,
  ArrowLeft,
  X,
  Printer,
  ImageIcon,
  Truck,
  Ban,
  ArchiveRestore,
  Eye,
  ChevronRight,
  FileSpreadsheet,
  ReceiptText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import { captureElementAsJpg, fitBlobToA5 } from '@/lib/capture-jpg'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { syncLinkedPelunasan } from '@/lib/sync-pelunasan'
import { useDokuproStore } from '@/lib/store'
import type { InvoiceData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'
import {
  riwayatDateRange,
  type RiwayatPeriod,
} from '@/components/dokupro/riwayat-period-filter'

// --- Types ---
interface HistoryEntry {
  id: string
  docType: string
  nomor: string
  tanggal: string
  pihakKedua: string
  total: string
  dataJson: string
  createdAt: string
  deletedAt?: string | null
}

type InvoiceStatus = 'lunas' | 'belum' | 'batal'
type RiwayatTab = 'invoice' | 'pembayaran' | 'sampah'

// --- Helper ---
function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- Parse dataJson for document info ---
function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const itemCount = items.length
    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''
    const hargaSatuan = firstItem?.harga || 0
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const dpPercent = parsed.dp || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    // Always derive dpAmount from originalTotal
    const originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : totalHarga
    const dpAmount = originalTotal * (dpPercent / 100)
    const sisa = totalHarga - dpAmount
    const lunas = parsed.lunas === true
    const batal = parsed.batal === true
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const tanggalPelunasan = parsed.tanggalPelunasan || ''
    const referensi = parsed.referensi || ''
    const referensiInvoiceNomor = parsed.referensiInvoiceNomor || ''
    const isPelunasan = entry.docType === 'invoice-pelunasan'
    const uangCapek = parsed.uangCapek || 0
    return { namaBarang, hargaSatuan, totalQty, totalHarga, dpPercent, dp: dpAmount, sisa, lunas, batal, tanggalJatuhTempo, tanggalPelunasan, referensi, referensiInvoiceNomor, isPelunasan, originalTotal, uangCapek, itemCount }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, dpPercent: 0, dp: 0, sisa: 0, lunas: false, batal: false, tanggalJatuhTempo: '', tanggalPelunasan: '', referensi: '', referensiInvoiceNomor: '', isPelunasan: false, originalTotal: 0, uangCapek: 0, itemCount: 0 }
  }
}

// --- Status invoice (batal > lunas > belum) ---
function getInvoiceStatus(info: ReturnType<typeof parseDocInfo>): InvoiceStatus {
  if (info.batal) return 'batal'
  if (info.isPelunasan) return info.lunas ? 'lunas' : 'belum'
  const hasDP = info.dpPercent > 0 || info.dp > 0
  return (hasDP ? info.lunas : (info.lunas || info.sisa <= 0)) ? 'lunas' : 'belum'
}

// --- Parse dataJson for InvoiceData ---
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

// --- Badge status (Lunas / Belum Lunas / Batal) — TIDAK bisa diklik ---
function StatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === 'batal') {
    return <Badge variant="outline" className="bg-stone-100 text-stone-600 border-stone-300 text-[11px] shrink-0">Batal</Badge>
  }
  return status === 'lunas'
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Lunas</Badge>
    : <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[11px] shrink-0">Belum Lunas</Badge>
}

// --- Empty state (gaya Master Customer) ---
function EmptyState({ filtered, title, desc }: { filtered: boolean; title?: string; desc?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white text-center py-12 px-4">
      <History className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">{title || (filtered ? 'Tidak ditemukan' : 'Belum ada invoice')}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {desc || (filtered ? 'Coba kata kunci lain.' : 'Buat invoice pertama Anda dengan tombol "+ Buat Invoice".')}
      </p>
    </div>
  )
}

// ============================================================
// DetailInvoiceView — "halaman pratinjau" setelah Simpan di Buat
// Invoice & halaman detail saat baris riwayat diklik.
// Tombol Cetak / JPG / Surat Jalan / Tandai Lunas / Hapus / Batal
// ada DI ATAS pratinjau. Pratinjau A5 ber-outline, +20% (desktop),
// full-width di mobile.
// ============================================================
/** Blob JPG → data URL (untuk <img> di jendela cetak). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca data gambar'))
    reader.readAsDataURL(blob)
  })
}

function DetailInvoiceView({ id, onBack }: { id: string; onBack: () => void }) {
  const router = useRouter()
  const resetDocument = useDokuproStore((s) => s.resetDocument)
  const [entry, setEntry] = useState<HistoryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jpgGenerating, setJpgGenerating] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Dialog konfirmasi
  const [lunasOpen, setLunasOpen] = useState(false)
  const [batalOpen, setBatalOpen] = useState(false)
  const [hapusOpen, setHapusOpen] = useState(false)

  // Pratinjau scaler
  const scalerRef = useRef<HTMLDivElement>(null)

  const loadEntry = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetcher(`/api/history/${id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const json = await res.json()
        setEntry(json.data || null)
      } else {
        setError('Invoice tidak ditemukan')
      }
    } catch {
      setError('Gagal memuat invoice')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadEntry() }, [loadEntry])

  const data = useMemo(() => (entry ? parseInvoiceData(entry) : null), [entry])
  const info = useMemo(() => (entry ? parseDocInfo(entry) : null), [entry])
  const status: InvoiceStatus = info ? getInvoiceStatus(info) : 'belum'

  // Scale pratinjau A5 agar pas dengan container (desktop ~+20% dari ukuran
  // asli 148mm, mobile full-width). offsetWidth/Height tidak terpengaruh transform.
  useLayoutEffect(() => {
    if (!data) return
    const fit = () => {
      const wrapper = scalerRef.current
      if (!wrapper) return
      const a5 = wrapper.querySelector('.a5-page') as HTMLElement | null
      if (!a5) return
      const naturalW = a5.offsetWidth
      const naturalH = a5.offsetHeight
      if (naturalW === 0 || naturalH === 0) {
        requestAnimationFrame(fit)
        return
      }
      const availW = wrapper.parentElement?.clientWidth || wrapper.clientWidth
      if (availW === 0) {
        requestAnimationFrame(fit)
        return
      }
      const scale = availW / naturalW
      a5.style.transform = `scale(${scale})`
      a5.style.transformOrigin = 'top left'
      wrapper.style.width = `${naturalW * scale}px`
      wrapper.style.height = `${naturalH * scale}px`
    }
    fit()
    const raf = requestAnimationFrame(fit)
    const timer = setTimeout(fit, 250)
    window.addEventListener('resize', fit)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', fit) }
  }, [data])

  const handleJpg = async () => {
    if (!data) return
    setJpgGenerating(true)
    try {
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
      if (!previewEl) { toast.error('Pratinjau tidak ditemukan'); return }
      // Hi-res capture (3x) → dikomposisi ke kanvas A5 portrait (148 × 210 mm),
      // identik dengan pratinjau di layar
      const rawBlob = await captureElementAsJpg(previewEl, { pixelRatio: 3 })
      const blob = await fitBlobToA5(rawBlob, { orientation: 'portrait', marginPct: 3 })
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
      setJpgGenerating(false)
    }
  }

  // Cetak: hasil cetak = sama persis dengan pratinjau di layar, hi-res (3x),
  // di-fit ke halaman A5 portrait (148 × 210 mm)
  const handlePrint = async () => {
    if (!data) return
    const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
    if (!previewEl) { toast.error('Pratinjau tidak ditemukan'); return }
    setIsPrinting(true)
    try {
      // Capture pratinjau apa adanya → gambar 100% sama dengan tampilan layar
      const blob = await captureElementAsJpg(previewEl, { pixelRatio: 3 })
      const dataUrl = await blobToDataUrl(blob)
      const label = (data.nomor || 'invoice').replace(/\//g, '-')
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Invoice ${label}</title>
<style>
  @page { size: A5 portrait; margin: 5mm; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; }
  body { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
</style></head>
<body><img src="${dataUrl}" alt="Detail Invoice" onload="setTimeout(function(){ window.focus(); window.print(); }, 250)" /></body></html>`
      const pw = window.open('', '_blank')
      if (!pw) { toast.error('Popup diblokir'); return }
      pw.document.write(html)
      pw.document.close()
    } catch (e) {
      console.error('Print error:', e)
      toast.error('Gagal menyiapkan cetakan')
    } finally { setIsPrinting(false) }
  }

  // Tandai Lunas — invoice dinyatakan lunas penuh hari ini (+ sinkron PEL)
  const handleTandaiLunas = async () => {
    if (!entry || !data) return
    setUpdating(true)
    try {
      const parsed = JSON.parse(entry.dataJson)
      parsed.lunas = true
      parsed.tanggalPelunasan = getTodayStr()
      delete parsed.statusPembayaran
      if ((parsed.dp || 0) > 0) {
        const sub = (parsed.items || []).reduce((s: number, it: { qty: number; harga: number }) => s + it.qty * it.harga, 0)
        const totalHarga = sub + (sub * (parsed.ppn || 0) / 100)
        parsed.originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : totalHarga
        parsed.dpAmount = parsed.originalTotal * (parsed.dp / 100)
      }
      const res = await fetcher(`/api/history/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: JSON.stringify(parsed) }),
      })
      if (res.ok) {
        await syncLinkedPelunasan(entry.id, parsed.nomor || entry.nomor, parsed)
        toast.success('Invoice ditandai LUNAS')
        setLunasOpen(false)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('invoice')
        loadEntry()
      } else {
        toast.error('Gagal menandai lunas')
      }
    } catch {
      toast.error('Gagal menandai lunas')
    } finally {
      setUpdating(false)
    }
  }

  // Batal — invoice dibatalkan (status Batal di riwayat & detail)
  const handleBatal = async () => {
    if (!entry) return
    setUpdating(true)
    try {
      const parsed = JSON.parse(entry.dataJson)
      parsed.batal = true
      const res = await fetcher(`/api/history/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: JSON.stringify(parsed) }),
      })
      if (res.ok) {
        toast.success('Invoice dibatalkan')
        setBatalOpen(false)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('invoice')
        loadEntry()
      } else {
        toast.error('Gagal membatalkan invoice')
      }
    } catch {
      toast.error('Gagal membatalkan invoice')
    } finally {
      setUpdating(false)
    }
  }

  // Hapus — soft delete → masuk tab Sampah (bisa dipulihkan)
  const handleHapus = async () => {
    if (!entry) return
    setUpdating(true)
    try {
      const res = await fetcher(`/api/history/${entry.id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Invoice dipindahkan ke Sampah')
        setHapusOpen(false)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('invoice')
        resetDocument('invoice')
        onBack()
      } else {
        toast.error('Gagal menghapus invoice')
      }
    } catch {
      toast.error('Gagal menghapus invoice')
    } finally {
      setUpdating(false)
    }
  }

  const actionButtons = (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button size="sm" onClick={handlePrint} disabled={isPrinting} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 min-h-[36px]">
        {isPrinting ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Cetak...</> : <><Printer className="mr-1.5 h-3.5 w-3.5" /> Cetak</>}
      </Button>
      <Button size="sm" onClick={handleJpg} disabled={jpgGenerating} className="bg-green-600 hover:bg-green-700 min-h-[36px]">
        {jpgGenerating ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> JPG...</> : <><ImageIcon className="mr-1.5 h-3.5 w-3.5" /> JPG</>}
      </Button>
      <Button size="sm" onClick={() => router.push(`/surat-jalan?invoiceId=${id}`)} className="bg-orange-600 hover:bg-orange-700 min-h-[36px]">
        <Truck className="mr-1.5 h-3.5 w-3.5" /> Surat Jalan
      </Button>
      {/* Tombol Tandai Lunas dipindah ke kotak info ringkas (info pembayaran)
          agar terlihat jelas di halaman detail — permintaan owner. */}
      {status !== 'batal' && (
        <Button size="sm" variant="outline" onClick={() => setBatalOpen(true)} className="border-amber-300 text-amber-700 hover:bg-amber-50 min-h-[36px]">
          <Ban className="mr-1.5 h-3.5 w-3.5" /> Batal
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setHapusOpen(true)} className="border-red-200 text-destructive hover:bg-red-50 hover:text-destructive min-h-[36px]">
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
      </Button>
    </div>
  )

  return (
    <div>
      {/* Header — Kembali + judul "Detail Invoice" + tipe dokumen.
          Tulisan status "Lunas"/"Belum Lunas" DIHAPUS sesuai permintaan owner;
          yang tersisa: badge Batal (jika dibatalkan) + badge tipe dokumen. */}
      <div className="flex items-center gap-2 mb-3 print:hidden flex-wrap">
        <Button onClick={onBack} variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali
        </Button>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">Detail Invoice</h2>
        {info && status === 'batal' && <StatusBadge status={status} />}
        {/* Invoice DP → detail juga bertanda DP; pelunasan → bertanda Pelunasan */}
        {info && !info.isPelunasan && info.dpPercent > 0 && (
          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-[11px] shrink-0">Invoice DP</Badge>
        )}
        {info && info.isPelunasan && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[11px] shrink-0">Invoice Pelunasan</Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[480px] w-full max-w-[670px] mx-auto rounded-xl" />
        </div>
      ) : error || !entry || !data || !info ? (
        <EmptyState filtered title={error || 'Invoice tidak ditemukan'} desc="Kembali ke riwayat dan pilih invoice lain." />
      ) : (
        <>
          {/* Info ringkas */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 mb-4 print:hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">No. Invoice</p>
                <p className="font-semibold truncate">{entry.nomor || '-'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tanggal</p>
                <p className="font-medium">{entry.tanggal ? formatTanggalShort(entry.tanggal) : '-'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer</p>
                <p className="font-medium truncate">{entry.pihakKedua || '-'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</p>
              </div>
            </div>
            {info.referensiInvoiceNomor && (
              <p className="text-xs text-violet-700 mt-2">Ref. Invoice DP: <span className="font-medium">{info.referensiInvoiceNomor}</span></p>
            )}
            {info.dpPercent > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                DP ({info.dpPercent}%): {formatRupiah(info.dp)} · Sisa: <span className={cn('font-semibold', info.lunas ? 'text-emerald-600' : 'text-red-600')}>{formatRupiah(info.sisa)}</span>
                {info.lunas && info.tanggalPelunasan ? ` · Dibayar ${formatTanggalShort(info.tanggalPelunasan)}` : ''}
              </p>
            )}
            {/* Tombol Tandai Lunas — menonjol di kotak info detail invoice
                (permintaan owner); tanpa tulisan status "Lunas/Belum Lunas". */}
            {status !== 'lunas' && status !== 'batal' && (
              <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">Pembayaran invoice ini belum diterima penuh.</p>
                <Button size="sm" onClick={() => setLunasOpen(true)} className="bg-violet-600 hover:bg-violet-700 min-h-[36px]">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Tandai Lunas
                </Button>
              </div>
            )}
          </div>

          {/* Tombol aksi — DI ATAS pratinjau */}
          <div className="mb-4">{actionButtons}</div>

          {/* Pratinjau A5 — outline, fit container (±+20% desktop, full mobile) */}
          <div className="flex justify-center print:hidden" id="document-preview">
            <div className="w-full" style={{ maxWidth: '670px' }}>
              <div
                ref={scalerRef}
                data-preview-scaler
                data-document-preview
                className="a5-preview-container bg-white overflow-hidden"
                style={{ border: '2px solid #cbd5e1', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}
              >
                <InvoicePreview data={data} showPelunasanLabel={data.type === 'invoice-pelunasan'} />
              </div>
            </div>
          </div>

          {/* Konfirmasi Tandai Lunas */}
          <AlertDialog open={lunasOpen} onOpenChange={setLunasOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tandai invoice lunas?</AlertDialogTitle>
                <AlertDialogDescription>
                  Sisa pembayaran invoice {entry.nomor} akan dianggap sudah dibayar penuh pada hari ini.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updating}>Batal</AlertDialogCancel>
                <AlertDialogAction className="bg-violet-600 hover:bg-violet-700" onClick={(e) => { e.preventDefault(); void handleTandaiLunas() }}>
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Tandai Lunas'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Konfirmasi Batal */}
          <AlertDialog open={batalOpen} onOpenChange={setBatalOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan invoice ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Invoice {entry.nomor} akan ditandai BATAL dan statusnya tampil sebagai &quot;Batal&quot; di riwayat. Tindakan ini tetap dapat ditinjau melalui detail invoice.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updating}>Tidak</AlertDialogCancel>
                <AlertDialogAction className="bg-amber-600 hover:bg-amber-700 text-white" onClick={(e) => { e.preventDefault(); void handleBatal() }}>
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Batalkan Invoice'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Konfirmasi Hapus */}
          <AlertDialog open={hapusOpen} onOpenChange={setHapusOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus invoice?</AlertDialogTitle>
                <AlertDialogDescription>
                  Invoice {entry.nomor} akan dipindahkan ke tab Sampah dan masih dapat dipulihkan dari sana.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updating}>Batal</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); void handleHapus() }}>
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Hapus'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}

// ============================================================
// InvoiceRiwayatView — daftar invoice dengan tab:
//   Riwayat Invoice | Riwayat Pembayaran | Sampah
// ============================================================
function InvoiceRiwayatView({ onOpenDetail, onCreate }: { onOpenDetail: (id: string) => void; onCreate: () => void }) {
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([])
  const [pelunasanHistory, setPelunasanHistory] = useState<HistoryEntry[]>([])
  const [sampahList, setSampahList] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sampahLoading, setSampahLoading] = useState(false)
  const [sampahActionId, setSampahActionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<RiwayatTab>('invoice')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [period, setPeriod] = useState<RiwayatPeriod>('all')
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())
  const [purgeTarget, setPurgeTarget] = useState<HistoryEntry | null>(null)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  // Cari dengan debounce 300ms (gaya Riwayat Invoice: ketik → otomatis difilter)
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      // cache: 'no-store' MANDATORY — hindari stale cache setelah PUT/DELETE.
      const [invRes, pelRes] = await Promise.all([
        fetch('/api/history?docType=invoice', { headers, cache: 'no-store' }),
        fetch('/api/history?docType=invoice-pelunasan', { headers, cache: 'no-store' }),
      ])
      const invData = invRes.ok ? (await invRes.json()).data || [] : []
      const pelData = pelRes.ok ? (await pelRes.json()).data || [] : []
      setInvoiceHistory(invData)
      setPelunasanHistory(pelData)
    } catch (err) {
      console.error('Failed to fetch invoice history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSampah = useCallback(async () => {
    try {
      setSampahLoading(true)
      const res = await fetch('/api/history?deleted=1', { headers: getAuthHeaders(), cache: 'no-store' })
      const json = res.ok ? await res.json() : { data: [] }
      setSampahList(json.data || [])
    } catch {
      setSampahList([])
    } finally {
      setSampahLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  useEffect(() => {
    if (activeTab === 'sampah') fetchSampah()
  }, [activeTab, fetchSampah])

  useEffect(() => {
    const handler = () => { fetchHistory(); if (activeTab === 'sampah') fetchSampah() }
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchHistory, fetchSampah, activeTab])

  const allHistory = useMemo(() => [...invoiceHistory, ...pelunasanHistory], [invoiceHistory, pelunasanHistory])

  // Periode efektif (rentang tanggal yyyy-mm-dd, inklusif) dari Dari/Sampai tanggal
  const eff = useMemo(
    () => riwayatDateRange(period, dateFrom, dateTo, month, year),
    [period, dateFrom, dateTo, month, year]
  )

  // Filter pencarian + status + rentang tanggal efektif (inklusif)
  const matchesFilters = useCallback((entry: HistoryEntry) => {
    const info = parseDocInfo(entry)
    const st = getInvoiceStatus(info)
    if (statusFilter !== 'all' && st !== statusFilter) return false
    if (eff.dateFrom && entry.tanggal && entry.tanggal < eff.dateFrom) return false
    if (eff.dateTo && entry.tanggal && entry.tanggal > eff.dateTo) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const hay = `${entry.nomor || ''} ${entry.pihakKedua || ''} ${info.namaBarang || ''} ${entry.tanggal || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }, [statusFilter, eff, searchQuery])

  const dpInvoices = useMemo(() => allHistory.filter(e => e.docType === 'invoice' && matchesFilters(e)), [allHistory, matchesFilters])
  const pelunasanInvoices = useMemo(() => allHistory.filter(e => e.docType === 'invoice-pelunasan' && matchesFilters(e)), [allHistory, matchesFilters])

  // Daftar gabungan (invoice + invoice pelunasan) — satu tabel, terbaru di atas
  const combinedList = useMemo(
    () => [...dpInvoices, ...pelunasanInvoices].sort(
      (a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
    ),
    [dpInvoices, pelunasanInvoices]
  )

  // Riwayat Pembayaran — semua invoice (DP/pelunasan) yang sudah lunas & punya tanggal bayar
  const pembayaranList = useMemo(() => {
    return allHistory
      .map((e) => ({ entry: e, info: parseDocInfo(e) }))
      .filter(({ info }) => !info.batal && info.lunas && !!info.tanggalPelunasan)
      .sort((a, b) => (b.info.tanggalPelunasan || '').localeCompare(a.info.tanggalPelunasan || ''))
  }, [allHistory])

  // Ringkasan daftar terfilter (subjudul header, gaya Riwayat Invoice)
  const listSummary = useMemo(() => {
    let total = 0
    for (const entry of combinedList) {
      total += parseDocInfo(entry).totalHarga
    }
    return { count: combinedList.length, total }
  }, [combinedList])

  const filtersActive = statusFilter !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim()

  const resetFilters = () => {
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
    setSearchQuery('')
  }

  // Export Excel — unduh daftar invoice terfilter (mengikuti filter aktif)
  const handleExportExcel = async () => {
    setExportLoading(true)
    try {
      const p = new URLSearchParams()
      if (searchQuery.trim()) p.set('q', searchQuery.trim())
      if (statusFilter !== 'all') p.set('status', statusFilter)
      if (dateFrom) p.set('from', dateFrom)
      if (dateTo) p.set('to', dateTo)
      const qs = p.toString()
      const res = await authFetch(`/api/export/invoices${qs ? `?${qs}` : ''}`)
      if (!res.ok) {
        let errMsg = 'Gagal export riwayat invoice'
        try { const errData = await res.json(); errMsg = errData?.error || errMsg } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) { toast.error('Data export kosong'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? decodeURIComponent(match[1]) : `Riwayat-Invoice-${getTodayStr()}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('File Excel berhasil diunduh')
    } catch (e) {
      console.error('Export error:', e)
      toast.error('Gagal export riwayat invoice')
    } finally {
      setExportLoading(false)
    }
  }

  // === Sampah actions ===
  const handlePulihkan = async (item: HistoryEntry) => {
    setSampahActionId(item.id)
    try {
      const res = await fetcher(`/api/history/${item.id}`, { method: 'POST', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success(`${item.nomor || 'Dokumen'} dipulihkan`)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        fetchSampah()
      } else {
        toast.error('Gagal memulihkan data')
      }
    } catch {
      toast.error('Gagal memulihkan data')
    } finally {
      setSampahActionId(null)
    }
  }

  const handlePurge = async () => {
    if (!purgeTarget) return
    setSampahActionId(purgeTarget.id)
    try {
      const res = await fetcher(`/api/history/${purgeTarget.id}?purge=1`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Data dihapus permanen')
        setPurgeTarget(null)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        fetchSampah()
      } else {
        toast.error('Gagal menghapus permanen')
      }
    } catch {
      toast.error('Gagal menghapus permanen')
    } finally {
      setSampahActionId(null)
    }
  }

  // === Backup / Restore xlsx (riwayat invoice) ===
  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch('/api/database/backup-master?table=invoice_history')
      if (!res.ok) {
        let errMsg = 'Gagal backup data riwayat invoice'
        try { const errData = await res.json(); errMsg = errData?.error || errMsg } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) { toast.error('Backup kosong'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? match[1] : `backup-invoice-history-${Date.now()}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data riwayat invoice yang ada akan diganti. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData(); fd.append('file', file); fd.append('table', 'invoice_history')
        const res = await authFetch('/api/database/restore-master', { method: 'POST', body: fd })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`); fetchHistory(); notifyDataChange('invoice')
        } else { toast.error(data.error || 'Gagal restore') }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const docTypeLabel = (docType: string) => {
    if (docType === 'invoice') return 'Invoice'
    if (docType === 'invoice-pelunasan') return 'Invoice Pelunasan'
    if (docType === 'surat-jalan') return 'Surat Jalan'
    if (docType === 'purchase-order') return 'Purchase Order'
    return docType
  }

  const hasResults = combinedList.length > 0

  return (
    <>
      <div className="space-y-5">
        {/* === TABS: Riwayat Invoice | Riwayat Pembayaran | Sampah === */}
        {/* Diletakkan DI ATAS judul sesuai permintaan — tab pertama yang terlihat.
            Mobile memakai label PENDEK + padding kecil agar KETIGA tab selalu
            muat tanpa scroll horizontal (sebelumnya tab "Sampah" terpotong
            di luar layar 390px). Label penuh tampil mulai sm+. */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
          {([
            { key: 'invoice' as const, label: 'Riwayat Invoice', short: 'Invoice', icon: <FileText className="w-3.5 h-3.5" /> },
            { key: 'pembayaran' as const, label: 'Riwayat Pembayaran', short: 'Pembayaran', icon: <Wallet className="w-3.5 h-3.5" /> },
            { key: 'sampah' as const, label: 'Sampah', short: 'Sampah', icon: <Trash2 className="w-3.5 h-3.5" /> },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-2.5 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap flex-shrink-0',
                activeTab === t.key
                  ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.icon}
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Header — gaya Riwayat Invoice */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Invoice</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? 'Memuat data…' : `${listSummary.count} invoice · Total ${formatRupiah(listSummary.total)}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={onCreate}
              title="Buat invoice baru"
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
            >
              <Plus className="h-4 w-4" /> Buat Invoice
            </Button>
            <Button onClick={handleExportExcel} variant="outline" disabled={exportLoading} title="Export daftar invoice ke Excel" aria-label="Export daftar invoice ke Excel" className="min-h-[44px] flex-1 sm:flex-none">
              {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Export Excel
            </Button>
            <Button onClick={handleBackup} variant="outline" disabled={backupLoading === 'backup'} title="Backup riwayat invoice" className="min-h-[44px] flex-1 sm:flex-none">
              {backupLoading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Backup
            </Button>
            <Button onClick={handleRestore} variant="outline" disabled={backupLoading === 'restore'} title="Restore riwayat invoice" className="min-h-[44px] flex-1 sm:flex-none">
              {backupLoading === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore
            </Button>
          </div>
        </div>

        {/* ================= TAB: RIWAYAT INVOICE ================= */}
        {activeTab === 'invoice' && (
          <>
            {/* Filter bar — selalu tampil: Cari | Status | Dari | Sampai */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden="true" />
                <Input
                  id="riwayat-invoice-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari nomor / pelanggan…"
                  aria-label="Cari invoice"
                  className="pl-9 min-h-[44px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v || 'all') as 'all' | InvoiceStatus)}>
                <SelectTrigger aria-label="Filter status invoice" className="w-full sm:w-40 min-h-[44px]">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="lunas">Lunas</SelectItem>
                  <SelectItem value="belum">Belum Lunas</SelectItem>
                  <SelectItem value="batal">Batal</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Dari tanggal"
                title="Dari tanggal"
                className="w-full sm:w-40 min-h-[44px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Sampai tanggal"
                title="Sampai tanggal"
                className="w-full sm:w-40 min-h-[44px]"
              />
              {filtersActive && (
                <Button variant="ghost" className="text-xs text-muted-foreground h-10" onClick={resetFilters}>
                  <X className="h-3.5 w-3.5" /> Reset
                </Button>
              )}
            </div>

            {/* Daftar — satu tabel gabungan (invoice + pelunasan), klik baris → Detail */}
            {loading ? (
              <>
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
                <div className="md:hidden space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
                </div>
              </>
            ) : !hasResults ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white text-center py-12 px-4">
                <ReceiptText className="h-10 w-10 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-medium">{filtersActive ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {filtersActive ? 'Ubah kata kunci atau filter pencarian.' : 'Buat invoice pertama Anda dengan tombol "+ Buat Invoice".'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table — klik baris → Detail Invoice */}
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                  <div className="max-h-96 overflow-y-auto scrollbar-thin">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-stone-50">
                        <TableRow className="bg-stone-50 hover:bg-stone-50">
                          <TableHead>Nomor</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Pelanggan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Jumlah Item</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {combinedList.slice(0, 100).map((entry) => {
                          const info = parseDocInfo(entry)
                          const st = getInvoiceStatus(info)
                          return (
                            <TableRow
                              key={entry.id}
                              tabIndex={0}
                              onClick={() => onOpenDetail(entry.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onOpenDetail(entry.id)
                                }
                              }}
                              aria-label={`Buka invoice ${entry.nomor || ''}`}
                              className="cursor-pointer"
                            >
                              <TableCell className="font-medium whitespace-nowrap">{entry.nomor || '-'}</TableCell>
                              <TableCell className="whitespace-nowrap text-muted-foreground">{entry.tanggal ? formatTanggalShort(entry.tanggal) : '-'}</TableCell>
                              <TableCell className="max-w-48 truncate">{entry.pihakKedua || '-'}</TableCell>
                              <TableCell><StatusBadge status={st} /></TableCell>
                              <TableCell className="text-center tabular-nums">{info.itemCount || '-'}</TableCell>
                              <TableCell className="text-right font-semibold whitespace-nowrap">{formatRupiah(info.totalHarga)}</TableCell>
                              <TableCell>
                                <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile cards — klik kartu → Detail Invoice */}
                <div className="md:hidden space-y-3">
                  {combinedList.slice(0, 100).map((entry) => {
                    const info = parseDocInfo(entry)
                    const st = getInvoiceStatus(info)
                    return (
                      <button
                        key={entry.id}
                        onClick={() => onOpenDetail(entry.id)}
                        aria-label={`Buka invoice ${entry.nomor || ''}`}
                        className="w-full text-left"
                      >
                        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 transition-colors active:bg-stone-50 hover:border-stone-300">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{entry.nomor || '-'}</p>
                              <p className="text-xs text-muted-foreground truncate">{entry.pihakKedua || '-'}</p>
                            </div>
                            <StatusBadge status={st} />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">
                              {entry.tanggal ? formatTanggalShort(entry.tanggal) : '-'} · {info.itemCount || 0} item
                            </span>
                            <span className="font-semibold whitespace-nowrap">{formatRupiah(info.totalHarga)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ================= TAB: RIWAYAT PEMBAYARAN ================= */}
        {activeTab === 'pembayaran' && (
          loading ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : pembayaranList.length === 0 ? (
            <EmptyState
              filtered={filtersActive}
              title="Belum ada pembayaran"
              desc="Invoice yang sudah lunas akan tampil di sini beserta tanggal pembayarannya."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-stone-50">
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead className="w-10">No.</TableHead>
                        <TableHead className="w-0 min-w-0">No. Invoice</TableHead>
                        <TableHead>Ref. Invoice DP</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Tanggal Bayar</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pembayaranList.slice(0, 100).map(({ entry, info }, i) => (
                        <TableRow key={entry.id} className="cursor-pointer hover:bg-stone-50" onClick={() => onOpenDetail(entry.id)}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap w-px">{entry.nomor || '-'}</TableCell>
                          <TableCell className="text-violet-700 whitespace-nowrap">{info.referensiInvoiceNomor || '-'}</TableCell>
                          <TableCell className="max-w-56 truncate">{entry.pihakKedua || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{info.tanggalPelunasan ? formatTanggalShort(info.tanggalPelunasan) : '-'}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-700 whitespace-nowrap">{formatRupiah(info.totalHarga)}</TableCell>
                          <TableCell className="text-center"><StatusBadge status="lunas" /></TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Lihat" aria-label={`Lihat ${entry.nomor || 'invoice'}`} onClick={() => onOpenDetail(entry.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {pembayaranList.slice(0, 100).map(({ entry, info }) => (
                  <Card key={entry.id} className="p-0 gap-0 cursor-pointer hover:bg-stone-50 transition-colors" onClick={() => onOpenDetail(entry.id)}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-xs font-semibold break-all">{entry.nomor || '-'}</p>
                        <StatusBadge status="lunas" />
                      </div>
                      <p className="text-sm">
                        <span className="text-muted-foreground">{info.tanggalPelunasan ? formatTanggalShort(info.tanggalPelunasan) : '-'} · </span>
                        <span className="font-medium">{entry.pihakKedua || '-'}</span>
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                        <p className="text-muted-foreground">Total: <span className="font-medium text-stone-700">{formatRupiah(info.totalHarga)}</span></p>
                        {info.referensiInvoiceNomor && <p className="text-muted-foreground">Ref: <span className="font-medium text-stone-700">{info.referensiInvoiceNomor}</span></p>}
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2.5">
                        <Button variant="outline" className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); onOpenDetail(entry.id) }}>
                          <Eye className="h-3.5 w-3.5" /> Detail
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )
        )}

        {/* ================= TAB: SAMPAH ================= */}
        {activeTab === 'sampah' && (
          sampahLoading ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sampahList.length === 0 ? (
            <EmptyState
              title="Sampah kosong"
              desc="Dokumen yang dihapus (invoice, surat jalan, PO) akan tampil di sini dan masih bisa dipulihkan."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-stone-50">
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead className="w-10">No.</TableHead>
                        <TableHead className="w-0 min-w-0">Nomor</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Pihak</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampahList.slice(0, 100).map((item, i) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap w-px">{item.nomor || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[11px] border-stone-200 text-stone-600">{docTypeLabel(item.docType)}</Badge>
                          </TableCell>
                          <TableCell className="max-w-48 truncate">{item.pihakKedua || '-'}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{item.tanggal ? formatTanggalShort(item.tanggal) : '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={sampahActionId === item.id}
                                onClick={() => void handlePulihkan(item)}
                                title="Pulihkan data ini"
                              >
                                {sampahActionId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                                Pulihkan
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs text-destructive border-red-200 hover:bg-red-50 hover:text-destructive"
                                onClick={() => setPurgeTarget(item)}
                                title="Hapus permanen"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {sampahList.slice(0, 100).map((item) => (
                  <Card key={item.id} className="p-0 gap-0">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.nomor || '-'}</p>
                          <p className="text-xs text-muted-foreground">{item.tanggal ? formatTanggalShort(item.tanggal) : '-'}</p>
                        </div>
                        <Badge variant="outline" className="text-[11px] border-stone-200 text-stone-600 shrink-0">{docTypeLabel(item.docType)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{item.pihakKedua || '-'}</p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-h-[40px]"
                          disabled={sampahActionId === item.id}
                          onClick={() => void handlePulihkan(item)}
                        >
                          {sampahActionId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                          Pulihkan
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-h-[40px] text-destructive border-red-200 hover:bg-red-50 hover:text-destructive"
                          onClick={() => setPurgeTarget(item)}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Konfirmasi hapus permanen */}
              <AlertDialog open={!!purgeTarget} onOpenChange={(o) => { if (!o) setPurgeTarget(null) }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus permanen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {purgeTarget?.nomor} ({purgeTarget ? docTypeLabel(purgeTarget.docType) : ''}) akan dihapus PERMANEN dan tidak dapat dipulihkan lagi.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={(e) => { e.preventDefault(); void handlePurge() }}
                    >
                      Hapus Permanen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )
        )}
      </div>
    </>
  )
}

// ============================================================
// InvoicePage — daftar invoice (tab Riwayat/Pembayaran/Sampah),
// layar "Buat Invoice Baru", dan layar Detail Invoice (pratinjau).
// ============================================================
export default function InvoicePage() {
  const [showCreate, setShowCreate] = useState(false)
  const [createMode, setCreateMode] = useState<'regular' | 'dp' | 'pelunasan'>('regular')
  const [detailId, setDetailId] = useState<string | null>(null)

  // Deep-link dari Beranda: /invoice?detail=<id> → langsung buka Detail Invoice.
  // Dibaca sekali saat mount (client-side) agar tidak butuh Suspense tambahan.
  useEffect(() => {
    try {
      const d = new URLSearchParams(window.location.search).get('detail')
      if (d) setDetailId(d)
    } catch {
      // abaikan — query tidak valid
    }
  }, [])

  // Tutup detail + bersihkan query param agar refresh tidak membuka detail lagi.
  const closeDetail = () => {
    setDetailId(null)
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/invoice')
    }
  }

  return (
    <DashboardLayout title="Invoice" subtitle="Buat invoice dengan pratinjau langsung dan cetak A5">
      {detailId ? (
        <DetailInvoiceView id={detailId} onBack={closeDetail} />
      ) : showCreate ? (
        <div className="print:hidden">
          {/* Header: kembali + judul halaman */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              onClick={() => setShowCreate(false)}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali
            </Button>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">Buat Invoice Baru</h2>
          </div>
          {/* Sub-tab jenis invoice: Regular / DP / Pelunasan.
              TANPA wrapper lebar/padding tambahan → margin kiri/kanan tab =
              margin <main> (p-4 mobile / lg:p-8 desktop), SAMA dengan halaman
              lain dan SEJAJAR dengan kotak editor (matchPageMargins). */}
          <div className="mb-3 flex items-center gap-2 overflow-x-auto print:hidden">
              {([
                { key: 'regular' as const, label: 'Regular', icon: <FileText className="w-3.5 h-3.5" /> },
                { key: 'dp' as const, label: 'DP', icon: <Banknote className="w-3.5 h-3.5" /> },
                { key: 'pelunasan' as const, label: 'Pelunasan', icon: <Wallet className="w-3.5 h-3.5" /> },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => setCreateMode(m.key)}
                  className={cn(
                    'px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap flex-shrink-0',
                    createMode === m.key
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">{m.icon}{m.label}</span>
                </button>
              ))}
          </div>
          <Suspense fallback={null}>
            {createMode === 'pelunasan' ? (
              <InvoicePelunasanEditor />
            ) : (
              <InvoiceEditor
                dpDisabled={createMode === 'regular'}
                onSaved={(id) => {
                  setShowCreate(false)
                  setDetailId(id)
                }}
              />
            )}
          </Suspense>
        </div>
      ) : (
        <div className="print:hidden">
          <InvoiceRiwayatView
            onOpenDetail={(id) => setDetailId(id)}
            onCreate={() => setShowCreate(true)}
          />
        </div>
      )}
    </DashboardLayout>
  )
}
