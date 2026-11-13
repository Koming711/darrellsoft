'use client'

/**
 * Rekap Tagihan Cust — /rekap-tagihan
 *
 * Laporan tagihan customer per bulan: pilih customer (atau "Semua Customer"),
 * bulan & tahun → preview rekap siap cetak (kop perusahaan + tabel invoice).
 *
 * - Sumber data: /api/rekap-tagihan (rumus identik Piutang Dagang:
 *   sisa = total − DP, lunas = p.lunas === true, invoice batal di-skip).
 * - Kolom Total Harga: invoice LUNAS tampil harga penuh (total) sebagai
 *   riwayat, invoice BELUM lunas tampil sisa. TOTAL hanya menjumlahkan
 *   sisa invoice yang belum lunas (lihat catatan kaki tabel).
 * - Tanggal berformat dd/mm/yy (sudah diformat API, field tanggalLabel).
 * - Opsi "Semua Customer" (nilai __all__) menampilkan semua customer —
 *   kolom Customer ikut ditampilkan pada mode ini.
 * - Format kertas A5 portrait (148×210 mm): preview, Cetak (@media print,
 *   hanya #rekap-tagihan-sheet) dan Export PDF (jsPDF A5) memakai format ini.
 * - Tanda tangan "Yang Membuat" bergaya sama dengan preview invoice (label
 *   tebal + ruang ttd ±12 mm + garis bawah hitam) tampil di bawah laporan
 *   (preview, cetak & Export PDF).
 * - Export Excel (CSV ; delimiter) mengikuti struktur tabel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import type { TranslationKey } from '@/lib/i18n'
import { Skeleton } from '@/components/ui/skeleton'

interface RekapRow {
  id: string
  nomor: string
  tanggal: string
  tanggalLabel: string
  customerName: string
  namaCetakan: string
  itemCount: number
  total: number
  sisa: number
  lunas: boolean
}

interface RekapResponse {
  success: boolean
  customer: string
  month: number
  year: number
  rows: RekapRow[]
  totalTagihan: number
  jumlahInvoice: number
  jumlahBelumLunas: number
}

/** Nilai khusus opsi "Semua Customer" — disepakati dengan API. */
const SEMUA = '__all__'

