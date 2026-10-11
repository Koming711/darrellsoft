'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Search, UserPlus, UserCheck, UserX, Clock, CalendarClock,
  ShieldCheck, ShieldX, RefreshCw, Inbox, Eye, Landmark, QrCode, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { panelFetch } from './panel-fetch'

export type KategoriAkun = 'baru' | 'aktif' | 'expired' | 'ditolak'

export interface AkunItem {
  id: string
  nama: string
  username: string | null
  nomorHP: string
  email: string
  role: string
  status: string
  expiredDate: string | null
  catatan: string
  createdAt: string
}

interface AkunData {
  kategori: KategoriAkun
  counts: Record<KategoriAkun, number>
  items: AkunItem[]
}

const rupiahTint: Record<KategoriAkun, string> = {
  baru: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  aktif: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
  expired: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40',
  ditolak: 'text-red-600 bg-red-50 dark:bg-red-950/40',
}

const KATEGORI_LABEL: Record<KategoriAkun, string> = {
  baru: 'Akun Baru',
  aktif: 'Akun Aktif',
  expired: 'Akun Expired',
  ditolak: 'Akun Ditolak',
}

const ROLE_TINT: Record<string, string> = {
  demo: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  owner: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  user: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  pembeli: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}
const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1)

const fmtTanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Tagihan langganan + bukti transfer milik akun pelanggan (perpanjangan). */
interface RenewalPayment {
  id: string
  paymentMethod: string
  amount: number
  senderName: string
  transferDate: string
  proofFileName: string
  hasProof: boolean
  status: string
  rejectionReason: string
  createdAt: string
}

interface RenewalInvoice {
  id: string
  invoiceNumber: string
  planName: string
  amount: number
  status: string
  createdAt: string
  payments: RenewalPayment[]
}

