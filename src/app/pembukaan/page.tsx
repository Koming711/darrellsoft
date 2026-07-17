'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { useAuth } from '@/contexts/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { getAuthHeaders } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import {
  FileText,
  Truck,
  ShoppingCart,
  Scissors,
  DollarSign,
  BookOpen,
  Clock,
  Calculator,
  TrendingUp,
  CalendarClock,
  ChevronRight,
  Sparkles,
  History,
  Receipt,
  Package,
  CalendarIcon,
  Filter,
  Eye,
  Loader2,
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { startNavigation } from '@/components/navigation-progress'
import { cn } from '@/lib/utils'
import { PurchaseOrderPreview } from '@/components/dokupro/purchase-order-preview'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import type { PurchaseOrderData, InvoiceData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'
import { generatePurchaseOrderPdf, generateInvoicePdf, sharePdfViaWhatsApp } from '@/lib/generate-pdf'
import { toast } from 'sonner'

// --- Types ---
interface CetakanRecord {
  id: string
  printName: string
  customerName: string
  profitAmount: number
  finishingNames: string
  jumlahPesanan: string
  grandTotal: number
  createdAt: string
}

interface PotongKertasRecord {
  id: string
  namaCetakan: string
  namaCustomer: string
  paperName: string
  paperWidth: string
  paperHeight: string
  cutWidth: string
  cutHeight: string
  jumlahPesanan: string
  totalPrice: number
  createdAt: string
}

interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

interface DashboardData {
  expiryInfo: {
    validUntil: string | null
    remainingDays: number | null
  }
  summary: {
    calculations: {
      cetakan: number
      finishing: number
      ongkosCetak: number
      hargaKertas: number
      potongKertas: number
      total: number
    }
    documents: {
      invoice: number
      suratJalan: number
      purchaseOrder: number
      total: number
    }
    totals: {
      cetakan: number
      finishing: number
      uangCapek: number
      ongkosCetak: number
      hargaKertas: number
      potongKertas: number
      invoice: number
      purchaseOrder: number
      revenue: number
      lastMonthRevenue: number
      modal: number
      todaySales: number
      todayOrderCount: number
      todayUangCapek: number
    }
  }
  recent: {
    cetakan: CetakanRecord[]
    potongKertas: PotongKertasRecord[]
  }
  daily: Record<string, { calculations: number; documents: number }>
}

// --- Date filter types ---
type FilterType = 'all' | 'today' | 'week' | 'month' | 'custom'

function getFilterDates(filter: FilterType, customStart?: Date, customEnd?: Date): { startDate: string; endDate: string } {
  const today = new Date()
  const formatDate = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  switch (filter) {
    case 'all': {
      // Wide range so both dashboard & history APIs return all records
      return { startDate: '2000-01-01', endDate: '2099-12-31' }
    }
    case 'today': {
      return { startDate: formatDate(today), endDate: formatDate(today) }
    }
    case 'week': {
      const startOfWeek = new Date(today)
      // Get Monday of current week
      const day = startOfWeek.getDay()
      const diff = day === 0 ? -6 : 1 - day
      startOfWeek.setDate(startOfWeek.getDate() + diff)
      return { startDate: formatDate(startOfWeek), endDate: formatDate(today) }
    }
    case 'month': {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: formatDate(startOfMonth), endDate: formatDate(today) }
    }
    case 'custom': {
      return {
        startDate: customStart ? formatDate(customStart) : formatDate(today),
        endDate: customEnd ? formatDate(customEnd) : formatDate(today),
      }
    }
  }
}

function getFilterLabel(filter: FilterType, lang: 'id' | 'en' = 'id'): string {
  const map: Record<FilterType, { id: string; en: string }> = {
    all: { id: 'Semua', en: 'All' },
    today: { id: 'Hari Ini', en: 'Today' },
    week: { id: 'Minggu Ini', en: 'This Week' },
    month: { id: 'Bulan Ini', en: 'This Month' },
    custom: { id: 'Custom', en: 'Custom' },
  }
  return map[filter][lang]
}
// Note: getFilterLabel is kept as a utility helper. Active UI uses t('today') etc. directly.

// --- Greeting ---
function getGreetingKey(): 'greeting_morning' | 'greeting_afternoon' | 'greeting_evening' | 'greeting_night' {
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 11) return 'greeting_morning'
  if (hour >= 11 && hour < 15) return 'greeting_afternoon'
  if (hour >= 15 && hour < 18) return 'greeting_evening'
  return 'greeting_night'
}

// --- Helpers ---
function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function formatDateShort(iso: string, lang: 'id' | 'en' = 'id'): string {
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'id-ID', { day: '2-digit', month: 'short' })
}

function formatDateDisplay(d: Date | undefined, lang: 'id' | 'en' = 'id', fallback?: string): string {
  if (!d) return fallback ?? 'Pilih tanggal'
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

// --- Empty State ---
function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
      <Clock className="mx-auto h-6 w-6 text-gray-300" />
      <p className="mt-2 text-sm text-gray-400">{label}</p>
    </div>
  )
}

