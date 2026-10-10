'use client'

// /langganan-saya — Dashboard "Langganan Saya" (pelanggan).
// Tab: Ringkasan (paket aktif, status, tanggal, sisa hari, aksi) |
//      Tagihan (daftar tagihan + status verifikasi) |
//      Riwayat Pembayaran (bukti + kuitansi digital).
// Juga menampilkan notifikasi in-app langganan.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Info,
  PackageOpen,
  Printer,
  Receipt,
  RefreshCcw,
  Repeat,
  ShieldCheck,
  Ban,
  Hourglass,
} from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

const SUB_META: Record<string, { label: string; className: string }> = {
  belum_aktif: { label: 'Belum Aktif', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  aktif: { label: 'Aktif', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  akan_berakhir: { label: 'Akan Berakhir', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  kedaluwarsa: { label: 'Kedaluwarsa', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  ditangguhkan: { label: 'Ditangguhkan', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  dibatalkan: { label: 'Dibatalkan', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

const INV_META: Record<string, { label: string; className: string }> = {
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  kedaluwarsa: { label: 'Kedaluwarsa', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  dibatalkan: { label: 'Dibatalkan', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

const PAY_META: Record<string, { label: string; className: string }> = {
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

interface SubData {
  id: string
  status: string
  planName?: string | null
  startDate?: string | null
  endDate?: string | null
  daysLeft?: number | null
}

interface InvoiceItem {
  id: string
  invoiceNumber: string
  planName: string
  amount: number
  originalPrice: number | null
  status: string
  dueDate: string
  createdAt: string
  isPlanChange: boolean
  payments: PaymentItem[]
}

interface PaymentItem {
  id: string
  paymentMethod: string
  amount: number
  status: string
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string
  hasProof: boolean
  invoiceNumber?: string
  planName?: string
  senderName?: string
}

interface NotifItem {
  id: string
  title: string
  body: string
  type: string
  link: string
  isRead: boolean
  createdAt: string
}

export default function LanggananSayaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<SubData | null>(null)
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [notifications, setNotifications] = useState<NotifItem[]>([])

  // Kuitansi
  const [receipt, setReceipt] = useState<InvoiceItem | null>(null)
  // Bukti
  const [proofView, setProofView] = useState<{ url: string; name: string } | null>(null)
  const [proofLoading, setProofLoading] = useState(false)

  const load = useCallback(async () => {
    if (!getAuthUser()) {
      router.replace('/login?next=/langganan-saya')
      return
    }
    try {
      const res = await authFetch('/api/subscription/my')
      if (res.status === 401) {
        router.replace('/login?next=/langganan-saya')
        return
      }
      const json = await res.json()
      setSubscription(json.subscription ?? null)
      setInvoices(json.invoices ?? [])
      setNotifications(json.notifications ?? [])
    } catch {
      toast.error('Gagal memuat langganan')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  const openProof = async (paymentId: string) => {
    setProofLoading(true)
    try {
      const res = await authFetch(`/api/subscription/proof/${paymentId}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat bukti')
        return
      }
      setProofView({ url: json.proofFileUrl, name: json.proofFileName || 'bukti-pembayaran' })
    } finally {
      setProofLoading(false)
    }
  }

  const markAllRead = async () => {
    try {
      await authFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch { /* abaikan */ }
  }

  const status = subscription?.status ?? 'belum_aktif'
  const meta = SUB_META[status] ?? SUB_META.belum_aktif
  const openInvoice = invoices.find((i) => i.status === 'menunggu_pembayaran' || i.status === 'menunggu_verifikasi')

  // ===== KUITANSI =====
  const ReceiptDialog = () => {
    if (!receipt) return null
    const approved = receipt.payments.find((p) => p.status === 'disetujui')
    return (
      <Dialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt /> Kuitansi Digital</DialogTitle>
            <DialogDescription>Bukti pembayaran langganan resmi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border p-4 text-sm">
            <div className="text-center">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Kuitansi Darrellsoft</div>
              <div className="mt-1 font-mono text-sm font-bold">{receipt.invoiceNumber}</div>
            </div>
            <div className="my-2 border-t border-dashed" />
            <Row label="Paket" value={receipt.planName} />
            <Row label="Nominal" value={rupiah(receipt.amount)} bold />
            {receipt.originalPrice && receipt.originalPrice > receipt.amount && (
              <Row label="Harga normal" value={rupiah(receipt.originalPrice)} strike />
            )}
            <Row label="Metode" value={approved?.paymentMethod === 'transfer_bank' ? 'Transfer Bank' : 'QRIS (Manual)'} />
            {approved?.senderName ? <Row label="Pengirim" value={approved.senderName} /> : null}
            <Row label="Disetujui" value={fmtDateTime(approved?.reviewedAt)} />
            <Row label="Status" value="LUNAS" bold />
            <div className="my-2 border-t border-dashed" />
            <p className="text-center text-[10px] text-muted-foreground">
              Kuitansi ini dibuat otomatis oleh sistem Darrellsoft setelah pembayaran disetujui admin.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Cetak
            </Button>
            <Button onClick={() => setReceipt(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const Row = ({ label, value, bold, strike }: { label: string; value: string; bold?: boolean; strike?: boolean }) => (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${strike ? 'line-through text-muted-foreground' : ''}`}>{value}</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/pembukaan" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Beranda
          </Link>
          <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Link href="/pilih-paket"><PackageOpen className="mr-1.5 h-4 w-4" /> Pilih Paket</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Langganan Saya</h1>
        <p className="mt-1 text-sm text-muted-foreground">Status langganan, tagihan, riwayat pembayaran, dan kuitansi.</p>

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Peringatan status */}
            {status === 'kedaluwarsa' && (
              <Alert className="border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <AlertTitle>Masa langganan sudah berakhir</AlertTitle>
                <AlertDescription>
                  Data Anda tetap aman. Perpanjang langganan untuk memulihkan akses penuh —{' '}
                  <Link href="/pilih-paket" className="font-semibold underline">perpanjang sekarang</Link>.
                </AlertDescription>
              </Alert>
            )}
            {status === 'akan_berakhir' && (
              <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
                <Hourglass className="h-5 w-5 text-amber-600" />
                <AlertTitle>Langganan akan berakhir {subscription?.daysLeft != null ? `dalam ${subscription.daysLeft} hari` : ''}</AlertTitle>
                <AlertDescription>
                  Perpanjang sekarang agar masa aktif ditambahkan dari tanggal berakhir yang tercatat —{' '}
                  <Link href="/pilih-paket" className="font-semibold underline">perpanjang</Link>.
                </AlertDescription>
              </Alert>
            )}
            {status === 'ditangguhkan' && (
              <Alert className="border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40">
                <Ban className="h-5 w-5 text-orange-600" />
                <AlertTitle>Langganan ditangguhkan</AlertTitle>
                <AlertDescription>Hubungi admin untuk aktivasi kembali.</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="ringkasan">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
                <TabsTrigger value="tagihan">Tagihan{openInvoice ? ' •' : ''}</TabsTrigger>
                <TabsTrigger value="pembayaran">Riwayat Pembayaran</TabsTrigger>
              </TabsList>

              {/* ===== RINGKASAN ===== */}
              <TabsContent value="ringkasan" className="mt-4 space-y-5">
                <Card className="rounded-2xl">
                  <CardContent className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-5 w-5 text-emerald-600" />
                          <h2 className="text-lg font-bold">{subscription?.planName ?? 'Belum berlangganan'}</h2>
                          <Badge className={meta.className}>{meta.label}</Badge>
                        </div>
                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Tanggal Mulai</div>
                            <div className="mt-0.5 font-semibold">{fmtDate(subscription?.startDate)}</div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Tanggal Berakhir</div>
                            <div className="mt-0.5 font-semibold">{fmtDate(subscription?.endDate)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Sisa Hari</div>
                            <div className={`mt-0.5 font-bold ${status === 'kedaluwarsa' ? 'text-red-600' : status === 'akan_berakhir' ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {subscription?.daysLeft != null ? (subscription.daysLeft > 0 ? `${subscription.daysLeft} hari` : '0 hari') : '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" asChild>
                          <Link href="/pilih-paket"><RefreshCcw className="h-4 w-4" /> Perpanjang Langganan</Link>
                        </Button>
                        <Button variant="outline" className="gap-1.5" asChild>
                          <Link href="/pilih-paket"><Repeat className="h-4 w-4" /> Ganti Paket</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notifikasi langganan */}
                <Card className="rounded-2xl">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Notifikasi</CardTitle>
                    {notifications.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={markAllRead}>Tandai dibaca</Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">Belum ada notifikasi.</p>
                    ) : (
                      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            className={`rounded-xl border p-3 text-sm ${n.isRead ? 'bg-background' : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold">{n.title}</div>
                              <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                            {n.link && (
                              <Link href={n.link} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                                Buka <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ===== TAGIHAN ===== */}
              <TabsContent value="tagihan" className="mt-4">
                <Card className="rounded-2xl">
                  <CardContent className="p-0">
                    {invoices.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Belum ada tagihan.</p>
                        <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                          <Link href="/pilih-paket">Pilih Paket</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-4 py-3">Nomor</th>
                              <th className="px-4 py-3">Paket</th>
                              <th className="px-4 py-3">Nominal</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Jatuh Tempo</th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoices.map((inv) => {
                              const m = INV_META[inv.status] ?? INV_META.menunggu_pembayaran
                              const canPay = inv.status === 'menunggu_pembayaran' || inv.status === 'ditolak'
                              const hasReceipt = inv.status === 'disetujui'
                              return (
                                <tr key={inv.id} className="border-b last:border-0">
                                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                                  <td className="px-4 py-3">
                                    {inv.planName}
                                    {inv.isPlanChange && <span className="ml-1 text-[10px] text-sky-600">(ganti paket)</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-semibold">{rupiah(inv.amount)}</span>
                                    {inv.originalPrice && inv.originalPrice > inv.amount && (
                                      <span className="ml-1.5 text-xs text-muted-foreground line-through">{rupiah(inv.originalPrice)}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3"><Badge className={m.className}>{m.label}</Badge></td>
                                  <td className="px-4 py-3 text-xs">{fmtDateTime(inv.dueDate)}</td>
                                  <td className="px-4 py-3 text-right">
                                    {canPay && (
                                      <Button asChild size="sm" variant="outline">
                                        <Link href={`/langganan/pembayaran/${inv.id}`}>
                                          {inv.status === 'ditolak' ? 'Ajukan Ulang' : 'Bayar'}
                                        </Link>
                                      </Button>
                                    )}
                                    {inv.status === 'menunggu_verifikasi' && (
                                      <Button asChild size="sm" variant="ghost">
                                        <Link href={`/langganan/pembayaran/${inv.id}`}>Detail</Link>
                                      </Button>
                                    )}
                                    {hasReceipt && (
                                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setReceipt(inv)}>
                                        <FileText className="h-3.5 w-3.5" /> Kuitansi
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ===== RIWAYAT PEMBAYARAN ===== */}
              <TabsContent value="pembayaran" className="mt-4">
                <Card className="rounded-2xl">
                  <CardContent className="p-0">
                    {invoices.flatMap((i) => i.payments.map((p) => ({ ...p, invoiceNumber: i.invoiceNumber, planName: i.planName }))).length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <ShieldCheck className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-4 py-3">Tagihan</th>
                              <th className="px-4 py-3">Metode</th>
                              <th className="px-4 py-3">Nominal</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Diajukan</th>
                              <th className="px-4 py-3 text-right">Bukti</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoices
                              .flatMap((i) => i.payments.map((p) => ({ ...p, invoiceNumber: i.invoiceNumber, planName: i.planName })))
                              .map((p) => {
                                const m = PAY_META[p.status] ?? PAY_META.menunggu_verifikasi
                                return (
                                  <tr key={p.id} className="border-b last:border-0">
                                    <td className="px-4 py-3 font-mono text-xs">{p.invoiceNumber}</td>
                                    <td className="px-4 py-3 text-xs">{p.paymentMethod === 'transfer_bank' ? 'Transfer Bank' : 'QRIS'}</td>
                                    <td className="px-4 py-3 font-semibold">{rupiah(p.amount)}</td>
                                    <td className="px-4 py-3">
                                      <Badge className={m.className}>{m.label}</Badge>
                                      {p.status === 'ditolak' && p.rejectionReason && (
                                        <div className="mt-1 max-w-52 text-[10px] text-red-600">Alasan: {p.rejectionReason}</div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-xs">{fmtDateTime(p.createdAt)}</td>
                                    <td className="px-4 py-3 text-right">
                                      {p.hasProof ? (
                                        <Button size="sm" variant="ghost" className="gap-1" disabled={proofLoading} onClick={() => openProof(p.id)}>
                                          <Eye className="h-3.5 w-3.5" /> Lihat
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* Dialog bukti pembayaran */}
      <Dialog open={!!proofView} onOpenChange={(v) => !v && setProofView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bukti Pembayaran</DialogTitle>
            <DialogDescription>{proofView?.name}</DialogDescription>
          </DialogHeader>
          {proofView && (
            proofView.url.startsWith('data:application/pdf') ? (
              <a href={proofView.url} download={proofView.name} className="flex items-center gap-2 rounded-lg border p-4 text-sm hover:bg-muted">
                <FileText className="h-5 w-5" /> Unduh file PDF bukti pembayaran
              </a>
            ) : (
               
              <img src={proofView.url} alt="Bukti pembayaran" className="max-h-[60vh] w-full rounded-lg border object-contain" />
            )
          )}
        </DialogContent>
      </Dialog>

      <ReceiptDialog />

      {/* Info footer */}
      <div className="mx-auto max-w-5xl px-4 pb-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Langganan diaktifkan otomatis setelah admin menyetujui pembayaran — bukti transfer/QRIS tidak
            langsung mengaktifkan langganan. Data Anda tidak pernah dihapus walau langganan berakhir.
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          <CheckCircle2 className="h-3 w-3" /> Satu akun = satu langganan · Pembayaran bulanan · Verifikasi manual admin
        </div>
      </div>
    </div>
  )
}