const PAY_META: Record<string, { label: string; className: string }> = {
  menunggu_verifikasi: { label: 'Nunggu Verifikasi', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

const INV_META: Record<string, { label: string; className: string }> = {
  menunggu_pembayaran: { label: 'Belum Bayar', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  menunggu_verifikasi: { label: 'Nunggu Verifikasi', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

/**
 * Halaman DAFTAR AKUN Panel Admin — dipakai 4 menu:
 * Akun Baru (perlu verifikasi), Akun Aktif, Akun Expired, Akun Ditolak.
 */
export function AkunListPage({ kategori }: { kategori: KategoriAkun }) {
  const router = useRouter()
  const [data, setData] = useState<AkunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const [extendTarget, setExtendTarget] = useState<AkunItem | null>(null)
  const [extendMonths, setExtendMonths] = useState('1')
  const [extendBusy, setExtendBusy] = useState(false)
  const [renewalInvoices, setRenewalInvoices] = useState<RenewalInvoice[] | null>(null)
  const [renewalError, setRenewalError] = useState('')
  const [proofBusyId, setProofBusyId] = useState<string | null>(null)
  const [proofView, setProofView] = useState<{ url: string; name: string; title: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    panelFetch<AkunData>(`/api/panel-admin/akun?status=${kategori}`)
      .then(({ data, error, authError }) => {
        if (authError) return
        if (error) setError(error)
        else { setData(data); setError('') }
      })
      .finally(() => setLoading(false))
  }, [kategori])

  useEffect(() => { load() }, [load])

  const act = async (item: AkunItem, action: 'verifikasi' | 'tolak' | 'aktifkan') => {
    setActing(item.id + action)
    const { data, error, authError } = await panelFetch<{ success: boolean; message: string }>(
      '/api/panel-admin/akun',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action }),
      }
    )
    setActing(null)
    if (authError) return
    if (error) { toast.error(error); return }
    toast.success(data?.message || 'Berhasil.')
    load()
  }

  const submitExtend = async () => {
    if (!extendTarget) return
    const months = Math.max(1, parseInt(extendMonths, 10) || 1)
    const action = extendTarget.status === 'ditolak' && kategori === 'ditolak' ? 'aktifkan' : 'perpanjang'
    setExtendBusy(true)
    const { data, error, authError } = await panelFetch<{ success: boolean; message: string }>(
      '/api/panel-admin/akun',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: extendTarget.id, action, months }),
      }
    )
    setExtendBusy(false)
    if (authError) return
    if (error) { toast.error(error); return }
    toast.success(data?.message || 'Berhasil.')
    setExtendTarget(null)
    load()
  }

  /** Buka dialog perpanjang + muat bukti transfer perpanjangan akun ini. */
  const openExtendDialog = (it: AkunItem) => {
    setExtendTarget(it)
    setExtendMonths('1')
    setRenewalInvoices(null)
    setRenewalError('')
    setProofView(null)
    panelFetch<{ invoices: RenewalInvoice[] }>(`/api/panel-admin/akun/renewal-payments?id=${it.id}`)
      .then(({ data, error, authError }) => {
        if (authError) return
        if (error) { setRenewalError(error); setRenewalInvoices([]); return }
        setRenewalInvoices(data?.invoices ?? [])
      })
      .catch(() => {
        setRenewalError('Gagal memuat bukti transfer.')
        setRenewalInvoices([])
      })
  }

  /** Lihat bukti transfer (gambar/PDF data URL) — diambil on-demand. */
  const openProof = async (paymentId: string, invoiceNumber: string) => {
    setProofBusyId(paymentId)
    try {
      const { data, error, authError } = await panelFetch<{ proofFileUrl: string; proofFileName: string }>(
        `/api/subscription/proof/${paymentId}`
      )
      if (authError) return
      if (error || !data?.proofFileUrl) { toast.error(error || 'Bukti tidak tersedia.'); return }
      setProofView({ url: data.proofFileUrl, name: data.proofFileName || 'bukti', title: invoiceNumber })
    } catch {
      toast.error('Gagal memuat bukti transfer.')
    } finally {
      setProofBusyId(null)
    }
  }

  const items = (data?.items || []).filter(it => {
    if (!q.trim()) return true
    const s = q.toLowerCase()
    return [it.nama, it.username, it.nomorHP, it.email].some(v => (v || '').toLowerCase().includes(s))
  })

  const countCards: { key: KategoriAkun; icon: typeof UserPlus }[] = [
    { key: 'baru', icon: UserPlus },
    { key: 'aktif', icon: UserCheck },
    { key: 'expired', icon: Clock },
    { key: 'ditolak', icon: UserX },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      {/* Ringkasan 4 kategori akun — bisa diklik untuk pindah kategori */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {countCards.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => router.push(`/panel-admin/pelanggan?tab=${c.key}`)}
            className={`text-left bg-card rounded-xl border p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
              c.key === kategori ? 'border-primary ring-1 ring-primary' : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${rupiahTint[c.key]}`}>
              <c.icon className="w-4.5 h-4.5" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-foreground leading-tight">
              {data ? data.counts[c.key] : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{KATEGORI_LABEL[c.key]}</p>
          </button>
        ))}
      </div>

      {/* Toolbar: cari + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Cari nama, username, No. HP, email…"
            className="pl-9"
            aria-label="Cari akun"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Muat ulang
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {data && !loading && (
        items.length === 0 ? (
          <div className="bg-card rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {q
                ? 'Tidak ada akun yang cocok dengan pencarian.'
                : kategori === 'baru'
                  ? 'Tidak ada akun baru yang menunggu verifikasi. 🎉'
                  : `Belum ada akun di kategori ${KATEGORI_LABEL[kategori]}.`}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-muted/60 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Akun</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Kontak</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Masa Berlaku</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Tanggal Daftar</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const expired = it.expiredDate ? new Date(it.expiredDate) : null
                    const isExpired = expired && expired < new Date()
                    return (
                      <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground max-w-44 truncate" title={it.nama}>{it.nama}</p>
                          <p className="text-xs text-muted-foreground">{it.username || `#${it.id.slice(-6)}`}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          <p className="whitespace-nowrap">{it.nomorHP || '—'}</p>
                          <p className="text-xs max-w-40 truncate" title={it.email}>{it.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_TINT[it.role] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {roleLabel(it.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                          {it.expiredDate ? (
                            <span className={isExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-foreground'}>
                              {fmtTanggal(it.expiredDate)}
                              {isExpired && <span className="block text-[11px] text-muted-foreground">kedaluwarsa</span>}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell whitespace-nowrap">{fmtTanggal(it.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {kategori === 'baru' && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  disabled={acting === it.id + 'verifikasi'}
                                  onClick={() => act(it, 'verifikasi')}
                                >
                                  {acting === it.id + 'verifikasi' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                  Verifikasi
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/40"
                                  disabled={acting === it.id + 'tolak'}
                                  onClick={() => act(it, 'tolak')}
                                >
                                  <ShieldX className="w-3.5 h-3.5" /> Tolak
                                </Button>
                              </>
                            )}
                            {kategori === 'aktif' && (
                              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openExtendDialog(it)}>
                                <CalendarClock className="w-3.5 h-3.5" /> Perpanjang
                              </Button>
                            )}
                            {kategori === 'expired' && (
                              <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openExtendDialog(it)}>
                                <CalendarClock className="w-3.5 h-3.5" /> Aktifkan
                              </Button>
                            )}
                            {kategori === 'ditolak' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1"
                                disabled={acting === it.id + 'aktifkan'}
                                onClick={() => act(it, 'aktifkan')}
                              >
                                {acting === it.id + 'aktifkan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                Pulihkan
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Dialog perpanjang / aktifkan — menampilkan bukti transfer perpanjangan */}
      <Dialog
        open={!!extendTarget}
        onOpenChange={open => {
          if (!open) { setExtendTarget(null); setRenewalInvoices(null); setRenewalError(''); setProofView(null) }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {extendTarget?.status === 'ditolak' ? 'Aktifkan Akun' : kategori === 'expired' ? 'Aktifkan Kembali Akun' : 'Perpanjang Masa Berlaku'}
            </DialogTitle>
            <DialogDescription>
              {extendTarget?.nama} — tentukan berapa bulan masa berlaku tambahannya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="extend-months">Masa berlaku (bulan)</Label>
            <Input
              id="extend-months"
              type="number"
              min={1}
              max={120}
              value={extendMonths}
              onChange={e => setExtendMonths(e.target.value)}
            />
          </div>

          {/* Bukti transfer perpanjangan dari pelanggan */}
          <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Receipt className="w-3.5 h-3.5" /> Bukti Transfer Perpanjangan
            </p>
            {renewalInvoices === null ? (
              <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat bukti transfer…
              </div>
            ) : renewalError ? (
              <p className="py-1.5 text-xs text-red-600">{renewalError}</p>
            ) : renewalInvoices.length === 0 ? (
              <p className="py-1.5 text-xs text-muted-foreground">
                Belum ada bukti transfer untuk perpanjangan — tagihan langganan akun ini belum dibayar via aplikasi.
                Perpanjangan manual tetap bisa dilanjutkan bila transfer diterima di luar aplikasi.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
                {renewalInvoices.map(inv => {
                  const invMeta = INV_META[inv.status] ?? INV_META.menunggu_pembayaran
                  return (
                    <div key={inv.id} className="space-y-1.5 rounded-lg border bg-card p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold">{inv.invoiceNumber}</span>
                        <Badge className={`px-1.5 py-0 text-[9px] ${invMeta.className}`}>{invMeta.label}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Paket <b className="text-foreground">{inv.planName}</b> · Tagihan{' '}
                        <b className="text-foreground">{rupiah(inv.amount)}</b> · {fmtDateTime(inv.createdAt)}
                      </p>
                      {inv.payments.length === 0 ? (
                        <p className="text-[11px] italic text-muted-foreground">
                          Belum ada pembayaran / bukti transfer untuk tagihan ini.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {inv.payments.map(p => {
                            const meta = PAY_META[p.status] ?? PAY_META.menunggu_verifikasi
                            return (
                              <div key={p.id} className="flex flex-wrap items-center justify-between gap-1.5 rounded-md bg-muted/60 px-2 py-1.5">
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[9px]">
                                      {p.paymentMethod === 'qris' ? <QrCode className="h-2.5 w-2.5" /> : <Landmark className="h-2.5 w-2.5" />}
                                      {p.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'}
                                    </Badge>
                                    <Badge className={`px-1.5 py-0 text-[9px] ${meta.className}`}>{meta.label}</Badge>
                                    <span className="font-medium">{rupiah(p.amount)}</span>
                                  </div>
                                  {p.paymentMethod === 'transfer_bank' && (p.senderName || p.transferDate) && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Pengirim: <b className="text-foreground">{p.senderName || '-'}</b> · Tgl: {p.transferDate || '-'}
                                    </p>
                                  )}
                                  {p.status === 'ditolak' && p.rejectionReason && (
                                    <p className="text-[10px] text-red-600">Ditolak: {p.rejectionReason}</p>
                                  )}
                                </div>
                                {p.hasProof && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-[11px]"
                                    disabled={proofBusyId === p.id}
                                    onClick={() => openProof(p.id, inv.invoiceNumber)}
                                  >
                                    {proofBusyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                    Lihat Bukti
                                  </Button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Batal</Button>
            <Button onClick={submitExtend} disabled={extendBusy} className="gap-1.5">
              {extendBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog lihat bukti transfer */}
      <Dialog open={!!proofView} onOpenChange={open => !open && setProofView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti Transfer — {proofView?.title}</DialogTitle>
            <DialogDescription>
              {extendTarget?.nama} — periksa keaslian bukti sebelum memperpanjang masa berlaku.
            </DialogDescription>
          </DialogHeader>
          {proofView && (proofView.url.startsWith('data:application/pdf') ? (
            <a href={proofView.url} download={proofView.name} className="flex items-center gap-2 rounded-lg border p-4 text-sm hover:bg-muted">
              <Receipt className="w-5 h-5" /> Unduh file PDF: {proofView.name}
            </a>
          ) : (
            <img src={proofView.url} alt={`Bukti transfer ${proofView.title}`} className="max-h-[60vh] w-full rounded-lg border object-contain" />
          ))}
        </DialogContent>
      </Dialog>
    </div>
  )
}