// --- Loading Skeleton ---
function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
    </div>
  )
}

// --- Parse dataJson for document info ---
function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson);
    const items = parsed.items || [];
    const firstItem = items[0];
    const namaBarang = firstItem?.deskripsi || '';
    const hargaSatuan = firstItem?.harga || 0;
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0);
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0);
    const ppn = parsed.ppn || 0;
    const totalHarga = subtotal + (subtotal * ppn / 100);
    const dp = parsed.dp || 0;
    const originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : totalHarga;
    const grandTotal = dp > 0 ? originalTotal : totalHarga;
    const referensi = parsed.referensi || '';
    // Profit (uang capek) — read directly from the invoice dataJson. This is
    // the source of truth saved when the invoice was created/merged, and
    // matches what the invoice riwayat tab shows. Do NOT recompute it by
    // matching referensi against riwayat cetakan profitAmount (the per-cetakan
    // profit can differ from the invoice's actual profit, e.g. after merging
    // multiple cetakan or adjusting the profit).
    const uangCapek = Number(parsed.uangCapek) || 0;
    return { namaBarang, hargaSatuan, totalQty, totalHarga, dp, originalTotal, grandTotal, referensi, uangCapek };
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, dp: 0, originalTotal: 0, grandTotal: 0, referensi: '', uangCapek: 0 };
  }
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
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }))
    return {
      type: 'invoice',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      client,
      items,
      ppn: parsed.ppn ?? 11,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
    }
  } catch {
    return {
      type: 'invoice',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      client: { nama: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      catatan: '',
      tanggalJatuhTempo: '',
      caraPembayaran: '',
      tanggalGiro: '',
    }
  }
}

// --- Parse dataJson for PurchaseOrderData ---
function parsePurchaseOrderData(entry: HistoryEntry): PurchaseOrderData {
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
    const pemasok = parsed.pemasok || parsed.client || { nama: '', jenisBarang: '', kontak: '', alamat: '' }
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }))
    return {
      type: 'purchase-order',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      pemasok,
      items,
      ppn: parsed.ppn ?? 11,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
    }
  } catch {
    return {
      type: 'purchase-order',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      pemasok: { nama: '', jenisBarang: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      catatan: '',
      tanggalJatuhTempo: '',
    }
  }
}


