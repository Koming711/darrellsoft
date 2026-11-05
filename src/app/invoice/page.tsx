'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, Fragment, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InvoiceEditor } from '@/components/dokupro/invoice-editor'
import { InvoicePelunasanEditor } from '@/components/dokupro/invoice-pelunasan-editor'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { fetcher } from '@/lib/fetcher'
import { formatRupiah, formatTanggalShort } from '@/lib/format'
import { hasProfitAccess } from '@/lib/permissions'
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
  Layers,
  Plus,
  ArrowLeft,
  X,
  Printer,
  ImageIcon,
  Truck,
  Ban,
  ArchiveRestore,
  ChevronRight,
  FileSpreadsheet,
  ReceiptText,
  Maximize2,
  Undo2,
  TrendingUp,
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
import { captureDocumentPaperJpg, resolveDocumentPreviewEl } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { syncLinkedPelunasan } from '@/lib/sync-pelunasan'
import { compressImageToJpegDataUrl, PAYMENT_PROOF_MAX_BYTES } from '@/lib/image-compress'
import { useDokuproStore } from '@/lib/store'
import type { InvoiceData, CompanyInfo, CaraPembayaran } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'
import {
  RiwayatFilterCard,
  RiwayatPeriodFilter,
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
    // DP nominal eksplisit (dpAmount, diisi lewat input Rp) lebih diutamakan
    // daripada turunan persen — agar sisa/piutang selalu exact.
    const storedDpAmount = Number(parsed.dpAmount ?? 0)
    const dpAmount = storedDpAmount > 0 ? storedDpAmount : originalTotal * (dpPercent / 100)
    const sisa = totalHarga - dpAmount
    const lunas = parsed.lunas === true
    const batal = parsed.batal === true
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const tanggalPelunasan = parsed.tanggalPelunasan || ''
    const referensi = parsed.referensi || ''
    const referensiInvoiceNomor = parsed.referensiInvoiceNomor || ''
    const isPelunasan = entry.docType === 'invoice-pelunasan'
    const uangCapek = parsed.uangCapek || 0
    // Profit: Total (termasuk PPN) − HPP (snapshot modal per item); fallback
    // uangCapek (profit dari referensi hitung cetakan) untuk invoice lama tanpa
    // snapshot modal. Selaras rumus Laba Kotor di beranda & laporan rugi-laba.
    // Pelunasan & invoice batal tidak dihitung (profit sudah dihitung di invoice induk).
    const typedItems = items as { qty?: number; modal?: number }[]
    const adaModal = typedItems.some((it) => it.modal != null && it.modal > 0)
    const hpp = typedItems.reduce(
      (sum: number, it) => sum + (it.modal != null && it.modal > 0 ? (it.qty ?? 0) * (it.modal ?? 0) : 0),
      0
    )
    const profit = isPelunasan || batal ? 0 : adaModal ? Math.max(0, totalHarga - hpp) : uangCapek
    return { namaBarang, hargaSatuan, totalQty, totalHarga, dpPercent, dp: dpAmount, sisa, lunas, batal, tanggalJatuhTempo, tanggalPelunasan, referensi, referensiInvoiceNomor, isPelunasan, originalTotal, uangCapek, itemCount, profit }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, dpPercent: 0, dp: 0, sisa: 0, lunas: false, batal: false, tanggalJatuhTempo: '', tanggalPelunasan: '', referensi: '', referensiInvoiceNomor: '', isPelunasan: false, originalTotal: 0, uangCapek: 0, itemCount: 0, profit: 0 }
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
      tanggalPembayaran: parsed.tanggalPembayaran || '',
      buktiPembayaran: parsed.buktiPembayaran || '',
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
      tanggalPembayaran: '',
      buktiPembayaran: '',
      lunas: false,
      tanggalPelunasan: '',
      referensiInvoiceId: '',
      referensiInvoiceNomor: '',
      uangCapek: 0,
    }
  }
}

// Tanggal hari ini dalam zona waktu lokal, format 'YYYY-MM-DD' (value input date)
function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

// --- Badge tipe dokumen pembayaran: DP = violet, PEL = emerald ---
function TypeBadge({ type }: { type: string }) {
  const isDp = type === 'DP'
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 shrink-0 ${
        isDp
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      {type}
    </Badge>
  )
}

// --- Empty state tab Riwayat Pembayaran ---
function DpEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Layers className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada invoice DP</p>
      <p className="text-xs text-muted-foreground mt-1">
        Buat invoice dengan tab "DP" untuk mencatat uang muka pesanan.
      </p>
    </div>
  )
}

function SettlementEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Banknote className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada transaksi pelunasan</p>
      <p className="text-xs text-muted-foreground mt-1">
        Pelunasan akan muncul setelah ada pembayaran atas invoice DP.
      </p>
    </div>
  )
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

