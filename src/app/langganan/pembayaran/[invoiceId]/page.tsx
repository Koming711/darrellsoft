'use client'

// /langganan/pembayaran/[invoiceId] — Pembayaran Manual (QRIS / Transfer Bank)
// Alur: ringkasan pesanan → pilih metode → instruksi pembayaran (QRIS/REK) →
// unggah bukti (JPG/PNG/PDF ≤350KB, gambar otomatis dikompres) →
// status "Menunggu Verifikasi" → admin setujui.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StepIndicator } from '@/components/darrellsoft/step-indicator'
import { compressImageToJpegDataUrl, dataUrlBytes, formatBytes, PAYMENT_PROOF_MAX_BYTES } from '@/lib/image-compress'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  QrCode,
  ShieldCheck,
  Upload,
  Landmark,
  Ban,
} from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`

interface InvoiceDetail {
  id: string
  invoiceNumber: string
  planName: string
  amount: number
  uniqueCode: number | null
  originalPrice: number | null
  status: string
  rawStatus: string
  dueDate: string
  isPlanChange: boolean
  createdAt: string
  plan: { name: string; features: string[]; durationDays: number; maxAccounts: number }
}

interface PaymentRow {
  id: string
  paymentMethod: string
  amount: number
  senderName: string
  transferDate: string
  status: string
  rejectionReason: string
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  proofFileName: string
}

interface SettingsInfo {
  qrisImageUrl: string
  qrisReceiverName: string
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
  paymentInstructions: string
  paymentDueHours: number
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  kedaluwarsa: { label: 'Kedaluwarsa', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  dibatalkan: { label: 'Dibatalkan', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

export default function PembayaranPage() {
  const params = useParams<{ invoiceId: string }>()
  const router = useRouter()
  const invoiceId = params?.invoiceId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [settings, setSettings] = useState<SettingsInfo | null>(null)

  const [method, setMethod] = useState<'qris' | 'transfer_bank'>('qris')
  const [proofDataUrl, setProofDataUrl] = useState('')
  const [proofName, setProofName] = useState('')
  const [senderName, setSenderName] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!invoiceId) return
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`/api/subscription/invoice/${invoiceId}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Gagal memuat tagihan')
        return
      }
      setInvoice(json.invoice)
      setPayments(json.payments ?? [])
      setSettings(json.settings ?? null)
      // Jika tagihan ditolak → default metode = penolakan terakhir
      const last = (json.payments ?? [])[0]
      if (last) {
        setMethod(last.paymentMethod === 'transfer_bank' ? 'transfer_bank' : 'qris')
        if (last.paymentMethod === 'transfer_bank' && last.senderName) setSenderName(last.senderName)
      }
    } catch {
      setError('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    const user = getAuthHeaders()
    if (!user['x-user-id']) {
      router.replace(`/login?next=/langganan/pembayaran/${invoiceId}`)
      return
    }
    load()
  }, [load, invoiceId, router])

  const onPickFile = async (file: File | null) => {
    if (!file) return
    try {
      if (file.type === 'application/pdf') {
        if (file.size > PAYMENT_PROOF_MAX_BYTES) {
          toast.error(`Ukuran PDF maksimal 350KB (file Anda ${formatBytes(file.size)})`)
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          setProofDataUrl(String(reader.result || ''))
          setProofName(file.name)
        }
        reader.readAsDataURL(file)
        return
      }
      if (!file.type.startsWith('image/')) {
        toast.error('File bukti harus JPG, PNG, atau PDF')
        return
      }
      // Gambar otomatis dikompres ke JPEG ≤350KB
      const dataUrl = await compressImageToJpegDataUrl(file, PAYMENT_PROOF_MAX_BYTES)
      if (dataUrlBytes(dataUrl) > PAYMENT_PROOF_MAX_BYTES) {
        toast.error('Gagal mengompres gambar — coba gambar lebih kecil')
        return
      }
      setProofDataUrl(dataUrl)
      setProofName(file.name)
    } catch {
      toast.error('Gagal membaca file')
    }
  }

  const submitProof = async () => {
    if (!invoice) return
    if (!proofDataUrl) {
      toast.error('Unggah bukti pembayaran terlebih dahulu (JPG/PNG/PDF)')
      return
    }
    if (method === 'transfer_bank' && (!senderName.trim() || !transferDate)) {
      toast.error('Nama pengirim dan tanggal transfer wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await authFetch('/api/subscription/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          paymentMethod: method,
          senderName: method === 'transfer_bank' ? senderName.trim() : '',
          transferDate: method === 'transfer_bank' ? transferDate : '',
          proofDataUrl,
          proofFileName: proofName,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal mengirim bukti pembayaran')
        return
      }
      toast.success('Bukti pembayaran terkirim — menunggu verifikasi admin')
      setProofDataUrl('')
      setProofName('')
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setSubmitting(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Disalin ke clipboard')
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  const canPay = invoice && (invoice.status === 'menunggu_pembayaran' || invoice.status === 'ditolak')
  const lastRejected = payments.find((p) => p.status === 'ditolak')
  const pendingPayment = payments.find((p) => p.status === 'menunggu_verifikasi')
  const approvedPayment = payments.find((p) => p.status === 'disetujui')

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3">
          <Link
            href="/pilih-paket"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Kembali ke halaman pilih paket"
          >
            <ChevronLeft className="h-4 w-4" /> Kembali ke Pilih Paket
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Indikator langkah: Daftar ✓ → Pilih Paket ✓ → Pembayaran (Anda di sini) → Verifikasi → Selesai */}
        <StepIndicator step={3} className="mx-auto mb-8 max-w-3xl" />

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        ) : error || !invoice ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Gagal memuat tagihan</AlertTitle>
            <AlertDescription>{error || 'Tagihan tidak ditemukan.'}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {/* Ringkasan pesanan */}
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Tagihan {invoice.invoiceNumber}</CardTitle>
                  <Badge className={STATUS_META[invoice.status]?.className ?? ''}>
                    {STATUS_META[invoice.status]?.label ?? invoice.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Paket {invoice.planName}</div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-3xl font-extrabold tracking-tight">{rupiah(invoice.amount)}</span>
                      {typeof invoice.uniqueCode === 'number' && (
                        <Badge className="mb-1 bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300">
                          termasuk kode {String(invoice.uniqueCode).padStart(3, '0')}
                        </Badge>
                      )}
                      {invoice.originalPrice && invoice.originalPrice > invoice.amount && (
                        <span className="pb-1 text-sm text-muted-foreground line-through">{rupiah(invoice.originalPrice)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="flex items-center justify-end gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Bayar sebelum:{' '}
                      <b className={new Date(invoice.dueDate) < new Date() ? 'text-red-600' : ''}>
                        {new Date(invoice.dueDate).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </b>
                    </div>
                    <div className="mt-1">Periode: {invoice.plan.durationDays} hari</div>
                  </div>
                </div>
                {invoice.isPlanChange && (
                  <Alert className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Ini tagihan <b>ganti paket</b>. Paket baru berlaku setelah pembayaran disetujui admin;
                      masa aktif paket baru dihitung dari tanggal persetujuan.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Status: sudah disetujui */}
            {invoice.status === 'disetujui' && (
              <Alert className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <AlertTitle>Pembayaran disetujui</AlertTitle>
                <AlertDescription>
                  Langganan {invoice.planName} aktif. Lihat detail di{' '}
                  <Link href="/langganan-saya" className="font-semibold underline">Langganan Saya</Link>.
                </AlertDescription>
              </Alert>
            )}

            {/* Status: kedaluwarsa */}
            {invoice.status === 'kedaluwarsa' && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Tagihan kedaluwarsa</AlertTitle>
                <AlertDescription>
                  Batas waktu pembayaran telah lewat.{' '}
                  <Link href="/pilih-paket" className="font-semibold underline">Buat tagihan baru</Link>.
                </AlertDescription>
              </Alert>
            )}

            {/* Status: menunggu verifikasi */}
            {invoice.status === 'menunggu_verifikasi' && pendingPayment && (
              <Card className="rounded-2xl border-sky-200 dark:border-sky-900">
                <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="rounded-full bg-sky-100 p-4 dark:bg-sky-900/50">
                    <ShieldCheck className="h-8 w-8 text-sky-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">Menunggu Verifikasi Admin</div>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                      Bukti pembayaran Anda sudah diterima. Admin akan memeriksa dan menyetujui pembayaran —
                      langganan aktif otomatis setelah disetujui. Bukti transfer/QRIS tidak langsung
                      mengaktifkan langganan.
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
                    Metode: {pendingPayment.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'} ·{' '}
                    {rupiah(pendingPayment.amount)} · Diajukan{' '}
                    {new Date(pendingPayment.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Peringatan penolakan */}
            {lastRejected && canPay && (
              <Alert variant="destructive">
                <Ban className="h-4 w-4" />
                <AlertTitle>Pembayaran sebelumnya ditolak</AlertTitle>
                <AlertDescription>
                  Alasan: <b>{lastRejected.rejectionReason || '-'}</b>
                  {lastRejected.reviewedBy ? ` (oleh ${lastRejected.reviewedBy})` : ''}. Silakan perbaiki dan ajukan ulang di bawah.
                </AlertDescription>
              </Alert>
            )}

            {/* Form pembayaran */}
            {canPay && (
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Metode Pembayaran Manual</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <Tabs value={method} onValueChange={(v) => setMethod(v as 'qris' | 'transfer_bank')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="qris" className="gap-1.5"><QrCode className="h-4 w-4" /> QRIS</TabsTrigger>
                      <TabsTrigger value="transfer_bank" className="gap-1.5"><Landmark className="h-4 w-4" /> Transfer Bank</TabsTrigger>
                    </TabsList>

                    <TabsContent value="qris" className="mt-4 space-y-3">
                      {settings?.qrisImageUrl ? (
                        <div className="flex flex-col items-center gap-3">
                          { }
                          <img
                            src={settings.qrisImageUrl}
                            alt="QRIS resmi Darrellsoft"
                            className="h-56 w-56 rounded-xl border bg-white object-contain p-2"
                          />
                          <div className="text-center">
                            <div className="text-sm font-semibold">Scan dengan aplikasi pembayaran QRIS</div>
                            {settings.qrisReceiverName && (
                              <div className="text-xs text-muted-foreground">Penerima: <b>{settings.qrisReceiverName}</b></div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>QRIS belum diatur oleh admin. Silakan gunakan Transfer Bank.</AlertDescription>
                        </Alert>
                      )}
                    </TabsContent>

                    <TabsContent value="transfer_bank" className="mt-4 space-y-3">
                      {settings?.bankAccountNumber ? (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-4">
                            <div className="text-xs text-muted-foreground">Bank</div>
                            <div className="text-sm font-bold">{settings.bankName || '-'}</div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div>
                                <div className="text-xs text-muted-foreground">Nomor Rekening</div>
                                <div className="font-mono text-lg font-bold tracking-wide">{settings.bankAccountNumber}</div>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => copy(settings.bankAccountNumber)}>
                                <Copy className="mr-1 h-3.5 w-3.5" /> Salin
                              </Button>
                            </div>
                            <div className="mt-3">
                              <div className="text-xs text-muted-foreground">Atas Nama</div>
                              <div className="text-sm font-semibold">{settings.bankAccountName || '-'}</div>
                            </div>
                          </div>
                          {settings.paymentInstructions && (
                            <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                              {settings.paymentInstructions}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>Rekening transfer belum diatur oleh admin. Silakan gunakan QRIS.</AlertDescription>
                        </Alert>
                      )}
                    </TabsContent>
                  </Tabs>

                  <div className="rounded-xl border border-dashed p-4">
                    <div className="mb-3 text-sm font-semibold">Nominal Transfer</div>
                    {typeof invoice.uniqueCode === 'number' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Harga paket {invoice.planName}</span>
                          <span className="font-medium">{rupiah(invoice.amount - invoice.uniqueCode)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            Kode unik
                            <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300">
                              {String(invoice.uniqueCode).padStart(3, '0')}
                            </Badge>
                          </span>
                          <span className="font-medium">+{rupiah(invoice.uniqueCode)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2">
                          <span className="text-sm font-semibold">Total transfer</span>
                          <span className="text-2xl font-extrabold tracking-tight">{rupiah(invoice.amount)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Transfer <b>PERSIS</b> sesuai TOTAL (harga + kode unik 3 digit) — kode unik membuat
                          pembayaran Anda mudah dikenali dan tidak tertukar dengan pelanggan lain.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-extrabold">{rupiah(invoice.amount)}</span>
                          {invoice.originalPrice && invoice.originalPrice > invoice.amount && (
                            <span className="pb-0.5 text-sm text-muted-foreground line-through">{rupiah(invoice.originalPrice)}</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Transfer PERSIS sesuai nominal tagihan agar mudah diverifikasi.</p>
                      </>
                    )}
                  </div>

                  {method === 'transfer_bank' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="senderName">Nama Pengirim *</Label>
                        <Input
                          id="senderName"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="Nama pemilik rekening pengirim"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="transferDate">Tanggal Transfer *</Label>
                        <Input id="transferDate" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Unggah Bukti Pembayaran (JPG, PNG, atau PDF — maks 350KB) *</Label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      className="hidden"
                      onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                    >
                      {proofDataUrl ? (
                        proofDataUrl.startsWith('data:application/pdf') ? (
                          <>
                            <FileText className="h-8 w-8 text-emerald-600" />
                            <span className="font-medium text-foreground">{proofName} (PDF siap dikirim)</span>
                          </>
                        ) : (
                          <>
                            { }
                            <img src={proofDataUrl} alt="Pratinjau bukti pembayaran" className="max-h-40 rounded-lg border object-contain" />
                            <span className="font-medium text-foreground">{proofName} — klik untuk mengganti</span>
                          </>
                        )
                      ) : (
                        <>
                          <Upload className="h-8 w-8" />
                          <span>Klik untuk memilih file bukti transfer / bukti QRIS</span>
                          <span className="inline-flex items-center gap-1 text-xs">
                            <ImageIcon className="h-3 w-3" /> Gambar otomatis dikompres maks 350KB · PDF maks 350KB
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Catatan (opsional)</Label>
                    <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: transfer via m-banking jam 20.15" />
                  </div>

                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={submitProof}
                    disabled={submitting || !proofDataUrl}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengirim…
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" /> Kirim Bukti Pembayaran
                      </>
                    )}
                  </Button>
                  {!proofDataUrl && !submitting && (
                    <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                      Unggah bukti pembayaran terlebih dahulu untuk mengaktifkan tombol kirim.
                    </p>
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    Status tagihan berubah menjadi <b>Menunggu Verifikasi</b>. Langganan diaktifkan otomatis
                    hanya setelah admin menyetujui pembayaran.
                  </p>
                </CardContent>
              </Card>
            )}

            {approvedPayment && (
              <Alert className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <AlertTitle>
                  Disetujui oleh {approvedPayment.reviewedBy ?? 'admin'}{' '}
                  {approvedPayment.reviewedAt ? `— ${new Date(approvedPayment.reviewedAt).toLocaleString('id-ID')}` : ''}
                </AlertTitle>
                <AlertDescription>
                  <Link href="/langganan-saya" className="font-semibold underline">Lihat langganan & kuitansi</Link>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