/** Format Rupiah 2 desimal: 1250000 → "Rp 1.250.000,00". */
function rp2(n: number): string {
  return (
    'Rp ' +
    (Number.isFinite(n) ? n : 0).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

/** Slug aman nama file dari nama customer. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'customer'
  )
}

export default function RekapTagihanPage() {
  const { t } = useLanguage()

  const now = useMemo(() => new Date(), [])
  const [customerList, setCustomerList] = useState<string[]>([])
  const [customer, setCustomer] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<RekapResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [company, setCompany] = useState({ name: '', address: '', phone: '', logo: '' })
  const seqRef = useRef(0)

  const bulanKeys = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => `bulan_${i + 1}` as TranslationKey),
    []
  )
  const years = useMemo(() => {
    const y = new Date().getFullYear()
    const list: number[] = []
    for (let i = y + 1; i >= y - 5; i--) list.push(i)
    return list
  }, [])

  const monthName = useMemo(
    () => t(`bulan_${month}` as TranslationKey),
    [t, month]
  )

  /** Muat daftar customer (master customer + distinct dari invoice) + data kop. */
  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)
    try {
      const headers = getAuthHeaders()
      const names = new Set<string>()
      const [resCust, resList] = await Promise.all([
        authFetch('/api/customers?q=', { headers }),
        authFetch('/api/rekap-tagihan?list=1', { headers }),
      ])
      if (resCust.ok) {
        const j = await resCust.json()
        const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.customers) ? j.customers : []
        for (const c of arr) {
          const n = typeof c === 'string' ? c : String(c?.nama ?? c?.name ?? '')
          if (n) names.add(n)
        }
      }
      if (resList.ok) {
        const j = await resList.json()
        for (const n of j.customers || []) if (n) names.add(String(n))
      }
      setCustomerList(
        Array.from(names).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
      )
    } catch {
      /* daftar customer gagal → biarkan kosong, user tetap bisa pilih manual */
    } finally {
      setLoadingCustomers(false)
    }
  }, [])

  /** Muat data kop perusahaan (nama, alamat, telepon, logo). */
  const loadCompany = useCallback(async () => {
    try {
      const res = await authFetch('/api/settings', { headers: getAuthHeaders() })
      if (!res.ok) return
      const arr = (await res.json()) as { key: string; value: string }[]
      const map = new Map(arr.map((s) => [s.key, s.value]))
      setCompany({
        name: map.get('company_name') || '',
        address: map.get('company_address') || '',
        phone: map.get('company_phone') || '',
        logo: map.get('company_logo') || '',
      })
    } catch {
      /* kop opsional */
    }
  }, [])

  /** Jalankan rekap untuk kombinasi customer/bulan/tahun aktif. */
  const load = useCallback(async () => {
    if (!customer) return
    const seq = ++seqRef.current
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await authFetch(
        `/api/rekap-tagihan?customer=${encodeURIComponent(customer)}&month=${month}&year=${year}`,
        { headers }
      )
      if (!res.ok) throw new Error('gagal memuat rekap')
      const json = (await res.json()) as RekapResponse
      if (seq !== seqRef.current) return // respons basi (user ganti filter)
      setData(json)
    } catch {
      if (seq !== seqRef.current) return
      toast.error(t('rekap_tag_gagal_muat' as TranslationKey))
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [customer, month, year, t])

  useEffect(() => {
    void loadCustomers()
    void loadCompany()
  }, [])

  // Auto-load setiap filter berubah (pola produksi: pilih customer langsung tampil)
  useEffect(() => {
    if (!customer) {
      setData(null)
      return
    }
    void load()
  }, [customer, month, year, load])

  const rows = data?.rows ?? []
  const isAll = customer === SEMUA
  const showCustomerCol = isAll
  const hasData = data !== null && rows.length > 0

  const judul = useMemo(() => {
    const nama = isAll ? t('rekap_tag_semua_customer' as TranslationKey) : customer
    return `${t('rekap_tag_judul' as TranslationKey)} ${nama} (${t('rekap_tag_bulan' as TranslationKey)} ${monthName} ${year})`
  }, [isAll, customer, monthName, year, t])

  // ===== Export Excel (CSV ; delimiter, BOM agar Excel id-ID membaca benar) =====
  const handleExportExcel = useCallback(() => {
    if (!rows.length) return
    const header = ['Tgl', 'No. Inv', ...(showCustomerCol ? ['Customer'] : []), 'Nama Cetakan', 'Total Harga', 'Status']
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines: string[] = [header.map(q).join(';')]
    for (const r of rows) {
      lines.push(
        [
          r.tanggalLabel,
          r.nomor,
          ...(showCustomerCol ? [r.customerName] : []),
          r.namaCetakan,
          rp2(r.lunas ? r.total : r.sisa),
          r.lunas ? t('rekap_tag_sudah_lunas' as TranslationKey) : t('rekap_belum_lunas' as TranslationKey),
        ]
          .map(q)
          .join(';')
      )
    }
    lines.push(
      [
        '',
        '',
        ...(showCustomerCol ? [''] : []),
        t('rekap_tag_total' as TranslationKey),
        rp2(data?.totalTagihan ?? 0),
        '',
      ]
        .map(q)
        .join(';')
    )
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rekap-tagihan-${slugify(isAll ? 'semua-customer' : customer)}-${month}-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [rows, data, showCustomerCol, isAll, customer, month, year, t])

  // ===== Export PDF (jsPDF — A5 portrait, layout sama dengan preview) =====
  const handleExportPdf = useCallback(async () => {
    if (!rows.length) return
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
      const M = 8 // margin 8mm
      const W = 132 // lebar area konten (148mm − 2×8mm)
      const BREAK = 176 // batas bawah konten sebelum pindah halaman (210mm − margin)
      let y = 10

      // ---- Kop: logo / avatar huruf + nama, alamat, telepon perusahaan ----
      const logo = company.logo
      let drewLogo = false
      if (logo.startsWith('data:image')) {
        try {
          const fmt = logo.includes('image/png') ? 'PNG' : 'JPEG'
          pdf.addImage(logo, fmt, M, y, 11, 11)
          drewLogo = true
        } catch {
          drewLogo = false
        }
      }
      if (!drewLogo) {
        pdf.setLineWidth(0.4)
        pdf.rect(M, y, 11, 11)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text((company.name || 'A').charAt(0).toUpperCase(), M + 5.5, y + 5.5, {
          align: 'center',
          baseline: 'middle',
        })
      }
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9.5)
      pdf.text(company.name || '-', M + 15, y + 4.2)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      if (company.address) pdf.text(company.address, M + 15, y + 8)
      if (company.phone) pdf.text(company.phone, M + 15, y + 11.2)
      y += 14
      pdf.setLineWidth(0.6)
      pdf.line(M, y, M + W, y)
      y += 6

      // ---- Judul ----
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10.5)
      pdf.text(judul, M + W / 2, y, { align: 'center' })
      y += 6

      // ---- Tabel ----
      const colTgl = 14
      const colInv = 25
      const colCust = showCustomerCol ? 22 : 0
      const colHarga = 26
      const colStatus = 18
      const colNama = W - colTgl - colInv - colCust - colHarga - colStatus
      const cols = [
        { label: t('rekap_tag_kolom_tgl' as TranslationKey), w: colTgl, align: 'left' as const },
        { label: t('rekap_tag_kolom_no_inv' as TranslationKey), w: colInv, align: 'left' as const },
        ...(showCustomerCol
          ? [{ label: t('rekap_tag_kolom_customer' as TranslationKey), w: colCust, align: 'left' as const }]
          : []),
        { label: t('rekap_tag_kolom_nama' as TranslationKey), w: colNama, align: 'left' as const },
        { label: t('rekap_tag_kolom_harga' as TranslationKey), w: colHarga, align: 'right' as const },
        { label: t('rekap_tag_kolom_status' as TranslationKey), w: colStatus, align: 'center' as const },
      ]
      const colX = (idx: number) => {
        let x = M
        for (let i = 0; i < idx; i++) x += cols[i].w
        return x
      }

      const drawRow = (cells: string[], h: number, bold = false, italic = false) => {
        pdf.setFont('helvetica', bold ? 'bold' : italic ? 'italic' : 'normal')
        pdf.setFontSize(7.5)
        let x = M
        cols.forEach((c, i) => {
          pdf.rect(x, y, c.w, h)
          const txt = cells[i] ?? ''
          if (txt) {
            if (c.align === 'right') {
              pdf.text(txt, x + c.w - 1.5, y + 3.8, { align: 'right' })
            } else if (c.align === 'center') {
              pdf.text(txt, x + c.w / 2, y + 3.8, { align: 'center' })
            } else {
              pdf.text(txt, x + 1.5, y + 3.8)
            }
          }
          x += c.w
        })
        y += h
      }

      // Header
      drawRow(cols.map((c) => c.label), 6, true)
      pdf.setFont('helvetica', 'normal')

      // Baris data — Total Harga: lunas tampil harga penuh (riwayat), tidak lunas tampil sisa
      const namaColIdx = showCustomerCol ? 3 : 2
      for (const r of rows) {
        const h = Math.max(6, 2.6 + pdf.splitTextToSize(r.namaCetakan, colNama - 3).length * 3.4)
        if (y + h > BREAK) {
          pdf.addPage()
          y = 10
          drawRow(cols.map((c) => c.label), 6, true)
          pdf.setFont('helvetica', 'normal')
        }
        const cells = [
          r.tanggalLabel,
          r.nomor,
          ...(showCustomerCol ? [r.customerName] : []),
          r.namaCetakan,
          rp2(r.lunas ? r.total : r.sisa),
          r.lunas ? t('rekap_tag_sudah_lunas' as TranslationKey) : t('rekap_belum_lunas' as TranslationKey),
        ]
        let x = M
        cols.forEach((c, i) => {
          pdf.rect(x, y, c.w, h)
          const raw = cells[i] ?? ''
          if (raw) {
            if (i === namaColIdx) {
              // kolom Nama Cetakan → multi-line
              const lines = pdf.splitTextToSize(raw, c.w - 3) as string[]
              pdf.text(lines, x + 1.5, y + 3.8)
            } else if (c.align === 'right') {
              pdf.text(raw, x + c.w - 1.5, y + 3.8, { align: 'right' })
            } else if (c.align === 'center') {
              pdf.text(raw, x + c.w / 2, y + 3.8, { align: 'center' })
            } else {
              pdf.text(raw, x + 1.5, y + 3.8)
            }
          }
          x += c.w
        })
        y += h
      }

      // Baris TOTAL — label rata kanan di span kolom kiri, nominal di kolom Total Harga
      const spanW = W - colHarga - colStatus
      pdf.rect(M, y, spanW, 6)
      pdf.rect(M + spanW, y, colHarga, 6)
      pdf.rect(M + spanW + colHarga, y, colStatus, 6)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.text(t('rekap_tag_total' as TranslationKey), M + spanW - 1.5, y + 3.8, { align: 'right' })
      pdf.text(rp2(data?.totalTagihan ?? 0), M + spanW + colHarga - 1.5, y + 3.8, { align: 'right' })
      y += 6

      // Catatan kaki
      y += 3
      pdf.setFont('helvetica', 'italic')
      pdf.setFontSize(6.5)
      const footLines = pdf.splitTextToSize(t('rekap_tag_catatan_total' as TranslationKey), W) as string[]
      pdf.text(footLines, M, y)
      y += footLines.length * 3

      // ---- Tanda tangan "Yang Membuat" — gaya sama dengan preview invoice
      //      (label tebal + ruang ttd ±12 mm + garis bawah hitam) ----
      y += 5
      const boxW = 40
      const sigGap = 12 // ruang tanda tangan (mm), sama seperti preview invoice
      if (y + sigGap + 15 > BREAK) {
        pdf.addPage()
        y = 10
      }
      const boxX = M + W - boxW
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.text(t('rekap_tag_ttd_yang_membuat' as TranslationKey), boxX + boxW / 2, y + 3, { align: 'center' })
      // garis tanda tangan: 60% lebar kolom, seperti garis ttd preview invoice
      pdf.setLineWidth(0.3)
      const lineW = boxW * 0.6
      pdf.line(
        boxX + (boxW - lineW) / 2,
        y + 3 + sigGap,
        boxX + (boxW + lineW) / 2,
        y + 3 + sigGap
      )

      const fname = `rekap-tagihan-${slugify(isAll ? 'semua-customer' : customer)}-${month}-${year}.pdf`
      pdf.save(fname)
    } catch (e) {
      console.error('Export PDF error:', e)
      toast.error(t('rekap_tag_gagal_muat' as TranslationKey))
    }
  }, [rows, data, showCustomerCol, isAll, customer, month, year, judul, company, t])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCustomers(), loadCompany()])
    if (customer) await load()
  }, [loadCustomers, loadCompany, customer, load])

  const initials = (company.name || 'A').charAt(0).toUpperCase()

  return (
    <DashboardLayout
      title={t('rekap_tagihan_cust' as TranslationKey)}
      subtitle={t('subtitle_rekap_tagihan_cust' as TranslationKey)}
    >
      <style jsx global>{`
        @media print {
          @page {
            size: 148mm 210mm; /* A5 portrait */
            margin: 8mm;
          }
          html,
          body {
            background: #fff !important;
          }
          body * {
            visibility: hidden !important;
          }
          #rekap-tagihan-sheet,
          #rekap-tagihan-sheet * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #rekap-tagihan-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          /* Kompaksi tabel agar muat di lebar A5 (132mm konten) */
          #rekap-tagihan-sheet table {
            min-width: 0 !important;
            font-size: 8.5px !important;
          }
          #rekap-tagihan-sheet th,
          #rekap-tagihan-sheet td {
            padding: 2px 3px !important;
          }
        }
      `}</style>

      <div className="space-y-5">
        {/* Header + muat ulang */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              {t('rekap_tagihan_cust' as TranslationKey)}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('subtitle_rekap_tagihan_cust' as TranslationKey)}
            </p>
          </div>
          <button
            onClick={() => void refreshAll()}
            disabled={loading || loadingCustomers}
            aria-label={t('rekap_tag_muat_ulang' as TranslationKey)}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white transition-colors hover:border-amber-300 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <RefreshCw className={`h-4 w-4 ${(loading || loadingCustomers) ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filter */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 md:p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
            <div>
              <label
                htmlFor="rekap-customer"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400"
              >
                {t('rekap_tag_pilih_customer' as TranslationKey)}
              </label>
              <select
                id="rekap-customer"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                aria-label={t('rekap_tag_pilih_customer' as TranslationKey)}
                className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none transition-colors focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">{t('rekap_tag_pilih_customer' as TranslationKey)}</option>
                <option value={SEMUA}>{t('rekap_tag_semua_customer' as TranslationKey)}</option>
                {customerList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="rekap-bulan"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400"
              >
                {t('rekap_tag_pilih_bulan' as TranslationKey)}
              </label>
              <select
                id="rekap-bulan"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label={t('rekap_tag_pilih_bulan' as TranslationKey)}
                className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none transition-colors focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {bulanKeys.map((k, i) => (
                  <option key={k} value={i + 1}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="rekap-tahun"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400"
              >
                {t('rekap_tag_pilih_tahun' as TranslationKey)}
              </label>
              <select
                id="rekap-tahun"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label={t('rekap_tag_pilih_tahun' as TranslationKey)}
                className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none transition-colors focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => void load()}
              disabled={!customer || loading}
              className="h-11 rounded-lg bg-amber-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50 md:min-w-[130px]"
            >
              {t('rekap_tag_tampilkan' as TranslationKey)}
            </button>
          </div>

          {/* Aksi: cetak / export */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              disabled={!hasData || loading}
              aria-label={t('rekap_cetak' as TranslationKey)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium transition-colors hover:border-amber-300 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {t('rekap_cetak' as TranslationKey)}
            </button>
            <button
              onClick={() => void handleExportPdf()}
              disabled={!hasData || loading}
              aria-label={t('rekap_tag_export_pdf' as TranslationKey)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium transition-colors hover:border-amber-300 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t('rekap_tag_export_pdf' as TranslationKey)}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={!hasData || loading}
              aria-label={t('rekap_export_excel' as TranslationKey)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium transition-colors hover:border-amber-300 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              {t('rekap_export_excel' as TranslationKey)}
            </button>
          </div>
        </div>

        {/* Badge ringkasan */}
        {hasData && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-stone-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-stone-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {data!.jumlahInvoice} {t('rekap_tag_jml_invoice' as TranslationKey)}
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {data!.jumlahBelumLunas} {t('rekap_tag_invoice_belum' as TranslationKey)}
            </span>
          </div>
        )}

        {/* Preview / empty state */}
        {!customer && !loading ? (
          <div className="rounded-xl border border-stone-200 bg-white py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <FileText className="mx-auto mb-3 h-10 w-10 text-stone-300 dark:text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('rekap_tag_pilih_dulu' as TranslationKey)}</p>
          </div>
        ) : loading && !data ? (
          <div className="mx-auto max-w-[560px] space-y-3">
            <Skeleton className="h-[64px] w-full rounded-lg" />
            <Skeleton className="h-[36px] w-2/3 rounded-lg" />
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </div>
        ) : (
          <div
            id="rekap-tagihan-sheet"
            className="mx-auto max-w-[560px] rounded-lg border border-stone-300 bg-white p-4 md:p-5 dark:border-transparent"
            style={{ color: '#1c1917' }}
          >
            {/* Kop perusahaan */}
            <div className="flex items-center gap-2.5 border-b-2 border-stone-900 pb-2.5">
              {company.logo ? (
                <img
                  src={company.logo}
                  alt={`Logo ${company.name || ''}`}
                  className="h-10 w-10 rounded-md object-contain"
                />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-stone-900 text-base font-bold"
                  aria-hidden="true"
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-bold leading-tight">{company.name || '-'}</p>
                {company.address && <p className="text-[11px] leading-snug text-stone-600">{company.address}</p>}
                {company.phone && <p className="text-[11px] leading-snug text-stone-600">{company.phone}</p>}
              </div>
            </div>

            {/* Judul laporan */}
            <h2 className="mt-4 text-center text-sm font-bold md:text-base">{judul}</h2>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-500">
                {t('rekap_tag_kosong' as TranslationKey)}
              </p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-0 border-collapse text-[11px]">
                    <thead>
                      <tr>
                        <th className="w-[11%] border border-stone-900 px-1.5 py-1 text-left font-bold">
                          {t('rekap_tag_kolom_tgl' as TranslationKey)}
                        </th>
                        <th className="w-[17%] border border-stone-900 px-1.5 py-1 text-left font-bold">
                          {t('rekap_tag_kolom_no_inv' as TranslationKey)}
                        </th>
                        {showCustomerCol && (
                          <th className="w-[15%] border border-stone-900 px-1.5 py-1 text-left font-bold">
                            {t('rekap_tag_kolom_customer' as TranslationKey)}
                          </th>
                        )}
                        <th className="border border-stone-900 px-1.5 py-1 text-left font-bold">
                          {t('rekap_tag_kolom_nama' as TranslationKey)}
                        </th>
                        <th className="w-[18%] border border-stone-900 px-1.5 py-1 text-right font-bold">
                          {t('rekap_tag_kolom_harga' as TranslationKey)}
                        </th>
                        <th className="w-[14%] border border-stone-900 px-1.5 py-1 text-center font-bold">
                          {t('rekap_tag_kolom_status' as TranslationKey)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="border border-stone-900 px-1.5 py-1 tabular-nums">{r.tanggalLabel}</td>
                          <td className="border border-stone-900 px-1.5 py-1">{r.nomor}</td>
                          {showCustomerCol && (
                            <td className="border border-stone-900 px-1.5 py-1">{r.customerName}</td>
                          )}
                          <td className="border border-stone-900 px-1.5 py-1">{r.namaCetakan}</td>
                          <td className="whitespace-nowrap border border-stone-900 px-1.5 py-1 text-right tabular-nums">
                            {rp2(r.lunas ? r.total : r.sisa)}
                          </td>
                          <td className="border border-stone-900 px-1.5 py-1 text-center">
                            {r.lunas
                              ? t('rekap_tag_sudah_lunas' as TranslationKey)
                              : t('rekap_belum_lunas' as TranslationKey)}
                          </td>
                        </tr>
                      ))}
                      {/* Baris TOTAL — hanya sisa invoice yang belum lunas */}
                      <tr>
                        <td
                          colSpan={showCustomerCol ? 4 : 3}
                          className="border border-stone-900 px-1.5 py-1 text-right font-bold"
                        >
                          {t('rekap_tag_total' as TranslationKey)}
                        </td>
                        <td className="whitespace-nowrap border border-stone-900 px-1.5 py-1 text-right font-bold tabular-nums">
                          {rp2(data?.totalTagihan ?? 0)}
                        </td>
                        <td className="border border-stone-900 px-1.5 py-1">&nbsp;</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2.5 text-[10px] italic text-stone-600">
                  {t('rekap_tag_catatan_total' as TranslationKey)}
                </p>

                {/* Tanda tangan "Yang Membuat" — gaya sama dengan preview invoice
                    (label tebal + ruang ttd ±12 mm + garis bawah hitam) */}
                <div className="mt-7 flex justify-end print:mt-4">
                  <div className="w-[200px] text-center">
                    <p className="text-[11px] font-semibold">{t('rekap_tag_ttd_yang_membuat' as TranslationKey)}</p>
                    {/* ruang tanda tangan ±12 mm seperti preview invoice */}
                    <div className="h-[12mm]" aria-hidden="true" />
                    <div className="mx-auto w-[60%] border-b border-black" aria-hidden="true" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
