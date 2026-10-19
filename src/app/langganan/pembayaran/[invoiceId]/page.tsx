'use client'

// /langganan/pembayaran/[invoiceId] — Pembayaran Manual (QRIS / Transfer Bank)
// Port dari implementasi standalone (/pembayaran/[id]) ke backend langganan
// Darrell Soft. Alur: rincian tagihan (harga paket + kode unik + total) →
// instruksi QRIS/Transfer Bank → konfirmasi pembayaran TANPA unggah bukti
// foto/PDF (dihapus sesuai permintaan — admin verifikasi manual) → status
// "Menunggu Verifikasi" → admin setujui.

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StepIndicator } from '@/components/darrellsoft/step-indicator'
import { SiteFooter } from '@/components/darrellsoft/site-footer'
import { getAuthHeaders } from '@/lib/auth-fetch'
import { getAuthUser } from '@/lib/auth'
import { apiFetch } from '@/lib/subscription-client'
import {
  daysLeft,
  formatDateTime,
  formatRupiah,
  formatUniqueCode,
} from '@/lib/subscription-format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  Hourglass,
  Info,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react'

type Invoice = {
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

type PaymentRow = {
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

type PaymentSettings = {
  qrisImageUrl: string | null
  qrisReceiverName: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
  paymentInstructions: string | null
  paymentDueHours: number | null
}

// Status server selalu lowercase Indonesia — label & warna badge per status
// mengikuti implementasi standalone (PENDING→menunggu_pembayaran, dst).
const STATUS_META: Record<string, { label: string; className: string }> = {
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', className: 'bg-sky-600 text-white hover:bg-sky-600' },
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  ditolak: { label: 'Ditolak', className: 'bg-destructive text-white hover:bg-destructive' },
  kedaluwarsa: { label: 'Kedaluwarsa', className: 'bg-muted text-muted-foreground hover:bg-muted' },
  dibatalkan: { label: 'Dibatalkan', className: 'bg-muted text-muted-foreground hover:bg-muted' },
}

function PembayaranContent() {
  const params = useParams<{ invoiceId: string }>()
  const router = useRouter()
  const invoiceId = params?.invoiceId ?? ''

  const [authReady, setAuthReady] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [customerName, setCustomerName] = useState('')

  // Form konfirmasi pembayaran (tanpa unggah bukti foto/PDF)
  const [method, setMethod] = useState<'qris' | 'transfer_bank'>('qris')
  const [senderName, setSenderName] = useState('')
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)

  const loadInvoice = useCallback(async () => {
    try {
      const res = await apiFetch<{
        invoice: Invoice
        payments: PaymentRow[]
        settings: PaymentSettings | null
      }>(`/api/subscription/invoice/${invoiceId}`)
      setInvoice(res.invoice)
      setPayments(res.payments ?? [])
      setSettings(res.settings ?? null)
      setInvoiceError(null)
      // Prefill metode & nama pengirim dari pembayaran terakhir (jika ada)
      const last = (res.payments ?? [])[0]
      if (last) {
        setMethod(last.paymentMethod === 'transfer_bank' ? 'transfer_bank' : 'qris')
        if (last.paymentMethod === 'transfer_bank' && last.senderName) setSenderName(last.senderName)
      } else {
        const s = res.settings ?? null
        setMethod(s?.bankAccountNumber && !s?.qrisImageUrl ? 'transfer_bank' : 'qris')
      }
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : 'Tagihan tidak ditemukan')
    }
  }, [invoiceId])

  useEffect(() => {
    const headers = getAuthHeaders()
    if (!headers['x-user-id']) {
      router.replace(`/login?next=/langganan/pembayaran/${invoiceId}`)
      return
    }
    setAuthReady(true)
    // Fallback nama dari localStorage sebelum data /my datang
    const authUser = getAuthUser()
    setCustomerName(authUser?.name || authUser?.username || '')
    void loadInvoice()
    // Nama pelanggan untuk chip identitas — diambil paralel, gagal = non-fatal
    void (async () => {
      try {
        const res = await apiFetch<{ user: { namaLengkap?: string | null; nama?: string | null } }>(
          '/api/subscription/my',
        )
        setCustomerName(res.user?.namaLengkap || res.user?.nama || '')
      } catch {
        // biarkan fallback localStorage
      }
    })()
  }, [loadInvoice, invoiceId, router])

  const canPay = invoice?.status === 'menunggu_pembayaran' || invoice?.status === 'ditolak'
  const lastRejected = payments.find((p) => p.status === 'ditolak') ?? null
  const latestPayment = payments[0] ?? null
  const hargaPaket = invoice
    ? invoice.uniqueCode != null
      ? invoice.amount - invoice.uniqueCode
      : invoice.amount
    : 0

  const handleSubmitProof = async () => {
    if (!invoice) return
    if (method === 'transfer_bank' && senderName.trim().length < 2) {
      toast.error('Nama pengirim minimal 2 karakter')
      return
    }
    setSubmitting(true)
    try {
      await apiFetch('/api/subscription/payment', {
        json: {
          invoiceId: invoice.id,
          paymentMethod: method,
          senderName: senderName.trim(),
          transferDate, // 'YYYY-MM-DD' — dikirim mentah sesuai kontrak backend
          // Tanpa unggah bukti foto/PDF — admin verifikasi manual
          proofDataUrl: '',
          proofFileName: '',
        },
      })
      toast.success('Konfirmasi pembayaran terkirim — menunggu verifikasi admin')
      await loadInvoice()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengirim konfirmasi, coba lagi')
    } finally {
      setSubmitting(false)
    }
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} disalin`)
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
          <Link
            href="/pilih-paket"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Kembali"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <StepIndicator step={3} className="mx-auto mb-8 max-w-3xl" />

        {invoiceError && (
          <Alert variant="destructive" className="mx-auto max-w-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Tagihan tidak ditemukan</AlertTitle>
            <AlertDescription>
              {invoiceError}{' '}
              <Link href="/pilih-paket" className="underline">
                Kembali ke pilih paket
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {!invoice && !invoiceError && (
          <div className="mx-auto max-w-2xl space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {invoice && (
          <div className="space-y-5">
            {/* Banner status */}
            {invoice.status === 'menunggu_verifikasi' && (
              <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
                <Hourglass className="h-4 w-4 text-amber-600" />
                <AlertTitle>Pembayaran sedang diperiksa admin</AlertTitle>
                <AlertDescription>
                  Konfirmasi pembayaran Anda sudah diterima dan menunggu verifikasi. Langganan akan
                  aktif otomatis setelah admin menyetujui pembayaran Anda.
                </AlertDescription>
              </Alert>
            )}
            {invoice.status === 'disetujui' && (
              <Alert className="border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle>Pembayaran disetujui!</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Langganan paket {invoice.planName} sudah aktif. Selamat menggunakan Darrellsoft!
                  </span>
                  <Button size="sm" asChild>
                    <Link href="/langganan-saya">Lihat Langganan Saya</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {invoice.status === 'ditolak' && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Pembayaran ditolak admin</AlertTitle>
                <AlertDescription>
                  Alasan: {lastRejected?.rejectionReason || '-'}.
                  <br />
                  Silakan periksa kembali dan unggah ulang bukti pembayaran, atau{' '}
                  <Link href="/pilih-paket" className="underline">
                    pilih paket lagi
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            )}
            {(invoice.status === 'kedaluwarsa' || invoice.status === 'dibatalkan') && (
              <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
                <Clock className="h-4 w-4 text-amber-600" />
                <AlertTitle>
                  {invoice.status === 'kedaluwarsa' ? 'Tagihan kedaluwarsa' : 'Tagihan dibatalkan'}
                </AlertTitle>
                <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Tagihan ini tidak dapat dibayar lagi. Pilih paket untuk melanjutkan langganan
                    paket {invoice.planName}.
                  </span>
                  <Button size="sm" asChild>
                    <Link href="/pilih-paket">
                      <RefreshCw className="h-4 w-4" /> Pilih Paket Lagi
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Rincian tagihan */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Tagihan {invoice.invoiceNumber}</CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" /> {customerName || 'Pelanggan'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> Dibuat {formatDateTime(invoice.createdAt)}
                    </span>
                  </CardDescription>
                </div>
                <Badge className={cn('px-3 py-1', STATUS_META[invoice.status]?.className)}>
                  {STATUS_META[invoice.status]?.label ?? invoice.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 rounded-lg border p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Paket</span>
                      <span className="font-medium">{invoice.planName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Durasi</span>
                      <span>{invoice.plan.durationDays} hari</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Harga paket</span>
                      <span>
                        {formatRupiah(hargaPaket)}
                        {invoice.originalPrice != null && invoice.originalPrice > invoice.amount && (
                          <span className="ml-2 text-xs text-muted-foreground line-through">
                            {formatRupiah(invoice.originalPrice)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kode unik</span>
                      <span className="font-mono font-semibold text-primary">
                        {formatUniqueCode(invoice.uniqueCode)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium">Total transfer</span>
                      <span className="text-xl font-bold text-primary">{formatRupiah(invoice.amount)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-dashed p-4">
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="font-medium">Batas waktu pembayaran</p>
                        <p className="text-muted-foreground">{formatDateTime(invoice.dueDate)}</p>
                        {invoice.status === 'menunggu_pembayaran' && (
                          <p className="mt-1 text-xs text-amber-600">
                            Sisa {daysLeft(invoice.dueDate)} hari lagi
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {invoice.isPlanChange && (
                  <Alert className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Ini tagihan <b>ganti paket</b>. Paket baru berlaku setelah pembayaran disetujui
                      admin; masa aktif paket baru dihitung dari tanggal persetujuan.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Metode pembayaran — hanya bila masih bisa dibayar */}
            {canPay && settings && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cara Pembayaran</CardTitle>
                  <CardDescription>
                    Transfer <strong className="text-foreground">{formatRupiah(invoice.amount)}</strong>
                    {invoice.uniqueCode != null && (
                      <>
                        {' '}(harga paket + kode unik{' '}
                        <strong className="font-mono text-primary">{formatUniqueCode(invoice.uniqueCode)}</strong>)
                      </>
                    )}{' '}
                    melalui salah satu metode berikut.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {settings.qrisImageUrl || settings.bankAccountNumber ? (
                    <Tabs defaultValue={settings.qrisImageUrl ? 'qris' : 'bank'} className="w-full">
                      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto">
                        {settings.qrisImageUrl && (
                          <TabsTrigger value="qris" className="gap-1.5">
                            <QrCode className="h-4 w-4" /> QRIS
                          </TabsTrigger>
                        )}
                        {settings.bankAccountNumber && (
                          <TabsTrigger value="bank" className="gap-1.5">
                            <Banknote className="h-4 w-4" /> Transfer Bank
                          </TabsTrigger>
                        )}
                      </TabsList>

                      {settings.qrisImageUrl && (
                        <TabsContent value="qris" className="pt-4">
                          <div className="flex flex-col items-center gap-3 rounded-lg border p-5 sm:flex-row sm:items-start sm:gap-6">
                            <img
                              src={settings.qrisImageUrl}
                              alt="Kode QRIS pembayaran Darrellsoft"
                              className="h-48 w-48 rounded-lg border bg-white p-2"
                            />
                            <div className="space-y-2 text-sm">
                              <p className="font-medium">Scan QRIS dengan aplikasi pembayaran apa pun</p>
                              <p className="text-muted-foreground">
                                GoPay, OVO, DANA, ShopeePay, LinkAja, dan mobile banking yang
                                mendukung QRIS.
                              </p>
                              {settings.qrisReceiverName && (
                                <p className="text-muted-foreground">
                                  Penerima: <strong className="text-foreground">{settings.qrisReceiverName}</strong>
                                </p>
                              )}
                              <p className="text-muted-foreground">
                                Pastikan nominal transfer{' '}
                                <strong className="text-foreground">{formatRupiah(invoice.amount)}</strong> agar
                                admin dapat mengenali pembayaran Anda.
                              </p>
                            </div>
                          </div>
                        </TabsContent>
                      )}

                      {settings.bankAccountNumber && (
                        <TabsContent value="bank" className="pt-4">
                          <div className="space-y-3 rounded-lg border p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Bank tujuan</p>
                                <p className="text-lg font-semibold">{settings.bankName || '-'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Nomor rekening</p>
                                <p className="font-mono text-lg font-semibold tracking-wide">
                                  {settings.bankAccountNumber}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11"
                                onClick={() => copy(settings.bankAccountNumber ?? '', 'Nomor rekening')}
                              >
                                <Copy className="mr-1.5 h-3.5 w-3.5" /> Salin
                              </Button>
                            </div>
                            <Separator />
                            <p className="text-sm text-muted-foreground">
                              Atas nama: <strong className="text-foreground">{settings.bankAccountName || '-'}</strong>
                            </p>
                            {settings.paymentInstructions && (
                              <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                                {settings.paymentInstructions}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Nominal transfer (termasuk kode unik)
                                </p>
                                <p className="font-mono text-lg font-bold text-primary">
                                  {formatRupiah(invoice.amount)}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11"
                                onClick={() => copy(String(invoice.amount), 'Nominal transfer')}
                              >
                                <Copy className="mr-1.5 h-3.5 w-3.5" /> Salin nominal
                              </Button>
                            </div>
                          </div>
                        </TabsContent>
                      )}
                    </Tabs>
                  ) : (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Metode pembayaran belum diatur oleh admin. Silakan hubungi admin.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Form konfirmasi — hanya bila masih bisa dibayar */}
            {canPay && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Konfirmasi Pembayaran</CardTitle>
                  <CardDescription>
                    Setelah transfer sesuai nominal, kirim konfirmasi di bawah ini. Admin akan
                    memverifikasi pembayaran Anda.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="senderName">Nama pengirim</Label>
                      <Input
                        id="senderName"
                        className="min-h-11"
                        placeholder="Nama di rekening pengirim"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="transferDate">Tanggal transfer</Label>
                      <Input
                        id="transferDate"
                        type="date"
                        className="min-h-11"
                        max={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Metode pembayaran</Label>
                    <div className="flex gap-2">
                      {(['qris', 'transfer_bank'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          className={cn(
                            'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
                            method === m
                              ? 'border-primary bg-accent text-accent-foreground'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {m === 'qris' ? <QrCode className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                          {m === 'qris' ? 'QRIS' : 'Transfer Bank'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    size="lg"
                    disabled={submitting}
                    onClick={() => void handleSubmitProof()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengirim...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Kirim Konfirmasi Pembayaran
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Setelah dikirim, status berubah menjadi <strong>Menunggu Verifikasi</strong>.
                    Langganan aktif setelah admin menyetujui pembayaran Anda.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Konfirmasi terkirim — tampilkan ringkasan */}
            {!canPay && latestPayment && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Konfirmasi Pembayaran Terkirim</CardTitle>
                  <CardDescription>
                    Metode: {latestPayment.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'} • Pengirim:{' '}
                    {latestPayment.senderName || '-'} •{' '}
                    {latestPayment.transferDate ? formatDateTime(latestPayment.transferDate) : '-'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {latestPayment.proofFileName && latestPayment.proofFileName.toLowerCase().endsWith('.pdf') ? (
                    <p className="text-sm text-muted-foreground">
                      File bukti: {latestPayment.proofFileName} (PDF)
                    </p>
                  ) : latestPayment.proofFileName ? (
                    <ProofImage paymentId={latestPayment.id} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Tanpa unggah bukti — admin akan memverifikasi pembayaran Anda secara manual.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}

/** Viewer bukti pembayaran via /api/subscription/proof/[paymentId] (pemilik/admin). */
function ProofImage({ paymentId }: { paymentId: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<{ proofFileUrl: string | null }>(`/api/subscription/proof/${paymentId}`)
        if (!cancelled && res.proofFileUrl) setSrc(res.proofFileUrl)
      } catch {
        // biarkan kosong — skeleton tetap tampil
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paymentId])

  if (!src) return null

  return <img src={src} alt="Bukti pembayaran" className="max-h-64 rounded-lg border object-contain" />
}

export default function PembayaranPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PembayaranContent />
    </Suspense>
  )
}
