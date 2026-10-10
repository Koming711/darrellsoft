'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2, Crown, Wallet, Store, CheckCircle2, Clock, XCircle, Zap,
  Pencil, Check, Users2, CalendarClock, Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { panelFetch } from '../panel-fetch'
import { getAuthHeaders } from '@/lib/auth-fetch'

interface Plan {
  id: string
  name: string
  subtitle: string
  price: number
  originalPrice: number | null
  period: string
  durationMonths: number
  maxAccounts: number
  features: string[]
  active: boolean
}

interface PaymentRow {
  id: string
  orderId: string
  packageName: string
  packageType: string
  grossAmount: number
  customerName: string
  transactionStatus: string
  userId: string | null
  createdAt: string
}

interface TenantRow {
  id: string
  nama: string
  kontak: string
  role: string
  username: string
  expiredDate: string | null
  status: 'aktif' | 'expired'
}

interface PaketData {
  plans: Plan[]
  payments: PaymentRow[]
  tenants: TenantRow[]
  summary: { totalRevenue: number; paymentCount: number; tenantAktif: number; tenantExpired: number }
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const SETTLED = ['settlement', 'capture', 'success']

/** Persen diskon dari harga coret → harga jual */
const diskonPercent = (price: number, original: number | null) =>
  original && original > price && original > 0 ? Math.round((1 - price / original) * 100) : 0

function PaketPremiumContent() {
  const [data, setData] = useState<PaketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activating, setActivating] = useState<string | null>(null)