function DetailInvoiceView({ id, onBack, onCreatePelunasan }: { id: string; onBack: () => void; onCreatePelunasan?: (invoiceId: string) => void }) {
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
  const [batalLunasOpen, setBatalLunasOpen] = useState(false)
  const [batalOpen, setBatalOpen] = useState(false)
  const [hapusOpen, setHapusOpen] = useState(false)

  // Lightbox pratinjau — klik/ketuk gambar preview → tampil besar fit layar.
  // zoomDoc: 'main' = invoice ini, 'pel' = Invoice Pelunasan tertaut (invoice DP).
  const [zoomDoc, setZoomDoc] = useState<'main' | 'pel' | null>(null)
  const zoomOpen = zoomDoc !== null

  // Lightbox bukti pembayaran (foto diperbesar) — invoice utama & pelunasan
  const [buktiZoom, setBuktiZoom] = useState(false)
  const [pelBuktiZoom, setPelBuktiZoom] = useState(false)

  // ===== PEMBAYARAN (cara pembayaran + bukti) — disimpan di dataJson invoice
  const [savingPayment, setSavingPayment] = useState(false)
  const buktiFileRef = useRef<HTMLInputElement>(null)

  // ===== PEMBAYARAN PELUNASAN (bukti) — disimpan di dataJson invoice PELUNASAN
  // tertaut (hanya utk invoice DP; permintaan owner: upload bukti pelunasan
  // langsung dr halaman detail invoice DP)
  const [savingPelBukti, setSavingPelBukti] = useState(false)
  const pelBuktiFileRef = useRef<HTMLInputElement>(null)

  // Invoice PELUNASAN tertaut (untuk invoice DP) — pratinjau-nya tampil DI
  // SAMPING pratinjau invoice di halaman detail (permintaan owner).
  const [pelEntry, setPelEntry] = useState<HistoryEntry | null>(null)

  // Pratinjau scaler — container grid yang membungkus SEMUA pratinjau
  // (invoice utama + pratinjau pelunasan saat invoice DP)
  const previewGridRef = useRef<HTMLDivElement>(null)
  const zoomStageRef = useRef<HTMLDivElement>(null)
  const zoomScalerRef = useRef<HTMLDivElement>(null)

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
  // Invoice DP = invoice biasa (bukan pelunasan) yang punya DP (persen/nominal).
  // Di halaman detail invoice DP: TANPA tombol "Tandai Lunas" (dihapus —
  // permintaan owner); pelunasan sisa piutang hanya lewat "Buat Invoice Pelunasan".
  const isDpInvoice = !info?.isPelunasan && ((info?.dpPercent || 0) > 0 || (info?.dp || 0) > 0)

  // Invoice PELUNASAN tertaut: docType invoice-pelunasan yang referensiInvoiceId
  // -nya = invoice ini (atau nomornya sama). Pratinjau-nya tampil DI SAMPING
  // pratinjau invoice pada halaman detail invoice DP (permintaan owner).
  useEffect(() => {
    if (!entry || !isDpInvoice) { setPelEntry(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/history?docType=invoice-pelunasan', { headers: getAuthHeaders(), cache: 'no-store' })
        const json = res.ok ? await res.json() : { data: [] }
        let nomor = entry.nomor
        try { nomor = String(JSON.parse(entry.dataJson)?.nomor || '') || entry.nomor } catch { /* pakai entry.nomor */ }
        const linked = ((json.data || []) as HistoryEntry[]).find((e) => {
          try {
            const p = JSON.parse(e.dataJson)
            return String(p.referensiInvoiceId || '') === String(entry.id) || (!!nomor && p.referensiInvoiceNomor === nomor)
          } catch { return false }
        })
        if (!cancelled) setPelEntry(linked || null)
      } catch {
        if (!cancelled) setPelEntry(null)
      }
    })()
    return () => { cancelled = true }
  }, [entry, isDpInvoice])

  const pelData = useMemo(() => (pelEntry ? parseInvoiceData(pelEntry) : null), [pelEntry])
  // Data yang tampil di lightbox: invoice ini atau pelunasan tertaut
  const zoomData = zoomDoc === 'pel' && pelData ? pelData : data
  // Bukti pembayaran (data URL foto) — diisi lewat kartu Pembayaran di halaman detail
  const buktiPembayaran = data?.buktiPembayaran || ''
  // Bukti pembayaran INVOICE PELUNASAN tertaut — diisi lewat baris
  // "Bukti Pembayaran Pelunasan" di kartu Pembayaran halaman detail invoice DP
  const pelBuktiPembayaran = pelData?.buktiPembayaran || ''

  // Scale pratinjau A5 agar pas dengan container-nya masing-masing (desktop
  // ~+20% dari ukuran asli 148mm, mobile full-width). Mencakup SEMUA pratinjau
  // di grid (invoice utama + pratinjau pelunasan untuk invoice DP).
  // offsetWidth/Height tidak terpengaruh transform.
  useLayoutEffect(() => {
    if (!data) return
    const fit = () => {
      const container = previewGridRef.current
      if (!container) return
      const wrappers = container.querySelectorAll<HTMLElement>('[data-preview-scaler]')
      wrappers.forEach((wrapper) => {
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
      })
    }
    fit()
    const raf = requestAnimationFrame(fit)
    const timer = setTimeout(fit, 250)
    window.addEventListener('resize', fit)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', fit) }
  }, [data, pelData])

  // Lightbox pratinjau: skala terbesar yang membuat SELURUH halaman A5 muat
  // di viewport (fit lebar & tinggi) — di HP umumnya memenuhi lebar layar,
  // dokumen panjang ikut menyusut agar tetap terlihat penuh.
  useLayoutEffect(() => {
    if (!zoomOpen || !zoomData) return
    const fit = () => {
      const stage = zoomStageRef.current
      const wrap = zoomScalerRef.current
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
  }, [zoomDoc, zoomData])

  const handleJpg = async () => {
    if (!data) return
    setJpgGenerating(true)
    try {
      // Hi-res 300 DPI dari elemen .a5-page (layout tetap 148mm di SEMUA
      // perangkat — bukan wrapper scaler yang lebar/skala-nya mengikuti layar),
      // dikomposisi ke kanvas A5 portrait 300 DPI (1748 × 2480 px).
      // marginPct: 0 — capture .a5-page SUDAH mengandung margin pratinjau
      // (padding 8mm atas/bawah, 10mm kiri/kanan), jadi TIDAK ada margin
      // tambahan: hasil JPG = pratinjau di layar, identik mobile & desktop.
      const previewEl = resolveDocumentPreviewEl()
      if (!previewEl) { toast.error('Pratinjau tidak ditemukan'); return }
      const blob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 })
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

  // Cetak: hasil cetak = gambar JPG hi-res 300 DPI yang sama dengan hasil JPG
  // (identik mobile & desktop) — bukan lagi jalur @media print yang hasilnya
  // tergantung browser/viewport perangkat.
  const handlePrint = async () => {
    if (!data) return
    setIsPrinting(true)
    try {
      const previewEl = resolveDocumentPreviewEl()
      if (!previewEl) { toast.error('Pratinjau tidak ditemukan'); return }
      const blob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 })
      const label = (data.nomor || 'invoice').replace(/\//g, '-')
      // @page margin: 0 — gambar (yang sudah mengandung margin pratinjau 8mm/10mm)
      // memenuhi halaman A5 penuh, sehingga margin hasil cetak = margin pratinjau
      // PERSIS (8mm atas/bawah, 10mm kiri/kanan), tanpa margin halaman tambahan.
      const ok = await printBlobHiRes(blob, { title: `Invoice ${label}`, page: '148mm 210mm', margin: '0' })
      if (!ok) toast.error('Popup diblokir. Izinkan popup untuk mencetak.')
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
        // Pertahankan nominal DP eksplisit (input Rp) — jangan ditimpa turunan persen
        const storedDp = Number(parsed.dpAmount ?? 0)
        if (!(storedDp > 0)) parsed.dpAmount = parsed.originalTotal * (parsed.dp / 100)
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

  // Batal Lunas — batalkan status lunas invoice (kembalikan ke belum lunas).
  // Dokumen tertaut (Invoice DP ⇄ Invoice Pelunasan) ikut disinkronkan agar
  // status konsisten — pola sama dengan sinkronisasi di Editor Invoice Pelunasan.
  const handleBatalLunas = async () => {
    if (!entry || !data) return
    setUpdating(true)
    try {
      const parsed = JSON.parse(entry.dataJson)
      parsed.lunas = false
      parsed.tanggalPelunasan = ''
      const res = await fetcher(`/api/history/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: JSON.stringify(parsed) }),
      })
      if (res.ok) {
        const isPel = parsed.type === 'invoice-pelunasan' || info?.isPelunasan
        const hasDp = (parsed.dp || 0) > 0
        if (!isPel && hasDp) {
          // Invoice DP → cari Invoice Pelunasan tertaut & batalkan lunas-nya juga
          try {
            const pelRes = await fetch('/api/history?docType=invoice-pelunasan', { headers: getAuthHeaders() })
            const pelJson = pelRes.ok ? await pelRes.json() : { data: [] }
            const linked = ((pelJson.data || []) as Array<{ id: string; dataJson: string }>).find((e) => {
              try {
                const p = JSON.parse(e.dataJson)
                return String(p.referensiInvoiceId) === String(entry.id) || p.referensiInvoiceNomor === (parsed.nomor || entry.nomor)
              } catch { return false }
            })
            if (linked) {
              const lp = JSON.parse(linked.dataJson)
              lp.lunas = false
              lp.tanggalPelunasan = ''
              await fetch(`/api/history/${linked.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ dataJson: JSON.stringify(lp) }),
              })
            }
          } catch { /* sinkron non-kritikal */ }
        } else if (isPel && parsed.referensiInvoiceId) {
          // Invoice Pelunasan → batalkan lunas juga di invoice DP pemiliknya
          try {
            const invRes = await fetch(`/api/history/${parsed.referensiInvoiceId}`, { headers: getAuthHeaders() })
            if (invRes.ok) {
              const invJson = await invRes.json()
              const invEntry = invJson.data
              if (invEntry?.dataJson) {
                const ip = JSON.parse(invEntry.dataJson)
                ip.lunas = false
                ip.tanggalPelunasan = ''
                await fetch(`/api/history/${invEntry.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ dataJson: JSON.stringify(ip) }),
                })
              }
            }
          } catch { /* sinkron non-kritikal */ }
        }
        toast.success('Status lunas invoice dibatalkan')
        setBatalLunasOpen(false)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('invoice')
        loadEntry()
      } else {
        toast.error('Gagal membatalkan status lunas')
      }
    } catch {
      toast.error('Gagal membatalkan status lunas')
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

  // ===== PEMBAYARAN: cara pembayaran & bukti — disimpan di dataJson invoice
  // (pola sama dengan Tandai Lunas/Batal: PUT /api/history/[id]).
  const putPaymentData = useCallback(async (mutate: (p: Record<string, unknown>) => void, successMsg: string) => {
    if (!entry) return
    setSavingPayment(true)
    try {
      const parsed = JSON.parse(entry.dataJson)
      mutate(parsed)
      const res = await fetcher(`/api/history/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: JSON.stringify(parsed) }),
      })
      if (res.ok) {
        toast.success(successMsg)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('invoice')
        loadEntry()
      } else {
        toast.error('Gagal menyimpan data pembayaran')
      }
    } catch {
      toast.error('Gagal menyimpan data pembayaran')
    } finally {
      setSavingPayment(false)
    }
  }, [entry, loadEntry])

  // Klik cara pembayaran: pilih; klik yang aktif lagi untuk menghapus.
  // Cara bayar ikut tampil di dokumen invoice (baris "Cara Bayar:").
  const handleSetCara = (v: CaraPembayaran) => {
    const current = (data?.caraPembayaran || '') as CaraPembayaran | ''
    if (current === v) {
      putPaymentData((p) => { p.caraPembayaran = '' }, 'Cara pembayaran dihapus')
    } else {
      putPaymentData((p) => { p.caraPembayaran = v }, `Cara pembayaran: ${v === 'giro' ? 'Giro' : v === 'transfer' ? 'Transfer' : 'Cash'}`)
    }
  }

  // Tanggal pembayaran — disimpan sebagai 'YYYY-MM-DD' (format value input
  // date) dan ikut tercetak di dokumen invoice ("Tgl Bayar:"). Kosongkan = hapus.
  const handleSetTanggalBayar = (v: string) => {
    if (!v) {
      putPaymentData((p) => { delete p.tanggalPembayaran }, 'Tanggal pembayaran dihapus')
    } else {
      putPaymentData((p) => { p.tanggalPembayaran = v }, 'Tanggal pembayaran disimpan')
    }
  }

  // Upload bukti pembayaran — gambar otomatis dikompres ≤350KB (pola sama
  // dengan bukti pembayaran langganan) sebelum disimpan sebagai data URL.
  const handleBuktiFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImageToJpegDataUrl(file, PAYMENT_PROOF_MAX_BYTES)
      await putPaymentData((p) => { p.buktiPembayaran = dataUrl }, 'Bukti pembayaran tersimpan')
    } catch {
      toast.error('Gagal memproses gambar. Gunakan file JPG/PNG.')
    }
  }

  const handleHapusBukti = () => putPaymentData((p) => { delete p.buktiPembayaran }, 'Bukti pembayaran dihapus')

  // ===== PELUNASAN: simpan/hapus bukti pembayaran di dataJson invoice
  // PELUNASAN tertaut (PUT /api/history/[id] milik pelEntry; pola sama dgn
  // putPaymentData — target & pesan toast-nya saja yang berbeda).
  const putPelPaymentData = useCallback(async (mutate: (p: Record<string, unknown>) => void, successMsg: string) => {
    if (!pelEntry) return
    setSavingPelBukti(true)
    try {
      const parsed = JSON.parse(pelEntry.dataJson) as Record<string, unknown>
      mutate(parsed)
      const res = await fetcher(`/api/history/${pelEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: JSON.stringify(parsed) }),
      })
      if (res.ok) {
        toast.success(successMsg)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('invoice')
        // Refresh state lokal — pratinjau pelunasan & baris bukti langsung update
        setPelEntry((prev) => (prev ? { ...prev, dataJson: JSON.stringify(parsed) } : prev))
      } else {
        toast.error('Gagal menyimpan bukti pembayaran pelunasan')
      }
    } catch {
      toast.error('Gagal menyimpan bukti pembayaran pelunasan')
    } finally {
      setSavingPelBukti(false)
    }
  }, [pelEntry])

  // Upload bukti pembayaran PELUNASAN — kompresi ≤350KB, pola sama dgn bukti DP
  const handlePelBuktiFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImageToJpegDataUrl(file, PAYMENT_PROOF_MAX_BYTES)
      await putPelPaymentData((p) => { p.buktiPembayaran = dataUrl }, 'Bukti pembayaran pelunasan tersimpan')
    } catch {
      toast.error('Gagal memproses gambar. Gunakan file JPG/PNG.')
    }
  }

  const handleHapusPelBukti = () => putPelPaymentData((p) => { delete p.buktiPembayaran }, 'Bukti pembayaran pelunasan dihapus')

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
    <div data-detail-invoice="">
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
            {/* Tombol aksi pembayaran — "Buat Invoice Pelunasan" adalah CTA utama
                untuk invoice DP (sisa = piutang, dilunasi lewat invoice PEL).
                Tombol "Tandai Lunas" DIHAPUS di halaman detail invoice DP
                (permintaan owner) — tetap tersedia untuk invoice non-DP. */}
            {status !== 'lunas' && status !== 'batal' && (
              <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {isDpInvoice
                    ? `Sisa pembayaran ${formatRupiah(info.sisa)} (piutang) belum diterima.`
                    : 'Pembayaran invoice ini belum diterima penuh.'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {isDpInvoice && onCreatePelunasan && (
                    <Button size="sm" onClick={() => onCreatePelunasan(entry.id)} title="Buat invoice pelunasan untuk sisa pembayaran ini" className="bg-violet-600 hover:bg-violet-700 min-h-[36px]">
                      <Wallet className="mr-1.5 h-3.5 w-3.5" /> Buat Invoice Pelunasan
                    </Button>
                  )}
                  {!isDpInvoice && (
                    <Button size="sm" variant="outline" onClick={() => setLunasOpen(true)} className="border-violet-200 text-violet-700 hover:bg-violet-50 min-h-[36px]">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Tandai Lunas
                    </Button>
                  )}
                </div>
              </div>
            )}
            {status === 'lunas' && (
              <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Invoice ini sudah dibayar penuh{info.tanggalPelunasan ? ` pada ${formatTanggalShort(info.tanggalPelunasan)}` : ''}.
                </p>
                <Button size="sm" variant="outline" onClick={() => setBatalLunasOpen(true)} disabled={updating} className="border-amber-200 text-amber-700 hover:bg-amber-50 min-h-[36px]">
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Batal Lunas
                </Button>
              </div>
            )}
          </div>

          {/* PEMBAYARAN — cara pembayaran + bukti pembayaran (permintaan owner).
              Cara bayar ikut tampil di dokumen invoice ("Cara Bayar:"); bukti
              (foto) tersimpan di invoice ini. Disembunyikan untuk invoice batal.
              Tata letak 2 KOLOM (permintaan owner): kolom kiri Cara Pembayaran,
              kolom kanan Tanggal Pembayaran (garis pemisah vertikal di desktop);
              Bukti Pembayaran full-width di bawahnya. Di mobile menumpuk 1 kolom. */}
          {status !== 'batal' && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 mb-4 print:hidden">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pembayaran</h3>
              <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-6">
                {/* Kolom 1 — Cara pembayaran — Cash / Transfer / Giro */}
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Cara Pembayaran</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                      { v: 'cash' as const, label: 'Cash' },
                      { v: 'transfer' as const, label: 'Transfer' },
                      { v: 'giro' as const, label: 'Giro' },
                    ]).map(({ v, label }) => (
                      <button
                        key={v}
                        type="button"
                        disabled={savingPayment}
                        onClick={() => handleSetCara(v)}
                        title={data.caraPembayaran === v ? 'Klik lagi untuk menghapus' : `Tandai dibayar via ${label}`}
                        className={cn(
                          'px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors min-h-[32px] disabled:opacity-60',
                          data.caraPembayaran === v
                            ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                            : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                    {savingPayment && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Cara bayar ikut tercetak di dokumen invoice (baris &quot;Cara Bayar:&quot;). Klik yang aktif lagi untuk menghapus.
                  </p>
                </div>

                {/* Kolom 2 — Tanggal pembayaran — ikut tercetak "Tgl Bayar:" di dokumen invoice */}
                <div className="sm:border-l sm:border-stone-100 sm:pl-6">
                  <p className="text-xs font-medium text-foreground mb-2">Tanggal Pembayaran</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="date"
                      value={data.tanggalPembayaran || ''}
                      disabled={savingPayment}
                      onChange={(e) => handleSetTanggalBayar(e.target.value)}
                      className="h-8 w-[150px] bg-white text-xs"
                      aria-label="Tanggal pembayaran"
                    />
                    {data.tanggalPembayaran && (
                      <span className="text-[11px] font-medium text-violet-700">{formatTanggalShort(data.tanggalPembayaran)}</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={savingPayment}
                      onClick={() => handleSetTanggalBayar(todayLocalIso())}
                      className="h-8 min-h-[32px] px-2.5 text-xs text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                      title="Isi dengan tanggal hari ini"
                    >
                      Hari ini
                    </Button>
                    {savingPayment && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Tanggal pembayaran ikut tercetak di dokumen invoice (&quot;Tgl Bayar:&quot;). Kosongkan untuk menghapus.
                  </p>
                </div>

                {/* Full width — Bukti pembayaran — upload foto, tersimpan di invoice ini */}
                <div className="sm:col-span-2 border-t border-stone-100 pt-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="text-xs font-medium text-foreground shrink-0">Bukti Pembayaran</p>
                    {buktiPembayaran ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setBuktiZoom(true)}
                          className="group relative rounded-lg overflow-hidden border border-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                          aria-label="Perbesar bukti pembayaran"
                          title="Klik untuk memperbesar"
                        >
                          <img src={buktiPembayaran} alt="Bukti pembayaran" className="h-16 w-16 object-cover" />
                          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        </button>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => buktiFileRef.current?.click()} disabled={savingPayment} className="min-h-[32px]">
                            {savingPayment ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />} Ganti
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleHapusBukti} disabled={savingPayment} className="border-red-200 text-destructive hover:bg-red-50 hover:text-destructive min-h-[32px]">
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => buktiFileRef.current?.click()} disabled={savingPayment} className="min-h-[32px]">
                        {savingPayment ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                        Upload Bukti Pembayaran
                      </Button>
                    )}
                    <input ref={buktiFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleBuktiFile(e) }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Foto bukti transfer / cash (JPG/PNG) — otomatis dikompres, tersimpan di invoice ini.
                  </p>
                </div>

                {/* Full width — Bukti pembayaran PELUNASAN — hanya utk invoice DP
                    yang sudah punya Invoice Pelunasan tertaut (permintaan owner:
                    upload bukti pelunasan langsung dr detail invoice DP). Bukti
                    tersimpan di dataJson invoice PELUNASAN-nya. */}
                {isDpInvoice && pelEntry && (
                  <div className="sm:col-span-2 border-t border-stone-100 pt-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="text-xs font-medium text-foreground shrink-0">Bukti Pembayaran Pelunasan</p>
                      {pelData?.nomor && (
                        <span className="text-[11px] text-muted-foreground truncate">{pelData.nomor}</span>
                      )}
                      {pelBuktiPembayaran ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setPelBuktiZoom(true)}
                            className="group relative rounded-lg overflow-hidden border border-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                            aria-label="Perbesar bukti pembayaran pelunasan"
                            title="Klik untuk memperbesar"
                          >
                            <img src={pelBuktiPembayaran} alt="Bukti pembayaran pelunasan" className="h-16 w-16 object-cover" />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                          </button>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => pelBuktiFileRef.current?.click()} disabled={savingPelBukti} className="min-h-[32px]">
                              {savingPelBukti ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />} Ganti
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleHapusPelBukti} disabled={savingPelBukti} className="border-red-200 text-destructive hover:bg-red-50 hover:text-destructive min-h-[32px]">
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => pelBuktiFileRef.current?.click()} disabled={savingPelBukti} className="min-h-[32px]">
                          {savingPelBukti ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                          Upload Bukti Pembayaran Pelunasan
                        </Button>
                      )}
                      <input ref={pelBuktiFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handlePelBuktiFile(e) }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Foto bukti pembayaran sisa (JPG/PNG) — otomatis dikompres, tersimpan di invoice pelunasan ini.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tombol aksi — DI ATAS pratinjau */}
          <div className="mb-4">{actionButtons}</div>

          {/* Pratinjau A5 — outline, fit container. Invoice DP: pratinjau
              Invoice Pelunasan tertaut tampil DI SAMPINGNYA (grid 2 kolom di
              desktop, menumpuk di mobile) — permintaan owner.
              Klik/ketuk pratinjau → lightbox: gambar langsung besar fit layar. */}
          <div
            ref={previewGridRef}
            id="document-preview"
            className={cn('print:hidden', isDpInvoice ? 'grid grid-cols-1 gap-5 items-start lg:grid-cols-2' : 'flex justify-center')}
          >
            {/* Invoice utama */}
            <div className={cn('w-full', !isDpInvoice && 'max-w-[670px]')}>
              {isDpInvoice && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-semibold text-foreground">Invoice DP</span>
                  <span className="text-xs text-muted-foreground truncate">{data.nomor}</span>
                </div>
              )}
              <div
                data-preview-scaler
                data-document-preview
                role="button"
                tabIndex={0}
                aria-label="Perbesar pratinjau invoice"
                title="Klik / ketuk untuk memperbesar"
                onClick={() => setZoomDoc('main')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomDoc('main') } }}
                className="a5-preview-container relative bg-white overflow-hidden cursor-zoom-in transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                style={{ border: '2px solid #cbd5e1', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}
              >
                <InvoicePreview data={data} showPelunasanLabel={data.type === 'invoice-pelunasan'} />
                {/* Indikator tap-to-zoom (di luar .a5-page — tidak ikut ter-capture JPG) */}
                <span className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-stone-900/60 px-2 py-1 text-[10px] font-medium text-white shadow-md">
                  <Maximize2 className="h-3 w-3" /> Perbesar
                </span>
              </div>
            </div>

            {/* Invoice Pelunasan tertaut — hanya untuk invoice DP. Pratinjau
                tampil DI SAMPING pratinjau invoice (desktop); bila pelunasan
                belum dibuat, tampil kotak placeholder dgn tombol buat. */}
            {isDpInvoice && (
              <div className="w-full print:hidden">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-semibold text-foreground">Invoice Pelunasan</span>
                  {pelData?.nomor ? (
                    <span className="text-xs text-muted-foreground truncate">{pelData.nomor}</span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 text-slate-500">Belum dibuat</Badge>
                  )}
                </div>
                {pelData ? (
                  <div
                    data-preview-scaler
                    role="button"
                    tabIndex={0}
                    aria-label="Perbesar pratinjau invoice pelunasan"
                    title="Klik / ketuk untuk memperbesar"
                    onClick={() => setZoomDoc('pel')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomDoc('pel') } }}
                    className="a5-preview-container relative bg-white overflow-hidden cursor-zoom-in transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                    style={{ border: '2px solid #cbd5e1', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}
                  >
                    <InvoicePreview data={pelData} showPelunasanLabel />
                    <span className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-stone-900/60 px-2 py-1 text-[10px] font-medium text-white shadow-md">
                      <Maximize2 className="h-3 w-3" /> Perbesar
                    </span>
                  </div>
                ) : (
                  <div className="w-full aspect-[148/210] rounded-[10px] border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center p-6 gap-2">
                    <Wallet className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">Belum ada Invoice Pelunasan</p>
                    <p className="text-xs text-muted-foreground max-w-[240px]">
                      Sisa pembayaran {formatRupiah(info.sisa)} belum dibuatkan invoice pelunasan.
                    </p>
                    {onCreatePelunasan && status !== 'batal' && (
                      <Button size="sm" onClick={() => onCreatePelunasan(entry.id)} title="Buat invoice pelunasan untuk sisa pembayaran ini" className="bg-violet-600 hover:bg-violet-700 mt-1">
                        <Wallet className="mr-1.5 h-3.5 w-3.5" /> Buat Invoice Pelunasan
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lightbox pratinjau — gambar preview langsung besar, fit layar
              (fit lebar & tinggi; di HP memenuhi layar). Tutup: ✕ / Esc /
              klik luar. Elemen ini portal → tidak mengganggu resolve
              DocumentPreviewEl (capture JPG/Cetak tetap target #document-preview). */}
          <Dialog open={zoomOpen} onOpenChange={(o) => { if (!o) setZoomDoc(null) }}>
            <DialogContent
              showCloseButton={false}
              aria-label="Pratinjau invoice diperbesar"
              aria-describedby={undefined}
              className="h-screen max-h-none w-full max-w-none sm:max-w-none rounded-none border-0 bg-stone-950/95 p-0 overflow-hidden gap-0"
              style={{ height: '100dvh' }}
            >
              <button
                type="button"
                onClick={() => setZoomDoc(null)}
                aria-label="Tutup pratinjau"
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="absolute inset-0 p-3 sm:p-6">
                <div ref={zoomStageRef} className="flex h-full w-full items-center justify-center">
                  <div
                    ref={zoomScalerRef}
                    className="overflow-hidden rounded-lg bg-white shadow-2xl"
                    style={{ border: '1px solid #e7e5e4' }}
                  >
                    {zoomData && (
                      <InvoicePreview data={zoomData} showPelunasanLabel={zoomData.type === 'invoice-pelunasan'} />
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Lightbox bukti pembayaran — foto bukti tampil besar fit layar.
              Latar BELAKANG TETAP TERLIHAT (overlay semi-transparan tanpa
              panel gelap pekal) — halaman detail invoice tetap tampak di
              belakang popup (permintaan owner). */}
          <Dialog open={buktiZoom} onOpenChange={setBuktiZoom}>
            <DialogContent
              showCloseButton={false}
              aria-label="Bukti pembayaran diperbesar"
              aria-describedby={undefined}
              overlayClassName="bg-stone-950/40"
              className="h-screen max-h-none w-full max-w-none sm:max-w-none rounded-none border-0 bg-transparent p-0 overflow-hidden gap-0 shadow-none"
              style={{ height: '100dvh' }}
            >
              <button
                type="button"
                onClick={() => setBuktiZoom(false)}
                aria-label="Tutup bukti pembayaran"
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/55 text-white shadow-lg transition-colors hover:bg-black/80"
              >
                <X className="h-5 w-5" />
              </button>
              {/* Klik area latar (bukan gambar) juga menutup popup —
                  panel content full-screen sehingga klik "luar" Radix
                  tidak pernah terpicu; tangani manual di backdrop. */}
              <div
                className="absolute inset-0 flex items-center justify-center p-4 sm:p-8"
                onClick={(e) => { if (e.target === e.currentTarget) setBuktiZoom(false) }}
              >
                <img src={buktiPembayaran} alt="Bukti pembayaran" className="max-h-full max-w-full object-contain rounded-lg bg-white shadow-2xl ring-1 ring-black/10" onClick={(e) => e.stopPropagation()} />
              </div>
            </DialogContent>
          </Dialog>

          {/* Lightbox bukti pembayaran PELUNASAN — pola sama dgn lightbox bukti
              utama: overlay semi-transparan, halaman detail tetap terlihat di
              belakang popup; tutup via ✕ / Esc / klik area latar. */}
          <Dialog open={pelBuktiZoom} onOpenChange={setPelBuktiZoom}>
            <DialogContent
              showCloseButton={false}
              aria-label="Bukti pembayaran pelunasan diperbesar"
              aria-describedby={undefined}
              overlayClassName="bg-stone-950/40"
              className="h-screen max-h-none w-full max-w-none sm:max-w-none rounded-none border-0 bg-transparent p-0 overflow-hidden gap-0 shadow-none"
              style={{ height: '100dvh' }}
            >
              <button
                type="button"
                onClick={() => setPelBuktiZoom(false)}
                aria-label="Tutup bukti pembayaran pelunasan"
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/55 text-white shadow-lg transition-colors hover:bg-black/80"
              >
                <X className="h-5 w-5" />
              </button>
              <div
                className="absolute inset-0 flex items-center justify-center p-4 sm:p-8"
                onClick={(e) => { if (e.target === e.currentTarget) setPelBuktiZoom(false) }}
              >
                <img src={pelBuktiPembayaran} alt="Bukti pembayaran pelunasan" className="max-h-full max-w-full object-contain rounded-lg bg-white shadow-2xl ring-1 ring-black/10" onClick={(e) => e.stopPropagation()} />
              </div>
            </DialogContent>
          </Dialog>

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

          {/* Konfirmasi Batal Lunas */}
          <AlertDialog open={batalLunasOpen} onOpenChange={setBatalLunasOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan status lunas invoice ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Invoice {entry.nomor} akan dikembalikan menjadi &quot;Belum Lunas&quot; — tanggal pelunasan dihapus dan invoice dapat ditandai lunas kembali setelah pembayaran diterima.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updating}>Tidak</AlertDialogCancel>
                <AlertDialogAction className="bg-amber-600 hover:bg-amber-700 text-white" onClick={(e) => { e.preventDefault(); void handleBatalLunas() }}>
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Batal Lunas'}
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

  // Izin grup: anggota tanpa centangan "Profit (Laba Invoice)" tidak melihat profit
  const [bisaLihatProfit, setBisaLihatProfit] = useState(true)
  useEffect(() => { setBisaLihatProfit(hasProfitAccess()) }, [])

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

  // Daftar gabungan (invoice + invoice pelunasan) — terbaru di atas
  const combinedList = useMemo(
    () => [...dpInvoices, ...pelunasanInvoices].sort(
      (a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
    ),
    [dpInvoices, pelunasanInvoices]
  )

  // ===== Tabel BERGRUP: invoice DP + transaksi pelunasannya dalam SATU grup
  // (permintaan owner: riwayat DP dan pelunasan dibuat grup di tabel).
  const groupedRows = useMemo(() => {
    const byParent = new Map<string, HistoryEntry[]>()
    const orphan: HistoryEntry[] = []
    for (const p of pelunasanInvoices) {
      const ref = parseDocInfo(p).referensiInvoiceNomor
      const parent = ref ? dpInvoices.find((i) => i.nomor === ref) : undefined
      if (parent) {
        const arr = byParent.get(parent.id) ?? []
        arr.push(p)
        byParent.set(parent.id, arr)
      } else {
        orphan.push(p)
      }
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
    }
    const urut = [...dpInvoices].sort(
      (a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
    )
    const rows = urut.map((inv) => ({ entry: inv, children: byParent.get(inv.id) ?? [] }))
    const orphans = orphan.sort(
      (a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
    )
    for (const o of orphans) rows.push({ entry: o, children: [] })
    return rows
  }, [dpInvoices, pelunasanInvoices])

  // ===== Kotak total: Total Invoice & Total Profit (gaya beranda) =====
  // Selaras beranda: hanya docType 'invoice' non-batal yang dihitung —
  // pelunasan tidak dihitung dua kali (profit sudah milik invoice induk).
  const riwayatTotals = useMemo(() => {
    let totalInvoice = 0
    let totalProfit = 0
    let jumlahInvoice = 0
    for (const e of dpInvoices) {
      const info = parseDocInfo(e)
      if (info.batal) continue
      jumlahInvoice++
      totalInvoice += info.totalHarga
      totalProfit += info.profit
    }
    return { totalInvoice, totalProfit, jumlahInvoice }
  }, [dpInvoices])

  // Ringkasan daftar terfilter (subjudul header, gaya Riwayat Invoice)
  const listSummary = useMemo(() => {
    return { count: riwayatTotals.jumlahInvoice, total: riwayatTotals.totalInvoice }
  }, [riwayatTotals])

  const filtersActive = statusFilter !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim() || period !== 'all'

  const resetFilters = () => {
    setPeriod('all')
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
    setSearchQuery('')
  }

  // === Data tab Riwayat Pembayaran (gaya payment-history) ===
  // Daftar Invoice DP (dengan sisa tagihan) + Transaksi Pelunasan + Total Piutang.
  // Dihitung dari seluruh riwayat (abaikan filter tab Invoice agar angka selalu konsisten).
  const paymentData = useMemo(() => {
    // 1) Transaksi pelunasan + peta "sudah dibayar" per nomor invoice DP
    const settlementRows: { id: string; nomor: string; tanggal: string; parentNumber: string; paidAmount: number; status: InvoiceStatus }[] = []
    const settledByRef = new Map<string, { lunas: boolean; nominal: number }>()
    for (const entry of allHistory) {
      if (entry.docType !== 'invoice-pelunasan') continue
      try {
        const p = JSON.parse(entry.dataJson) as Record<string, unknown>
        const itemsRaw = Array.isArray(p.items) ? (p.items as { qty?: number; harga?: number }[]) : []
        const subtotal = itemsRaw.reduce((acc, it) => acc + (it.qty || 0) * (it.harga || 0), 0)
        const ppn = Number(p.ppn || 0)
        const docTotal = Number(p.originalTotal || 0) > 0 ? Number(p.originalTotal) : subtotal + subtotal * (ppn / 100)
        const dpAmount = p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
          ? Number(p.dpAmount)
          : docTotal * (Number(p.dp || 0) / 100)
        const ref = String(p.referensiInvoiceNomor || '')
        if (!ref) continue
        const nominal = Math.max(0, docTotal - dpAmount)
        const lunas = p.lunas === true
        settlementRows.push({
          id: entry.id,
          nomor: entry.nomor,
          tanggal: String(p.tanggal || entry.tanggal || '').slice(0, 10),
          parentNumber: ref,
          paidAmount: nominal,
          status: lunas ? 'lunas' : 'belum',
        })
        const prev = settledByRef.get(ref)
        if (!prev || (lunas && !prev.lunas)) {
          settledByRef.set(ref, { lunas, nominal: lunas ? nominal : prev?.nominal ?? 0 })
        }
      } catch { /* skip data rusak */ }
    }
    settlementRows.sort((a, b) => b.tanggal.localeCompare(a.tanggal))

    // 2) Invoice DP — total, DP, sudah dipelunasi, sisa
    const dpRows: { id: string; nomor: string; tanggal: string; customerName: string; total: number; dpAmount: number; settledAmount: number; sisa: number; status: InvoiceStatus }[] = []
    for (const entry of allHistory) {
      if (entry.docType !== 'invoice') continue
      try {
        const p = JSON.parse(entry.dataJson) as Record<string, unknown>
        const itemsRaw = Array.isArray(p.items) ? (p.items as { qty?: number; harga?: number }[]) : []
        const subtotal = itemsRaw.reduce((acc, it) => acc + (it.qty || 0) * (it.harga || 0), 0)
        const ppn = Number(p.ppn || 0)
        const total = subtotal + subtotal * (ppn / 100)
        const dpAmount = p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
          ? Number(p.dpAmount)
          : total * (Number(p.dp || 0) / 100)
        if (dpAmount <= 0) continue // hanya invoice DP
        const lunas = p.lunas === true
        const batal = p.batal === true
        const client = (p.client || {}) as { nama?: string }
        const settled = settledByRef.get(entry.nomor)
        const settledAmount = batal ? 0 : lunas ? total - dpAmount : (settled?.lunas ? settled.nominal : 0)
        const sisa = batal ? 0 : Math.max(0, Math.round(total - dpAmount - settledAmount))
        dpRows.push({
          id: entry.id,
          nomor: entry.nomor,
          tanggal: String(p.tanggal || entry.tanggal || '').slice(0, 10),
          customerName: entry.pihakKedua || client.nama || '-',
          total: Math.round(total),
          dpAmount: Math.round(dpAmount),
          settledAmount: Math.round(settledAmount),
          sisa,
          status: batal ? 'batal' : (lunas || sisa <= 0) ? 'lunas' : 'belum',
        })
      } catch { /* skip data rusak */ }
    }
    dpRows.sort((a, b) => b.tanggal.localeCompare(a.tanggal))

    // Total piutang = Σ sisa invoice DP (non-batal)
    const totalPiutang = dpRows
      .filter((r) => r.status !== 'batal')
      .reduce((acc, r) => acc + r.sisa, 0)
    return { dpRows, settlementRows, totalPiutang }
  }, [allHistory])

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
            {/* ===== Filter: periode (cari per bulan) + pencarian + status ===== */}
            <RiwayatFilterCard>
              <RiwayatPeriodFilter
                period={period}
                onChangePeriod={setPeriod}
                from={dateFrom}
                to={dateTo}
                onFromChange={setDateFrom}
                onToChange={setDateTo}
                month={month}
                onMonthChange={setMonth}
                year={year}
                onYearChange={setYear}
                idPrefix="riwayat-invoice"
                rightSlot={
                  <div className="relative w-full sm:w-56">
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
                }
              />
              <div className="flex flex-wrap gap-2 items-center">
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
                {filtersActive && (
                  <Button variant="ghost" className="text-xs text-muted-foreground h-10" onClick={resetFilters}>
                    <X className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
              </div>
            </RiwayatFilterCard>

            {/* ===== Kotak total: Total Invoice & Total Profit (gaya beranda) ===== */}
            {!loading && hasResults && (
              <div className={cn('grid gap-3 md:gap-4', bisaLihatProfit ? 'grid-cols-2' : 'grid-cols-1')}>
                <Card className="p-0 gap-0 dark:border-zinc-800" data-testid="kotak-total-invoice">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ReceiptText className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-medium">Total Invoice</p>
                    </div>
                    <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">
                      {formatRupiah(riwayatTotals.totalInvoice)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{riwayatTotals.jumlahInvoice} invoice terfilter</p>
                  </CardContent>
                </Card>
                {bisaLihatProfit && (
                <Card className="p-0 gap-0 dark:border-zinc-800" data-testid="kotak-total-profit">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-medium">Total Profit</p>
                    </div>
                    <p className="text-base md:text-2xl font-bold mt-2 text-emerald-700 dark:text-emerald-400">
                      {formatRupiah(riwayatTotals.totalProfit)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">profit dari invoice terfilter</p>
                  </CardContent>
                </Card>
                )}
              </div>
            )}

            {/* Daftar — tabel bergrup (invoice DP + pelunasannya), klik baris → Detail */}
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
                  {filtersActive ? 'Ubah kata kunci, periode, atau filter pencarian.' : 'Buat invoice pertama Anda dengan tombol "+ Buat Invoice".'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table — bergrup: baris invoice DP diikuti baris pelunasannya */}
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                  <div className="max-h-96 overflow-y-auto scrollbar-thin">
                    {/* Tinggi baris presisi 10mm + zebra (baris invoice ganjil abu slate-100,
                        baris pelunasan tetap hijau muda) — konvensi tabel /barang & /harga-customer */}
                    <Table className="[&_td]:py-[2px] [&_tbody_tr:last-child]:border-b [&_tbody_tr:hover]:bg-slate-200/70 dark:[&_tbody_tr:hover]:bg-zinc-700/50">
                      <TableHeader className="sticky top-0 z-10 bg-stone-50">
                        <TableRow className="bg-stone-50 hover:bg-stone-50">
                          <TableHead>Nomor</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Pelanggan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Jumlah Item</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          {bisaLihatProfit && <TableHead className="text-right">Profit</TableHead>}
                          <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedRows.slice(0, 100).map((group, idx) => {
                          const entry = group.entry
                          const info = parseDocInfo(entry)
                          const st = getInvoiceStatus(info)
                          return (
                            <Fragment key={entry.id}>
                              <TableRow
                                tabIndex={0}
                                onClick={() => onOpenDetail(entry.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onOpenDetail(entry.id)
                                  }
                                }}
                                aria-label={`Buka invoice ${entry.nomor || ''}`}
                                className={cn(
                                  'cursor-pointer h-[10mm]',
                                  idx % 2 === 1 && 'bg-slate-100 dark:bg-zinc-800/60'
                                )}
                              >
                                <TableCell className="font-medium whitespace-nowrap">{entry.nomor || '-'}</TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">{entry.tanggal ? formatTanggalShort(entry.tanggal) : '-'}</TableCell>
                                <TableCell className="max-w-48 truncate">{entry.pihakKedua || '-'}</TableCell>
                                <TableCell><StatusBadge status={st} /></TableCell>
                                <TableCell className="text-center tabular-nums">{info.itemCount || '-'}</TableCell>
                                <TableCell className="text-right font-semibold whitespace-nowrap">{formatRupiah(info.totalHarga)}</TableCell>
                                {bisaLihatProfit && (
                                <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums text-emerald-700">
                                  {info.isPelunasan ? '—' : formatRupiah(info.profit)}
                                </TableCell>
                                )}
                                <TableCell>
                                  <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                                </TableCell>
                              </TableRow>
                              {group.children.map((child) => {
                                const cInfo = parseDocInfo(child)
                                const cSt = getInvoiceStatus(cInfo)
                                return (
                                  <TableRow
                                    key={child.id}
                                    tabIndex={0}
                                    onClick={() => onOpenDetail(child.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        onOpenDetail(child.id)
                                      }
                                    }}
                                    aria-label={`Buka pelunasan ${child.nomor || ''}`}
                                    className="cursor-pointer h-[10mm] bg-emerald-50/40 dark:bg-emerald-950/20"
                                  >
                                    <TableCell className="whitespace-nowrap pl-6">
                                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                        {child.nomor || '-'} <TypeBadge type="PEL" />
                                      </span>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{child.tanggal ? formatTanggalShort(child.tanggal) : '-'}</TableCell>
                                    <TableCell className="max-w-48 truncate text-muted-foreground">{child.pihakKedua || '-'}</TableCell>
                                    <TableCell><StatusBadge status={cSt} /></TableCell>
                                    <TableCell className="text-center tabular-nums text-muted-foreground">—</TableCell>
                                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                                      {formatRupiah(cInfo.totalHarga)}
                                    </TableCell>
                                    {bisaLihatProfit && <TableCell className="text-right whitespace-nowrap text-muted-foreground">—</TableCell>}
                                    <TableCell>
                                      <ChevronRight className="h-4 w-4 text-stone-300" aria-hidden="true" />
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </Fragment>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile cards — bergrup: kartu invoice DP + sub-kartu pelunasannya */}
                <div className="md:hidden space-y-3">
                  {groupedRows.slice(0, 100).map((group) => {
                    const entry = group.entry
                    const info = parseDocInfo(entry)
                    const st = getInvoiceStatus(info)
                    return (
                      <div key={entry.id} className="space-y-1.5">
                        <button
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
                            {bisaLihatProfit && (
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-muted-foreground">Profit</span>
                              <span className="font-semibold whitespace-nowrap text-emerald-700">{info.isPelunasan ? '—' : formatRupiah(info.profit)}</span>
                            </div>
                            )}
                          </div>
                        </button>
                        {group.children.map((child) => {
                          const cInfo = parseDocInfo(child)
                          const cSt = getInvoiceStatus(cInfo)
                          return (
                            <button
                              key={child.id}
                              onClick={() => onOpenDetail(child.id)}
                              aria-label={`Buka pelunasan ${child.nomor || ''}`}
                              className="w-full text-left"
                            >
                              <div className="ml-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5 transition-colors active:bg-stone-50 dark:border-emerald-900 dark:bg-emerald-950/20">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-xs font-semibold truncate text-muted-foreground">{child.nomor || '-'}</p>
                                    <TypeBadge type="PEL" />
                                  </div>
                                  <StatusBadge status={cSt} />
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-muted-foreground">
                                    {child.tanggal ? formatTanggalShort(child.tanggal) : '-'}
                                  </span>
                                  <span className="font-semibold whitespace-nowrap text-emerald-700">{formatRupiah(cInfo.totalHarga)}</span>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

                {/* ================= TAB: RIWAYAT PEMBAYARAN ================= */}
        {/* Gaya payment-history: strip Total Piutang + Daftar Invoice DP + Transaksi Pelunasan */}
        {activeTab === 'pembayaran' && (
          loading ? (
            <>
              <Skeleton className="h-20 w-full rounded-xl" />
              <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {/* Strip ringkasan Total Piutang */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 md:p-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Total Piutang</p>
                  <p className="text-xl md:text-2xl font-bold text-amber-700 mt-1">
                    {formatRupiah(paymentData.totalPiutang)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-right shrink-0">
                  {paymentData.dpRows.length} invoice DP · {paymentData.settlementRows.length} pelunasan
                </p>
              </div>

              {/* ===== Bagian 1: Daftar Invoice DP ===== */}
              <section aria-label="Daftar Invoice DP" className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">Daftar Invoice DP</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invoice pesanan dengan uang muka (DP) dan sisa tagihannya.
                  </p>
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                  {paymentData.dpRows.length === 0 ? (
                    <DpEmptyState />
                  ) : (
                    <div className="max-h-96 overflow-auto scrollbar-thin">
                      <Table className="min-w-[760px]">
                        <TableHeader className="sticky top-0 z-10 bg-stone-50">
                          <TableRow className="bg-stone-50 hover:bg-stone-50">
                            <TableHead>Nomor</TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Pelanggan</TableHead>
                            <TableHead className="text-right">Total Pesanan</TableHead>
                            <TableHead className="text-right">Total DP</TableHead>
                            <TableHead className="text-right">Sudah Dipelunasi</TableHead>
                            <TableHead className="text-right">Sisa Tagihan</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentData.dpRows.slice(0, 100).map((inv) => (
                            <TableRow
                              key={inv.id}
                              tabIndex={0}
                              onClick={() => onOpenDetail(inv.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onOpenDetail(inv.id)
                                }
                              }}
                              aria-label={`Buka invoice DP ${inv.nomor}`}
                              className="cursor-pointer"
                            >
                              <TableCell className="whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 font-medium">
                                  {inv.nomor || '-'} <TypeBadge type="DP" />
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{inv.tanggal ? formatTanggalShort(inv.tanggal) : '-'}</TableCell>
                              <TableCell className="max-w-40 truncate">{inv.customerName}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatRupiah(inv.total)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatRupiah(inv.dpAmount)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap text-emerald-700">
                                {formatRupiah(inv.settledAmount)}
                              </TableCell>
                              <TableCell className={`text-right font-semibold whitespace-nowrap ${inv.sisa > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {formatRupiah(inv.sisa)}
                              </TableCell>
                              <TableCell><StatusBadge status={inv.status} /></TableCell>
                              <TableCell>
                                <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {paymentData.dpRows.length === 0 ? (
                    <div className="rounded-xl border border-stone-200 bg-white"><DpEmptyState /></div>
                  ) : (
                    paymentData.dpRows.slice(0, 100).map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => onOpenDetail(inv.id)}
                        aria-label={`Buka invoice DP ${inv.nomor}`}
                        className="w-full text-left"
                      >
                        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5 transition-colors active:bg-stone-50 hover:border-stone-300">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold truncate">{inv.nomor || '-'}</p>
                              <TypeBadge type="DP" />
                            </div>
                            <StatusBadge status={inv.status} />
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {inv.customerName} · {inv.tanggal ? formatTanggalShort(inv.tanggal) : '-'}
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-[11px] text-muted-foreground">Total</p>
                              <p className="font-medium whitespace-nowrap">{formatRupiah(inv.total)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">DP</p>
                              <p className="font-medium whitespace-nowrap">{formatRupiah(inv.dpAmount)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">Sisa</p>
                              <p className={`font-semibold whitespace-nowrap ${inv.sisa > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {formatRupiah(inv.sisa)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>

              {/* ===== Bagian 2: Transaksi Pelunasan ===== */}
              <section aria-label="Transaksi Pelunasan" className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">Transaksi Pelunasan</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pembayaran pelunasan atas invoice DP.
                  </p>
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                  {paymentData.settlementRows.length === 0 ? (
                    <SettlementEmptyState />
                  ) : (
                    <div className="max-h-96 overflow-auto scrollbar-thin">
                      <Table className="min-w-[560px]">
                        <TableHeader className="sticky top-0 z-10 bg-stone-50">
                          <TableRow className="bg-stone-50 hover:bg-stone-50">
                            <TableHead>Nomor</TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Invoice DP</TableHead>
                            <TableHead className="text-right">Nominal</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentData.settlementRows.slice(0, 100).map((inv) => (
                            <TableRow
                              key={inv.id}
                              tabIndex={0}
                              onClick={() => onOpenDetail(inv.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onOpenDetail(inv.id)
                                }
                              }}
                              aria-label={`Buka transaksi pelunasan ${inv.nomor}`}
                              className="cursor-pointer"
                            >
                              <TableCell className="whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 font-medium">
                                  {inv.nomor || '-'} <TypeBadge type="PEL" />
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{inv.tanggal ? formatTanggalShort(inv.tanggal) : '-'}</TableCell>
                              <TableCell className="whitespace-nowrap font-mono text-xs">
                                {inv.parentNumber || '-'}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-emerald-700 whitespace-nowrap">
                                {formatRupiah(inv.paidAmount)}
                              </TableCell>
                              <TableCell><StatusBadge status={inv.status} /></TableCell>
                              <TableCell>
                                <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {paymentData.settlementRows.length === 0 ? (
                    <div className="rounded-xl border border-stone-200 bg-white"><SettlementEmptyState /></div>
                  ) : (
                    paymentData.settlementRows.slice(0, 100).map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => onOpenDetail(inv.id)}
                        aria-label={`Buka transaksi pelunasan ${inv.nomor}`}
                        className="w-full text-left"
                      >
                        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 transition-colors active:bg-stone-50 hover:border-stone-300">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold truncate">{inv.nomor || '-'}</p>
                              <TypeBadge type="PEL" />
                            </div>
                            <StatusBadge status={inv.status} />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-xs text-muted-foreground truncate">
                              {inv.tanggal ? formatTanggalShort(inv.tanggal) : '-'}
                              {inv.parentNumber ? ` · DP ${inv.parentNumber}` : ''}
                            </span>
                            <span className="font-semibold text-emerald-700 whitespace-nowrap">
                              {formatRupiah(inv.paidAmount)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>
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
  // Invoice DP yang di-preselect di editor Pelunasan — diisi dari deep-link
  // ?pelunasan=<id> atau tombol "Buat Invoice Pelunasan" di Detail Invoice.
  const [pelunasanInvoiceId, setPelunasanInvoiceId] = useState<string | null>(null)

  // Deep-link dari Beranda: /invoice?detail=<id> → langsung buka Detail Invoice.
  // /invoice?buat=1 → langsung buka layar "Buat Invoice Baru".
  // /invoice?pelunasan=<id> → langsung buka editor Pelunasan dgn invoice DP terpilih.
  // Dibaca sekali saat mount (client-side) agar tidak butuh Suspense tambahan.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const d = params.get('detail')
      if (d) setDetailId(d)
      const b = params.get('buat')
      if (b) setShowCreate(true)
      const p = params.get('pelunasan')
      if (p) {
        setPelunasanInvoiceId(p)
        setCreateMode('pelunasan')
        setShowCreate(true)
      }
    } catch {
      // abaikan — query tidak valid
    }
  }, [])

  // Buka editor Pelunasan dengan invoice DP yang sudah dipilih (dari Detail
  // Invoice / daftar piutang Beranda / halaman Piutang Dagang).
  const openPelunasan = (invoiceId: string) => {
    setDetailId(null)
    setPelunasanInvoiceId(invoiceId)
    setCreateMode('pelunasan')
    setShowCreate(true)
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/invoice')
    }
  }

  // Tutup detail + bersihkan query param agar refresh tidak membuka detail lagi.
  const closeDetail = () => {
    setDetailId(null)
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/invoice')
    }
  }

  // Tutup layar Buat Invoice + bersihkan query param ?buat=1 / ?pelunasan=.
  const closeCreate = () => {
    setShowCreate(false)
    setPelunasanInvoiceId(null)
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/invoice')
    }
  }

  return (
    <DashboardLayout title="Invoice" subtitle="Buat invoice dengan pratinjau langsung dan cetak A5">
      {detailId ? (
        <DetailInvoiceView id={detailId} onBack={closeDetail} onCreatePelunasan={openPelunasan} />
      ) : showCreate ? (
        <div className="print:hidden">
          {/* Header: kembali + judul halaman */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              onClick={closeCreate}
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
              <InvoicePelunasanEditor preselectInvoiceId={pelunasanInvoiceId ?? undefined} />
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