export default function PembukaanPage() {
  const { t, language } = useLanguage()
  const { user } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [greetingKey, setGreetingKey] = useState<'greeting_morning' | 'greeting_afternoon' | 'greeting_evening' | 'greeting_night'>('greeting_morning')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Motivasi hari ini — deterministic (day-of-year based) to avoid hydration mismatch
  // Bilingual quotes: same daily index used for both `id` and `en` arrays.
  const daftarMotivasi: { id: string[]; en: string[] } = {
    id: [
      'Kerja keras hari ini, hasilnya nikmat besok hari.',
      'Setiap langkah kecil mendekatkanmu pada tujuan besar.',
      'Jangan takut gagal, takutlah untuk tidak mencoba.',
      'Kesuksesan dimulai dari keberanian untuk memulai.',
      'Disiplin adalah jembatan antara tujuan dan pencapaian.',
      'Hari ini adalah kesempatan baru untuk menjadi lebih baik.',
      'Usaha kecil yang konsisten mengalahkan usaha besar yang sporadis.',
      'Jangan bandingkan dirimu dengan orang lain, bandingkan dengan dirimu kemarin.',
      'Ketekunan adalah kunci yang membuka semua pintu kesuksesan.',
      'Setiap detik adalah kesempatan untuk mengubah hidupmu.',
      'Sulit di awal, indah di akhir. Teruslah berjalan.',
      'Berdoa, berusaha, bersabar — resep sukses yang tak pernah gagal.',
      'Orang sukses bukan orang yang tidak pernah gagal, tapi yang tidak pernah menyerah.',
      'Kualitas bukan kebetulan, tapi hasil dari niat dan usaha yang sungguh-sungguh.',
      'Hari ini sulit? Besok akan terasa lebih mudah karena kamu sudah melewatinya.',
      'Jangan menunggu sempurna, mulai saja dulu. Sempurnakan di jalan.',
      'Cetak kertas bisa dihitung, tapi semangatmu tak terbatas.',
      'UMKM kuat, Indonesia maju. Dan kamu adalah bagian dari itu.',
      'Satu pesanan hari ini bisa jadi seribu pesanan besok.',
      'Kerja cerdas, bukan kerja keras saja.',
      'Produk bagus + pelayanan baik = pelanggan setia.',
      'Konsistensi mengalahkan talenta yang malas.',
      'Mulailah dari yang paling kecil, impianmu tidak perlu izin.',
      'Setiap hari adalah halaman baru. Tulis ceritamu dengan bangga.',
      'Semangat pagi! Hari ini penuh peluang, tangkap sebelum lewat.',
      'Keberanian bukan tidak takut, tapi tetap maju meski takut.',
      'Rajinlah saat orang lain malas, bersyukurlah saat hasilnya tiba.',
      'Bisnis kecil bukan berarti impian kecil.',
      'Langkah pertama selalu yang paling berat, tapi juga yang paling penting.',
      'Terus belajar, terus berinovasi, dunia tidak menunggu siapa pun.',
      'Hari ini kamu satu langkah lebih dekat dari kemarin.',
    ],
    en: [
      "Hard work today, sweet results tomorrow.",
      'Every small step brings you closer to your big goal.',
      "Don't be afraid to fail — be afraid of never trying.",
      'Success begins with the courage to start.',
      'Discipline is the bridge between goals and accomplishments.',
      'Today is a new opportunity to be better.',
      'Small consistent effort beats large sporadic effort.',
      "Don't compare yourself to others — compare yourself to yesterday's you.",
      'Persistence is the key that opens every door to success.',
      'Every second is a chance to change your life.',
      'Hard in the beginning, beautiful at the end. Keep walking.',
      'Pray, work, be patient — a success recipe that never fails.',
      "Successful people aren't those who never fail, but those who never quit.",
      'Quality is no accident — it is the result of sincere intention and effort.',
      'Today is hard? Tomorrow will feel easier because you already made it through.',
      "Don't wait for perfection — just start. Refine along the way.",
      'Paper printing can be calculated, but your spirit is limitless.',
      'Strong SMEs, a thriving nation. And you are part of it.',
      'One order today can become a thousand orders tomorrow.',
      'Work smart, not just hard.',
      'Great product + great service = loyal customers.',
      'Consistency beats lazy talent.',
      'Start small — your dreams need no permission.',
      'Each day is a new page. Write your story with pride.',
      'Good morning! Today is full of opportunities — grab them before they pass.',
      'Courage is not the absence of fear, but moving forward despite it.',
      'Be diligent when others are lazy; be grateful when the results arrive.',
      'A small business does not mean small dreams.',
      'The first step is always the hardest, but also the most important.',
      'Keep learning, keep innovating — the world waits for no one.',
      'Today you are one step closer than yesterday.',
    ],
  }
  // Deterministic daily motivasi — same quote for the whole day, no Math.random() to avoid hydration mismatch
  const [motivasiHariIni] = useState(() => {
    const today = new Date()
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000)
    const arr = daftarMotivasi[language]
    return arr[dayOfYear % arr.length]
  })

  // Date filter state
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>(undefined)
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>(undefined)

  // Document history states
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([])
  const [suratJalanHistory, setSuratJalanHistory] = useState<HistoryEntry[]>([])
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [docLoading, setDocLoading] = useState(false)

  // Popup state

  const [showPenjualanPopup, setShowPenjualanPopup] = useState(false)
  const [poPreviewOpen, setPoPreviewOpen] = useState(false)
  const [poPreviewItem, setPoPreviewItem] = useState<HistoryEntry | null>(null)
  const [poPreviewScale, setPoPreviewScale] = useState(1)
  const [sendingPoPdf, setSendingPoPdf] = useState(false)
  const [invPreviewOpen, setInvPreviewOpen] = useState(false)
  const [invPreviewItem, setInvPreviewItem] = useState<HistoryEntry | null>(null)
  const [invPreviewScale, setInvPreviewScale] = useState(1)
  const [sendingInvPdf, setSendingInvPdf] = useState(false)

  // Month names computed client-only to avoid hydration mismatch (server/client timezone difference)
  const [currentMonthLabel, setCurrentMonthLabel] = useState('')

  useEffect(() => {
    setCurrentMonthLabel(new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { month: 'long' }))
  }, [language])

  const displayName = user?.name || user?.username || (language === 'en' ? 'User' : 'Pengguna')

  useEffect(() => {
    // Set mounted + greeting on mount (client-only) to avoid hydration mismatch
    setMounted(true)
    setGreetingKey(getGreetingKey())
    const interval = setInterval(() => {
      setGreetingKey(getGreetingKey())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const res = await authFetch(`/api/dashboard?startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

  const fetchDocHistory = useCallback(async () => {
    setDocLoading(true)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const headers = getAuthHeaders()
      const [invRes, sjRes, poRes] = await Promise.all([
        fetch(`/api/history?docType=invoice&startDate=${startDate}&endDate=${endDate}`, { headers }),
        fetch(`/api/history?docType=surat-jalan&startDate=${startDate}&endDate=${endDate}`, { headers }),
        fetch(`/api/history?docType=purchase-order&startDate=${startDate}&endDate=${endDate}`, { headers }),
      ])
      if (invRes.ok) { const json = await invRes.json(); setInvoiceHistory(json.data || []) }
      if (sjRes.ok) { const json = await sjRes.json(); setSuratJalanHistory(json.data || []) }
      if (poRes.ok) { const json = await poRes.json(); setPoHistory(json.data || []) }
    } catch {
      // ignore
    } finally {
      setDocLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

  useEffect(() => {
    fetchDashboard()
    fetchDocHistory()
  }, [fetchDashboard, fetchDocHistory])

  // Listen for save events
  useEffect(() => {
    const handler = () => fetchDocHistory()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchDocHistory])

  const handlePoPreview = (item: HistoryEntry) => {
    setPoPreviewItem(item)
    setPoPreviewOpen(true)
  }

  const handleInvPreview = (item: HistoryEntry) => {
    setInvPreviewItem(item)
    setInvPreviewOpen(true)
  }

  const poData = useMemo(() => {
    if (!poPreviewItem) return null
    return parsePurchaseOrderData(poPreviewItem)
  }, [poPreviewItem])

  const invData = useMemo(() => {
    if (!invPreviewItem) return null
    return parseInvoiceData(invPreviewItem)
  }, [invPreviewItem])

  const handleSendPoPdf = useCallback(async () => {
    if (!poData) return
    setSendingPoPdf(true)
    try {
      const blob = await generatePurchaseOrderPdf(poData)
      const fileName = `PO_${poData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Purchase Order ${poData.nomor}`)
      toast.success(t('pdf_dikirim_wa'))
    } catch (err) {
      console.error(err)
      toast.error(t('gagal_mengirim_pdf'))
    } finally {
      setSendingPoPdf(false)
    }
  }, [poData, t])

  const handleSendInvPdf = useCallback(async () => {
    if (!invData) return
    setSendingInvPdf(true)
    try {
      const blob = await generateInvoicePdf(invData)
      const fileName = `Invoice_${invData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Invoice ${invData.nomor}`)
      toast.success(t('pdf_dikirim_wa'))
    } catch (err) {
      console.error(err)
      toast.error(t('gagal_mengirim_pdf'))
    } finally {
      setSendingInvPdf(false)
    }
  }, [invData, t])

  // Scale A5 PO preview to fit inside a popup on both mobile & desktop
  useEffect(() => {
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148)
    const updatePoScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const marginX = 24
      const marginY = 32
      const topPad = 48
      const btnArea = 56
      const availW = vw - marginX * 2
      const availH = vh - marginY * 2 - topPad - btnArea
      setPoPreviewScale(Math.min(availW / DESIGN_W, availH / DESIGN_H, 1))
    }
    if (poPreviewOpen) {
      const t = setTimeout(updatePoScale, 60)
      window.addEventListener('resize', updatePoScale)
      return () => { clearTimeout(t); window.removeEventListener('resize', updatePoScale) }
    }
  }, [poPreviewOpen])

  // Scale A5 Invoice preview to fit inside a popup on both mobile & desktop
  useEffect(() => {
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148)
    const updateInvScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const marginX = 24
      const marginY = 32
      const topPad = 48
      const btnArea = 56
      const availW = vw - marginX * 2
      const availH = vh - marginY * 2 - topPad - btnArea
      setInvPreviewScale(Math.min(availW / DESIGN_W, availH / DESIGN_H, 1))
    }
    if (invPreviewOpen) {
      const t = setTimeout(updateInvScale, 60)
      window.addEventListener('resize', updateInvScale)
      return () => { clearTimeout(t); window.removeEventListener('resize', updateInvScale) }
    }
  }, [invPreviewOpen])

  const handleFilterChange = (type: FilterType) => {
    if (type === 'custom') {
      setTempStartDate(customStartDate)
      setTempEndDate(customEndDate)
      setShowCustomDialog(true)
    } else {
      setFilterType(type)
    }
  }

  const handleCustomApply = () => {
    if (tempStartDate && tempEndDate) {
      setCustomStartDate(tempStartDate)
      setCustomEndDate(tempEndDate)
      setFilterType('custom')
      setShowCustomDialog(false)
    }
  }

  const summary = data?.summary
  const recent = data?.recent

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'all', label: t('semua') },
    { type: 'today', label: t('today') },
    { type: 'week', label: t('this_week') },
    { type: 'month', label: t('this_month') },
    { type: 'custom', label: t('custom') },
  ]

  return (
    <DashboardLayout title={t('pembukaan')} subtitle={t('subtitle_pembukaan')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Greeting Section */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center shadow-lg shrink-0">
            <BookOpen className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-normal uppercase text-slate-800">{mounted ? t(greetingKey) : t('greeting_morning')}</h2>
            <p className="text-lg sm:text-[27px] font-extrabold text-slate-800 truncate">{t('hello')}{displayName}</p>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {language === 'en' ? (
                <>Welcome to <span className="font-extrabold text-blue-900">www.darrellsoft.com</span>, Fast Printing Cost Calculator for <span className="font-bold">SMEs</span>.</>
              ) : (
                <>Selamat Datang di <span className="font-extrabold text-blue-900">www.darrellsoft.com</span>, Aplikasi Hitung Cepat Cetakan untuk <span className="font-bold">UMKM</span>.</>
              )}
            </p>
          </div>
        </div>

        {/* Motivasi Hari Ini */}
        <div className="mt-3 bg-white dark:bg-zinc-900 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">{t('motivation_today')}</p>
            <p className="text-[13px] sm:text-[15px] text-slate-700 font-bold italic leading-relaxed">"{motivasiHariIni}"</p>
          </div>
        </div>

        {/* Expired Akun Demo - only for demo role */}
        {user?.role === 'demo' && data?.expiryInfo?.validUntil && (
          <button
            onClick={() => {
              startNavigation()
              window.dispatchEvent(new CustomEvent('navigation-start'))
              router.push('/checkout')
            }}
            className="bg-teal-600 hover:bg-teal-700 rounded-xl p-4 flex items-center gap-4 w-full text-left transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-teal-100">{t('expired_akun_demo')}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-base sm:text-lg font-bold text-white leading-tight">
                  {data.expiryInfo.remainingDays} {t('hari_lagi')}
                </p>
                <span className="text-xs text-teal-100">
                  {language === 'en' ? 'until' : 's/d'} {new Date(data.expiryInfo.validUntil).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <p className="text-[11px] mt-1 text-teal-100">
                {t('lanjutkan_sebelum')}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-white/70" />
          </button>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label={t('revenue_today')}
            count={summary?.totals.todaySales ?? 0}
            total={0}
            color="rose"
            loading={loading}
            isCurrency
            subtitle={summary?.totals.todayOrderCount ? `${summary.totals.todayOrderCount} ${t('pesanan')}` : undefined}
          />
          <StatCard
            icon={<FileText className="w-5 h-5" />}
            label={t('transactions_today')}
            count={invoiceHistory.length}
            total={summary?.totals.invoice ?? 0}
            color="emerald"
            loading={loading}
          />
          <StatCard
            icon={<Calculator className="w-5 h-5" />}
            label={t('tired_money_today')}
            count={summary?.totals.todayUangCapek ?? 0}
            total={0}
            color="amber"
            loading={loading}
            isCurrency
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label={`${t('total_revenue')} ${currentMonthLabel}`}
            count={summary?.totals.revenue ?? 0}
            total={0}
            color="sky"
            loading={loading}
            isCurrency
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label={t('total_tired_money')}
            count={summary?.totals.uangCapek ?? 0}
            total={0}
            color="violet"
            loading={loading}
            isCurrency
            profitBadge={summary?.totals.modal && summary.totals.modal > 0 ? `${(((summary.totals.uangCapek ?? 0) / summary.totals.modal) * 100).toFixed(1)}%` : undefined}
          />
        </div>

        {/* Quick Access Icons */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <QuickIcon
            icon={<History className="w-5 h-5" />}
            label={t('penjualan')}
            color="bg-amber-50 text-amber-600 border-slate-200"
            onClick={() => {
              startNavigation()
              window.dispatchEvent(new CustomEvent('navigation-start'))
              router.push('/riwayat')
            }}
          />
          <QuickIcon
            icon={<ShoppingCart className="w-5 h-5" />}
            label={t('pembelian')}
            color="bg-blue-50 text-blue-600 border-slate-200"
            onClick={() => {
              startNavigation()
              window.dispatchEvent(new CustomEvent('navigation-start'))
              router.push('/riwayat-pembelian')
            }}
          />
          <QuickIcon
            icon={<Receipt className="w-5 h-5" />}
            label={t('invoice')}
            color="bg-violet-50 text-violet-600 border-slate-200"
            onClick={() => {
              startNavigation()
              window.dispatchEvent(new CustomEvent('navigation-start'))
              router.push('/invoice')
            }}
          />
        </div>

        {/* Date Filter Section */}
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white dark:bg-zinc-900 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mr-1">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">{t('period')}</span>
          </div>
          {filterButtons.map(btn => (
            <Button
              key={btn.type}
              variant="outline"
              size="sm"
              onClick={() => handleFilterChange(btn.type)}
              className={cn(
                'h-8 px-3 text-xs font-medium rounded-lg transition-all',
                filterType === btn.type
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white shadow-sm'
                  : 'bg-white dark:bg-[#1a1a1a] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#222] hover:text-slate-800 dark:hover:text-slate-200'
              )}
            >
              {btn.type === 'custom' && <CalendarIcon className="w-3.5 h-3.5 mr-1" />}
              {btn.label}
            </Button>
          ))}
          {filterType === 'custom' && customStartDate && customEndDate && (
            <span className="text-xs text-slate-400 ml-1">
              {formatDateDisplay(customStartDate, language, t('pilih_tanggal'))} — {formatDateDisplay(customEndDate, language, t('pilih_tanggal'))}
            </span>
          )}
        </div>

        {/* Riwayat Sections */}
        <div className="space-y-4">
          {/* Invoice */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                {t('invoice_history')}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {invoiceHistory.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docLoading ? <TableSkeleton /> : (
                invoiceHistory.length > 0 ? (
                  <div className="rounded-lg border bg-card max-h-[400px] overflow-auto">
                    <Table className="min-w-[750px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('no_doc_number')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('tanggal')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('nama_customer')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('nama_barang')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('qty')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('harga_satuan')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('uang_capek')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('total_harga')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceHistory.map((entry, i) => {
                          const info = parseDocInfo(entry)
                          const uc = info.uangCapek
                          return (
                            <TableRow key={entry.id} className="group">
                              <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                              <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{entry.nomor}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal, language) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-600 max-w-[120px] truncate">{entry.pihakKedua}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[160px] truncate" title={info.namaBarang}>{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.totalQty > 0 ? info.totalQty.toLocaleString(language === 'en' ? 'en-US' : 'id-ID') : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.hargaSatuan > 0 ? formatRupiah(info.hargaSatuan) : '-'}</TableCell>
                              <TableCell className={`py-2.5 text-xs text-right font-semibold whitespace-nowrap ${uc > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{uc > 0 ? formatRupiah(uc) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{info.grandTotal > 0 ? formatRupiah(info.grandTotal) : '-'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState label={t('no_data_yet')} />
              )}
            </CardContent>
          </Card>

          {/* Purchase Order */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-slate-400" />
                {t('po_history')}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {poHistory.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docLoading ? <TableSkeleton /> : (
                poHistory.length > 0 ? (
                  <div className="rounded-lg border bg-card max-h-[400px] overflow-auto">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('no_doc_number')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('tanggal')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('pemasok')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('nama_barang')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('qty')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('harga_satuan')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('total_harga')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {poHistory.map((entry, i) => {
                          const info = parseDocInfo(entry)
                          return (
                            <TableRow key={entry.id} className="group">
                              <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                              <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{entry.nomor}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal, language) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-600 max-w-[120px] truncate">{entry.pihakKedua}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[160px] truncate" title={info.namaBarang}>{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.totalQty > 0 ? info.totalQty.toLocaleString(language === 'en' ? 'en-US' : 'id-ID') : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.hargaSatuan > 0 ? formatRupiah(info.hargaSatuan) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{info.grandTotal > 0 ? formatRupiah(info.grandTotal) : '-'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState label={t('no_data_yet')} />
              )}
            </CardContent>
          </Card>

          {/* Hitung Cetakan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                {t('print_calc_history')}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {recent?.cetakan?.length ?? 0}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <TableSkeleton /> : (
                recent?.cetakan && recent.cetakan.length > 0 ? (
                  <div className="rounded-lg border bg-card max-h-[400px] overflow-auto">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('tgl')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('customer_label')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('nama_barang')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('finishing')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('jml_pesanan')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('uang_capek')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('harga_pcs')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('total_harga')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recent.cetakan.map((r, idx) => {
                          const qty = parseInt(r.jumlahPesanan || '0')
                          const hargaPcs = qty > 0 ? Math.round((r.grandTotal || 0) / qty) : 0
                          return (
                            <TableRow key={r.id} className="group">
                              <TableCell className="py-2.5 text-xs text-gray-400">{idx + 1}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(r.createdAt, language)}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 font-medium max-w-[100px] truncate">{r.customerName || '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[200px] truncate" title={r.printName || ''}>{r.printName || '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[150px] truncate" title={r.finishingNames || ''}>
                                {r.finishingNames || '-'}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{qty.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}</TableCell>
                              <TableCell className={`py-2.5 text-xs text-right whitespace-nowrap font-semibold ${r.profitAmount > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
                                {r.profitAmount > 0 ? formatRupiah(r.profitAmount) : '-'}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{hargaPcs > 0 ? formatRupiah(hargaPcs) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{formatRupiah(r.grandTotal || 0)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState label={t('no_data_yet')} />
              )}
            </CardContent>
          </Card>

          {/* Potong Kertas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-slate-400" />
                {t('paper_cut_history')}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {recent?.potongKertas?.length ?? 0}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <TableSkeleton /> : (
                recent?.potongKertas && recent.potongKertas.length > 0 ? (
                  <div className="rounded-lg border bg-card max-h-[400px] overflow-auto">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('tgl')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('customer_label')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('nama_barang')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('kertas')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('uk_kertas')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('uk_potong')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('jml')}</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('total_harga')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recent.potongKertas.map((r, idx) => (
                          <TableRow key={r.id} className="group">
                            <TableCell className="py-2.5 text-xs text-gray-400">{idx + 1}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(r.createdAt, language)}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-700 font-medium max-w-[100px] truncate">{r.namaCustomer || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-700 max-w-[120px] truncate">{r.namaCetakan || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-700 max-w-[100px] truncate">{r.paperName || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {r.paperWidth && r.paperWidth !== '0' ? `${r.paperWidth}×${r.paperHeight}` : '-'}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {r.cutWidth && r.cutWidth !== '0' ? `${r.cutWidth}×${r.cutHeight}` : '-'}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-right text-gray-700">{parseInt(r.jumlahPesanan || '0').toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}</TableCell>
                            <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{formatRupiah(r.totalPrice || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState label={t('no_data_yet')} />
              )}
            </CardContent>
          </Card>

          {/* Surat Jalan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-slate-400" />
                {t('delivery_note_history')}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {suratJalanHistory.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docLoading ? <TableSkeleton /> : (
                suratJalanHistory.length > 0 ? (
                  <div className="rounded-lg border bg-card max-h-[400px] overflow-auto">
                    <Table className="min-w-[450px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('no_doc_number')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('tanggal')}</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">{t('customer_label')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suratJalanHistory.map((entry, i) => (
                          <TableRow key={entry.id} className="group">
                            <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                            <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{entry.nomor}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal, language) : '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{entry.pihakKedua}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState label={t('no_data_yet')} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* PO Preview Dialog — A5 format */}
        <Dialog open={poPreviewOpen} onOpenChange={setPoPreviewOpen}>
          <DialogContent
            className="max-w-none w-auto overflow-hidden p-2 pt-10 gap-0 [&_button]:cursor-default"
            style={{
              width: `${576 * poPreviewScale + 16}px`,
              maxHeight: `calc(100dvh - 32px)`,
            }}
            aria-label={t('pratinjau_purchase_order')}
          >
            <DialogTitle className="sr-only">{t('pratinjau_purchase_order')}</DialogTitle>
            {poData && (
              <div className="flex flex-col items-center gap-3">
                <div style={{
                  width: `${576 * poPreviewScale}px`,
                  height: `${576 * (210 / 148) * poPreviewScale}px`,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 576,
                    height: 576 * (210 / 148),
                    transform: `scale(${poPreviewScale})`,
                    transformOrigin: 'top left',
                  }}>
                    <div className="bg-white" style={{ width: 576, height: 576 * (210 / 148) }}>
                      <div className="a5-preview-scaler">
                        <PurchaseOrderPreview data={poData} />
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSendPoPdf}
                  disabled={sendingPoPdf}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-default text-white text-sm font-medium transition-colors flex-shrink-0"
                >
                  {sendingPoPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {sendingPoPdf ? t('mengirim_pdf') : t('kirim_pdf_wa')}
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Popup Penjualan - Riwayat Invoice */}
        <Dialog open={showPenjualanPopup} onOpenChange={setShowPenjualanPopup}>
          <DialogContent className="sm:max-w-2xl p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                {t('riwayat_penjualan')}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">{t('daftar_invoice_penjualan')}</DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-5">
              {docLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
                </div>
              ) : invoiceHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white dark:bg-zinc-900 p-8 text-center">
                  <Receipt className="mx-auto h-8 w-8 text-amber-300" />
                  <p className="mt-2 text-sm text-amber-400">{t('belum_ada_data_invoice')}</p>
                </div>
              ) : (
                <div className="rounded-lg border bg-card max-h-[60vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500">{t('no_invoice')}</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500">{t('tanggal')}</TableHead>
                        <TableHead className="text-[11px] font-semibold text-gray-500">{t('customer_label')}</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold text-gray-500">{t('total_harga')}</TableHead>
                        <TableHead className="w-12 text-[11px] font-semibold text-gray-500 text-center">{t('aksi')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceHistory.map((inv, i) => {
                        const info = parseDocInfo(inv)
                        return (
                          <TableRow key={inv.id} className="hover:bg-amber-50/50">
                            <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                            <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{inv.nomor}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{inv.tanggal ? formatTanggal(inv.tanggal, language) : '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-600 max-w-[160px] truncate">{inv.pihakKedua || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-right font-medium text-amber-700 whitespace-nowrap">{info.grandTotal > 0 ? formatRupiah(info.grandTotal) : '-'}</TableCell>
                            <TableCell className="py-2.5 text-center">
                              <button onClick={() => handleInvPreview(inv)} title={t('preview')} className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors cursor-default">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Invoice Preview Dialog — A5 format */}
        <Dialog open={invPreviewOpen} onOpenChange={setInvPreviewOpen}>
          <DialogContent
            className="max-w-none w-auto overflow-hidden p-2 pt-10 gap-0 [&_button]:cursor-default"
            style={{
              width: `${576 * invPreviewScale + 16}px`,
              maxHeight: `calc(100dvh - 32px)`,
            }}
            aria-label={t('pratinjau_invoice')}
          >
            <DialogTitle className="sr-only">{t('pratinjau_invoice')}</DialogTitle>
            {invData && (
              <div className="flex flex-col items-center gap-3">
                <div style={{
                  width: `${576 * invPreviewScale}px`,
                  height: `${576 * (210 / 148) * invPreviewScale}px`,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 576,
                    height: 576 * (210 / 148),
                    transform: `scale(${invPreviewScale})`,
                    transformOrigin: 'top left',
                  }}>
                    <div className="bg-white" style={{ width: 576, height: 576 * (210 / 148) }}>
                      <div className="a5-preview-scaler">
                        <InvoicePreview data={invData} />
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSendInvPdf}
                  disabled={sendingInvPdf}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-default text-white text-sm font-medium transition-colors flex-shrink-0"
                >
                  {sendingInvPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {sendingInvPdf ? t('mengirim_pdf') : t('kirim_pdf_wa')}
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Custom Date Range Dialog */}
        <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
          <DialogContent className="sm:max-w-md p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                {t('pilih_rentang_tanggal')}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">{t('tentukan_periode')}</DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-4 space-y-4">
              {/* Start Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('tanggal_mulai')}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-9 text-sm',
                        !tempStartDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatDateDisplay(tempStartDate, language, t('pilih_tanggal'))}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={tempStartDate}
                      onSelect={setTempStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('tanggal_akhir')}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-9 text-sm',
                        !tempEndDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatDateDisplay(tempEndDate, language, t('pilih_tanggal'))}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={tempEndDate}
                      onSelect={setTempEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter className="px-5 pb-5 pt-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomDialog(false)}
                className="text-xs"
              >
                {t('batal')}
              </Button>
              <Button
                size="sm"
                onClick={handleCustomApply}
                disabled={!tempStartDate || !tempEndDate}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {t('terapkan')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

// --- Stat Card Component ---
function StatCard({
  icon, label, count, total, color, loading, isCurrency, subtitle, profitBadge, isDays, daysLabel,
}: {
  icon: React.ReactNode; label: string; count: number; total: number; color: string; loading: boolean; isCurrency?: boolean; subtitle?: string; profitBadge?: string; isDays?: boolean; daysLabel?: string
}) {
  const colorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
    emerald: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-700' },
    sky: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-sky-100 text-sky-600', text: 'text-sky-700' },
    amber: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-amber-100 text-amber-600', text: 'text-amber-700' },
    violet: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-violet-100 text-violet-600', text: 'text-violet-700' },
    rose: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-rose-100 text-rose-600', text: 'text-rose-700' },
    red: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-red-100 text-red-600', text: 'text-red-700' },
    orange: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
    teal: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-teal-100 text-teal-600', text: 'text-teal-700' },
  }
  const c = colorMap[color] || colorMap.emerald

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3 sm:p-4`}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-5 w-5 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
          <div className="h-4 w-20 bg-slate-100 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-3 w-16 bg-slate-100 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center mb-2`}>{icon}</div>
          <p className="text-xs text-slate-500 mb-0.5 break-words">{label} {profitBadge && <span className="text-[15px] font-bold text-violet-700">{profitBadge}</span>}</p>
          <p className={`text-base sm:text-lg font-bold ${c.text} leading-tight`}>{isCurrency ? formatRupiahShort(count) : isDays ? `${count} ${daysLabel ?? 'hari'}` : count}</p>
          {!isCurrency && total > 0 && <p className="text-[10px] text-slate-400">{formatRupiahShort(total)}</p>}
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </>
      )}
    </div>
  )
}

// --- Doc Card Component ---
function DocCard({
  icon, label, count, total, color, loading,
}: {
  icon: React.ReactNode; label: string; count: number; total?: number; color: string; loading: boolean
}) {
  const colorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
    blue: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-blue-100 text-blue-600', text: 'text-blue-700' },
    teal: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-teal-100 text-teal-600', text: 'text-teal-700' },
    orange: { bg: 'bg-white dark:bg-zinc-900', border: 'border-slate-200', iconBg: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
  }
  const c = colorMap[color] || colorMap.blue

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3 sm:p-4`}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-5 w-5 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
          <div className="h-4 w-20 bg-slate-100 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-3 w-16 bg-slate-100 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center mb-2`}>{icon}</div>
          <p className="text-xs text-slate-500 mb-0.5">{label}</p>
          <p className={`text-base sm:text-lg font-bold ${c.text} leading-tight`}>{count}</p>
          {total !== undefined && total > 0 && <p className="text-[10px] text-slate-400">{formatRupiahShort(total)}</p>}
        </>
      )}
    </div>
  )
}

// --- Quick Icon Component ---
function QuickIcon({
  icon, label, color, onClick,
}: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void
}) {
  const [bg, text, border] = color.split(' ')
  return (
    <button
      onClick={onClick}
      className={`bg-white dark:bg-zinc-900 ${border} border rounded-xl p-3 sm:p-4 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer`}
    >
      <div className={`${text}`}>{icon}</div>
      <span className={`text-[11px] sm:text-xs font-medium ${text}`}>{label}</span>
    </button>
  )
}
