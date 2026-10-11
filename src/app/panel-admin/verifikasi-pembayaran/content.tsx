'use client'

// /panel-admin/verifikasi-pembayaran — Admin memeriksa bukti pembayaran.
// Tab: Menunggu Verifikasi | Disetujui | Ditolak.
// Setujui → langganan aktif/otomatis diperpanjang (IDEMPOTEN — persetujuan ganda
// tidak menambah masa aktif dua kali). Tolak → wajib isi alasan.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Landmark,
  QrCode,
  User,
  XCircle,
} from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

interface PaymentRow {
  id: string
  invoiceNumber: string
  planName: string
  invoiceAmount: number
  isPlanChange: boolean
  userId: string
  customer: { username: string; namaLengkap: string; email: string; nomorHP: string } | null
  paymentMethod: string
  amount: number
  senderName: string
  transferDate: string
  proofFileName: string
  hasProof: boolean
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string
  createdAt: string
}

export function VerifikasiPembayaranContent() {
  const [tab, setTab] = useState<'menunggu_verifikasi' | 'disetujui' | 'ditolak'>('menunggu_verifikasi')
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PaymentRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)
  const [proofView, setProofView] = useState<{ url: string; name: string; meta: PaymentRow } | null>(null)
  const [approveTarget, setApproveTarget] = useState<PaymentRow | null>(null)

  const load = useCallback(async () => {
    setRows(null)
    try {
      const res = await authFetch(`/api/panel-admin/payments?status=${tab}&limit=200`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat pembayaran')
        setRows([])
        return
      }
      setRows(json.payments ?? [])
    } catch {
      toast.error('Gagal terhubung ke server')
      setRows([])
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const openProof = async (p: PaymentRow) => {
    try {
      const res = await authFetch(`/api/subscription/proof/${p.id}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat bukti')
        return
      }
      setProofView({ url: json.proofFileUrl, name: json.proofFileName || 'bukti', meta: p })
    } catch {
      toast.error('Gagal memuat bukti')
    }
  }

  const approve = async (p: PaymentRow) => {
    setBusyId(p.id)
    try {
      const res = await authFetch('/api/panel-admin/payments/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: p.id, action: 'approve' }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.idempotent) {
          toast.info(json.error) // sudah diproses — tidak ada perubahan
        } else {
          toast.error(json.error || 'Gagal menyetujui')
        }
        return
      }
      toast.success(json.message + (json.newEndDate ? ` Berlaku hingga ${new Date(json.newEndDate).toLocaleDateString('id-ID')}` : ''))
      setApproveTarget(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async () => {
    if (!rejectTarget) return
    if (!rejectReason.trim()) {
      toast.error('Alasan penolakan wajib diisi')
      return
    }
    setRejectBusy(true)
    try {
      const res = await authFetch('/api/panel-admin/payments/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: rejectTarget.id, action: 'reject', reason: rejectReason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.idempotent) toast.info(json.error)
        else toast.error(json.error || 'Gagal menolak')
        return
      }
      toast.success('Pembayaran ditolak — pelanggan melihat alasannya')
      setRejectTarget(null)
      setRejectReason('')
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setRejectBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Verifikasi Pembayaran</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bukti transfer/QRIS tidak otomatis membuktikan uang masuk — periksa sebelum menyetujui.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" /> Muat Ulang
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="menunggu_verifikasi">Menunggu</TabsTrigger>
          <TabsTrigger value="disetujui">Disetujui</TabsTrigger>
          <TabsTrigger value="ditolak">Ditolak</TabsTrigger>
        </TabsList>
      </Tabs>

      {rows === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BadgeCheck className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {tab === 'menunggu_verifikasi' ? 'Tidak ada pembayaran menunggu verifikasi.' : tab === 'disetujui' ? 'Belum ada pembayaran disetujui.' : 'Belum ada pembayaran ditolak.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.id} className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold">{p.invoiceNumber}</span>
                      {p.isPlanChange && <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300">Ganti Paket</Badge>}
                      <Badge variant="outline" className="gap-1">
                        {p.paymentMethod === 'qris' ? <QrCode className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
                        {p.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /><b className="text-foreground">{p.customer?.namaLengkap ?? p.userId}</b>{p.customer?.username ? ` (@${p.customer.username})` : ''}</span>
                      {p.customer?.email && <span>{p.customer.email}</span>}
                      {p.customer?.nomorHP && <span>{p.customer.nomorHP}</span>}
                    </div>
                    <div className="text-sm">
                      Paket <b>{p.planName}</b> · Tagihan <b>{rupiah(p.invoiceAmount)}</b>
                      {p.amount !== p.invoiceAmount && <span className="ml-2 text-xs text-red-600">dibayar: {rupiah(p.amount)}!</span>}
                    </div>
                    {p.paymentMethod === 'transfer_bank' && (p.senderName || p.transferDate) && (
                      <div className="text-xs text-muted-foreground">
                        Pengirim: <b className="text-foreground">{p.senderName || '-'}</b> · Tgl transfer: {p.transferDate || '-'}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Diajukan {fmtDateTime(p.createdAt)}</div>
                    {p.status === 'ditolak' && p.rejectionReason && (
                      <div className="text-xs text-red-600">Ditolak: {p.rejectionReason}</div>
                    )}
                    {p.status === 'disetujui' && (
                      <div className="text-xs text-emerald-700 dark:text-emerald-400">
                        Disetujui oleh {p.reviewedBy ?? '-'} · {fmtDateTime(p.reviewedAt)}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {p.hasProof && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openProof(p)}>
                        <Eye className="h-3.5 w-3.5" /> Lihat Bukti
                      </Button>
                    )}
                    {p.status === 'menunggu_verifikasi' && (
                      <>
                        <Button
                          size="sm"
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          disabled={busyId === p.id}
                          onClick={() => setApproveTarget(p)}
                        >
                          {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          disabled={busyId === p.id}
                          onClick={() => {
                            setRejectTarget(p)
                            setRejectReason('')
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Tolak
                        </Button>
                      </>
                    )}
                    {p.status !== 'menunggu_verifikasi' && (
                      <Badge className={
                        p.status === 'disetujui'
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300'
                      }>
                        {p.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog bukti */}
      <Dialog open={!!proofView} onOpenChange={(v) => !v && setProofView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti Pembayaran — {proofView?.meta.invoiceNumber}</DialogTitle>
            <DialogDescription>
              {proofView?.meta.customer?.namaLengkap} · {rupiah(proofView?.meta.amount ?? 0)} ·{' '}
              {proofView?.meta.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'}
              {proofView?.meta.paymentMethod === 'transfer_bank' && proofView?.meta.senderName
                ? ` · Pengirim: ${proofView.meta.senderName} (${proofView.meta.transferDate || 'tgl -'})`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {proofView &&
            (proofView.url.startsWith('data:application/pdf') ? (
              <a href={proofView.url} download={proofView.name} className="flex items-center gap-2 rounded-lg border p-4 text-sm hover:bg-muted">
                <Clock className="h-5 w-5" /> Unduh file PDF: {proofView.name}
              </a>
            ) : (
               
              <img src={proofView.url} alt={`Bukti pembayaran ${proofView.meta.invoiceNumber}`} className="max-h-[65vh] w-full rounded-lg border object-contain" />
            ))}
          {proofView?.meta.status === 'menunggu_verifikasi' && (
            <DialogFooter>
              <Button
                variant="destructive"
                className="gap-1.5"
                onClick={() => {
                  setRejectTarget(proofView.meta)
                  setRejectReason('')
                  setProofView(null)
                }}
              >
                <XCircle className="h-3.5 w-3.5" /> Tolak
              </Button>
              <Button
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  const target = proofView.meta
                  setProofView(null)
                  setApproveTarget(target)
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Setujui
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi setujui */}
      <Dialog open={!!approveTarget} onOpenChange={(v) => !v && setApproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500" /> Setujui Pembayaran?</DialogTitle>
            <DialogDescription>
              {approveTarget?.customer?.namaLengkap} · {approveTarget?.invoiceNumber} · {rupiah(approveTarget?.amount ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <ul className="list-disc space-y-1 pl-4">
              <li>Langganan pelanggan otomatis <b>diaktifkan / diperpanjang</b> sesuai ketentuan.</li>
              <li>Perpanjangan sebelum berakhir → ditambahkan dari tanggal berakhir tercatat.</li>
              <li>Langganan baru / kedaluwarsa / ganti paket → periode baru dari hari persetujuan.</li>
              <li>Aksi ini <b>idempoten</b> — klik ganda tidak menambah masa aktif dua kali.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Batal</Button>
            <Button
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={!!approveTarget && busyId === approveTarget.id}
              onClick={() => approveTarget && approve(approveTarget)}
            >
              {busyId === approveTarget?.id && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle2 className="h-4 w-4" /> Ya, Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tolak dengan alasan */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => !v && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-500" /> Tolak Pembayaran</DialogTitle>
            <DialogDescription>
              {rejectTarget?.customer?.namaLengkap} · {rejectTarget?.invoiceNumber} · {rupiah(rejectTarget?.amount ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Alasan penolakan (wajib) — contoh: nominal transfer tidak sesuai tagihan / bukti tidak jelas"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={reject} disabled={rejectBusy} className="gap-1.5">
              {rejectBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              <XCircle className="h-4 w-4" /> Tolak Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