  // Edit paket
  const [editPlan, setEditPlan] = useState<Plan | null>(null)
  const [form, setForm] = useState({ name: '', subtitle: '', price: '', originalPrice: '', durationMonths: '1', maxAccounts: '1', period: '', features: '', active: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    panelFetch<PaketData>('/api/panel-admin/paket')
      .then(({ data, error, authError }) => {
        if (authError) return
        if (error) setError(error)
        else { setData(data); setError('') }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (plan: Plan) => {
    setEditPlan(plan)
    setForm({
      name: plan.name,
      subtitle: plan.subtitle,
      price: String(plan.price),
      originalPrice: plan.originalPrice ? String(plan.originalPrice) : '',
      durationMonths: String(plan.durationMonths),
      maxAccounts: String(plan.maxAccounts),
      period: plan.period,
      features: plan.features.join('\n'),
      active: plan.active,
    })
  }

  const savePlan = async () => {
    if (!editPlan || !data) return
    const price = Math.max(0, Math.round(Number(form.price) || 0))
    const originalRaw = form.originalPrice.trim() === '' ? null : Math.max(0, Math.round(Number(form.originalPrice) || 0))
    const durationMonths = Math.max(1, Math.round(Number(form.durationMonths) || 1))
    const maxAccounts = Math.max(1, Math.round(Number(form.maxAccounts) || 1))
    if (price <= 0) { toast.error('Harga harus lebih dari 0.'); return }
    if (originalRaw !== null && originalRaw <= price) {
      toast.error('Harga coret (harga normal) harus LEBIH BESAR dari harga jual.')
      return
    }
    const updatedPlan: Plan = {
      ...editPlan,
      name: form.name.trim() || editPlan.name,
      subtitle: form.subtitle.trim(),
      price,
      originalPrice: originalRaw,
      durationMonths,
      maxAccounts,
      period: form.period.trim(),
      features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
      active: form.active,
    }
    const plans = data.plans.map(p => (p.id === editPlan.id ? updatedPlan : p))
    setSaving(true)
    const { data: d, error: err, authError } = await panelFetch<{ success: boolean; plans: Plan[] }>('/api/panel-admin/paket', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plans }),
    })
    setSaving(false)
    if (authError) return
    if (err) { toast.error(err); return }
    toast.success(`Paket ${updatedPlan.name} tersimpan. Harga baru langsung berlaku di halaman checkout.`)
    setEditPlan(null)
    if (d?.plans) setData(prev => (prev ? { ...prev, plans: d.plans } : prev))
    else load()
  }

  const handleActivate = async (orderId: string) => {
    setActivating(orderId)
    try {
      const res = await fetch('/api/midtrans/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ orderId }),
      })
      const d = await res.json()
      if (res.ok && d.success) {
        toast.success(d.alreadyActive ? 'Pembayaran ini sudah diaktifkan sebelumnya.' : 'Akun pelanggan berhasil diaktifkan.')
        load()
      } else {
        toast.error(d.message || 'Gagal mengaktifkan pembayaran.')
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan.')
    } finally {
      setActivating(null)
    }
  }

  const statusBadge = (status: string) => {
    if (SETTLED.includes(status)) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    if (status === 'pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  }
  const statusIcon = (status: string) => SETTLED.includes(status) ? CheckCircle2 : status === 'pending' ? Clock : XCircle

  const previewDiskon = diskonPercent(Math.round(Number(form.price) || 0), form.originalPrice.trim() === '' ? null : Math.round(Number(form.originalPrice) || 0))

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Header halaman */}
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Paket Premium</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola katalog paket (harga, diskon, masa berlaku, perincian), pembayaran pelanggan, dan langganan aktif
        </p>
      </header>

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
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-teal-50 text-teal-600 dark:bg-teal-950/40">
                <Wallet className="w-4.5 h-4.5" />
              </div>
              <p className="text-lg font-bold text-foreground truncate" title={rupiah(data.summary.totalRevenue)}>{rupiah(data.summary.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Pendapatan Paket</p>
            </div>
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <p className="text-2xl font-bold text-foreground">{data.summary.paymentCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Transaksi Pembayaran</p>
            </div>
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                <Store className="w-4.5 h-4.5" />
              </div>
              <p className="text-2xl font-bold text-foreground">{data.summary.tenantAktif}</p>
              <p className="text-xs text-muted-foreground mt-1">Pelanggan Aktif</p>
            </div>
            <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <p className="text-2xl font-bold text-foreground">{data.summary.tenantExpired}</p>
              <p className="text-xs text-muted-foreground mt-1">Pelanggan Expired</p>
            </div>
          </div>

          {/* Katalog paket — bisa diedit per paket */}
          <section aria-label="Katalog paket">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Crown className="w-4.5 h-4.5 text-violet-600" />
                Katalog Paket
              </h2>
              <span className="text-xs text-muted-foreground">Klik ikon pensil untuk mengedit harga, diskon, masa berlaku &amp; perincian</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.plans.map(plan => {
                const diskon = diskonPercent(plan.price, plan.originalPrice)
                return (
                  <div
                    key={plan.id}
                    className={`bg-card rounded-xl border p-5 shadow-sm flex flex-col ${
                      plan.active ? 'border-slate-200 dark:border-slate-800' : 'border-dashed border-slate-300 dark:border-slate-700 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-foreground">{plan.name}</h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!plan.active && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-semibold">
                            Nonaktif
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(plan)}
                          aria-label={`Edit paket ${plan.name}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{plan.subtitle}</p>

                    {/* Harga + angka coret diskon + masa berlaku */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {diskon > 0 && plan.originalPrice && (
                        <>
                          <span className="text-sm text-muted-foreground line-through" title={`Harga normal ${rupiah(plan.originalPrice)}`}>
                            {rupiah(plan.originalPrice)}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300">
                            -{diskon}%
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-2xl font-extrabold text-foreground leading-tight">
                      {rupiah(plan.price)}
                      <span className="text-xs font-normal text-muted-foreground"> {plan.period}</span>
                    </p>

                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                        <CalendarClock className="w-3 h-3" /> Masa berlaku {plan.durationMonths} bulan
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                        <Users2 className="w-3 h-3" /> {plan.maxAccounts} akun
                      </span>
                    </div>

                    {/* Perincian */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Perincian
                      </p>
                      <ul className="space-y-1.5">
                        {plan.features.length === 0 && <li className="text-xs text-muted-foreground">Belum ada perincian.</li>}
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Pembayaran */}
          <section aria-label="Daftar pembayaran">
            <h2 className="text-base font-semibold text-foreground mb-3">Pembayaran Pelanggan</h2>
            {data.payments.length === 0 ? (
              <div className="bg-card rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-muted-foreground text-sm">
                Belum ada transaksi pembayaran.
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead className="bg-muted/60 sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paket</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Pembeli</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Jumlah</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map(p => {
                        const Icon = statusIcon(p.transactionStatus)
                        const canActivate = SETTLED.includes(p.transactionStatus) && !p.userId
                        return (
                          <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-foreground">{p.packageName}</p>
                              <p className="text-xs text-muted-foreground">{p.orderId}</p>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{p.customerName || '—'}</td>
                            <td className="px-4 py-2.5 text-right text-foreground whitespace-nowrap">{rupiah(p.grossAmount)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(p.transactionStatus)}`}>
                                <Icon className="w-3 h-3" />
                                {p.transactionStatus}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {p.userId ? (
                                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Aktif
                                </span>
                              ) : canActivate ? (
                                <button
                                  onClick={() => handleActivate(p.orderId)}
                                  disabled={activating === p.orderId}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                                >
                                  {activating === p.orderId
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Zap className="w-3.5 h-3.5" />}
                                  Aktifkan
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Pelanggan / tenant */}
          <section aria-label="Pelanggan langganan">
            <h2 className="text-base font-semibold text-foreground mb-3">Pelanggan Langganan</h2>
            {data.tenants.length === 0 ? (
              <div className="bg-card rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-muted-foreground text-sm">
                Belum ada pelanggan langganan premium.
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-muted/60 sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nama</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Username</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Kontak</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Masa Aktif</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tenants.map(t => (
                        <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2.5 font-medium text-foreground">{t.nama}</td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{t.username}</td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{t.kontak}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">
                            {t.expiredDate ? new Date(t.expiredDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              t.status === 'aktif'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            }`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ===== Dialog Edit Paket ===== */}
      <Dialog open={!!editPlan} onOpenChange={open => !open && !saving && setEditPlan(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Paket — {editPlan?.name}</DialogTitle>
            <DialogDescription>
              Ubah harga, angka coret diskon, masa berlaku, jumlah akun, dan perincian. Perubahan langsung tampil di halaman checkout &amp; landing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-name">Nama paket</Label>
                <Input id="plan-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-subtitle">Subjudul</Label>
                <Input id="plan-subtitle" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="mis. Langganan Bulanan" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-price">Harga jual (Rp)</Label>
                <Input id="plan-price" type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-original">Harga coret / normal (Rp)</Label>
                <Input
                  id="plan-original"
                  type="number"
                  min={0}
                  value={form.originalPrice}
                  onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))}
                  placeholder="Kosongkan bila tanpa diskon"
                />
                <p className="text-[11px] text-muted-foreground">Harga normal sebelum diskon — tampil dengan angka coret.</p>
              </div>
            </div>

            {/* Pratinjau harga */}
            <div className="rounded-lg bg-muted/60 px-3 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pratinjau:</span>
              {previewDiskon > 0 && (
                <>
                  <span className="text-sm text-muted-foreground line-through">{rupiah(Math.round(Number(form.originalPrice) || 0))}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300">-{previewDiskon}%</span>
                </>
              )}
              <span className="text-lg font-extrabold text-foreground">{rupiah(Math.round(Number(form.price) || 0))}</span>
              <span className="text-xs text-muted-foreground">{form.period}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-duration">Masa berlaku (bulan)</Label>
                <Input id="plan-duration" type="number" min={1} max={120} value={form.durationMonths} onChange={e => setForm(f => ({ ...f, durationMonths: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-accounts">Maks akun</Label>
                <Input id="plan-accounts" type="number" min={1} max={50} value={form.maxAccounts} onChange={e => setForm(f => ({ ...f, maxAccounts: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-period">Label periode</Label>
                <Input id="plan-period" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="/bulan" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-features">Perincian fitur (satu per baris)</Label>
              <Textarea
                id="plan-features"
                rows={5}
                value={form.features}
                onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                placeholder={'Hitung ongkos cetak\nMaster harga kertas\nPotong kertas'}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5">
              <div>
                <Label htmlFor="plan-active" className="text-sm font-semibold">Paket aktif</Label>
                <p className="text-[11px] text-muted-foreground">Paket nonaktif tidak dijual di halaman checkout.</p>
              </div>
              <Switch id="plan-active" checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)} disabled={saving}>Batal</Button>
            <Button onClick={savePlan} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Simpan Paket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function PaketPremiumPage() {
  return <PaketPremiumContent />
}
