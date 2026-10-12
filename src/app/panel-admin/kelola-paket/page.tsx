'use client'

// /panel-admin/kelola-paket — CRUD paket langganan:
// nama, deskripsi, perincian fitur (editable), harga bulanan, harga coret (diskon),
// batas akun, masa berlaku (hari), status aktif, populer.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  Check,
  Crown,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
  Users,
  CalendarClock,
  Eye,
  EyeOff,
} from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`

interface Plan {
  id: string
  slug: string
  name: string
  description: string
  monthlyPrice: number
  originalPrice: number | null
  features: string[]
  maxAccounts: number
  durationDays: number
  isActive: boolean
  isPopular: boolean
  sortOrder: number
  activeSubscribers: number
}

interface FormState {
  id?: string
  name: string
  description: string
  monthlyPrice: string
  originalPrice: string
  featuresText: string
  maxAccounts: string
  durationDays: string
  isActive: boolean
  isPopular: boolean
  sortOrder: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  monthlyPrice: '',
  originalPrice: '',
  featuresText: '',
  maxAccounts: '1',
  durationDays: '30',
  isActive: true,
  isPopular: false,
  sortOrder: '10',
}

export function KelolaPaketContent() {
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/panel-admin/plans')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat paket')
        return
      }
      setPlans(json.plans ?? [])
    } catch {
      toast.error('Gagal terhubung ke server')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: Plan) => {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description,
      monthlyPrice: String(p.monthlyPrice),
      originalPrice: p.originalPrice ? String(p.originalPrice) : '',
      featuresText: (p.features ?? []).join('\n'),
      maxAccounts: String(p.maxAccounts),
      durationDays: String(p.durationDays),
      isActive: p.isActive,
      isPopular: p.isPopular,
      sortOrder: String(p.sortOrder),
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Nama paket wajib diisi')
      return
    }
    const price = Number(form.monthlyPrice)
    if (!isFinite(price) || price < 0) {
      toast.error('Harga bulanan tidak valid')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim(),
        monthlyPrice: price,
        originalPrice: form.originalPrice === '' ? null : Number(form.originalPrice),
        features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        maxAccounts: Number(form.maxAccounts) || 1,
        durationDays: Number(form.durationDays) || 30,
        isActive: form.isActive,
        isPopular: form.isPopular,
        sortOrder: Number(form.sortOrder) || 10,
      }
      const res = await authFetch('/api/panel-admin/plans', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal menyimpan paket')
        return
      }
      toast.success(form.id ? 'Paket diperbarui' : 'Paket ditambahkan')
      setDialogOpen(false)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: Plan) => {
    try {
      const res = await authFetch('/api/panel-admin/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal mengubah status')
        return
      }
      toast.success(p.isActive ? `Paket ${p.name} dinonaktifkan` : `Paket ${p.name} diaktifkan`)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await authFetch(`/api/panel-admin/plans?id=${deleting.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal menghapus paket')
        return
      }
      toast.success(json.message || (json.deleted ? 'Paket dihapus' : 'Paket dinonaktifkan'))
      setDeleting(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Kelola Paket</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atur nama, perincian, harga (termasuk harga coret/diskon), batas, dan masa berlaku tiap paket — tanpa mengubah kode.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Tambah Paket
        </Button>
      </div>

      {plans === null ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Belum ada paket. Tambah paket pertama.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={`relative overflow-hidden rounded-2xl ${!p.isActive ? 'opacity-75' : p.isPopular ? 'border-emerald-500 ring-1 ring-emerald-500/40' : ''}`}>
              {p.isPopular && p.isActive && (
                <div className="bg-emerald-600 py-1 text-center text-[10px] font-bold uppercase tracking-wider text-white">
                  Terpopuler
                </div>
              )}
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold">{p.name}</h3>
                      <Badge variant={p.isActive ? 'secondary' : 'outline'} className={p.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : ''}>
                        {p.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description || '—'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => toggleActive(p)}
                      aria-label={p.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      {p.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => setDeleting(p)} aria-label="Hapus">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-extrabold tracking-tight">{rupiah(p.monthlyPrice)}</span>
                    <span className="pb-0.5 text-xs text-muted-foreground">/bulan</span>
                  </div>
                  {p.originalPrice && p.originalPrice > p.monthlyPrice && (
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground line-through">{rupiah(p.originalPrice)}</span>
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">
                        Diskon {Math.round(((p.originalPrice - p.monthlyPrice) / p.originalPrice) * 100)}%
                      </Badge>
                    </div>
                  )}
                </div>

                <ul className="mt-3 space-y-1.5">
                  {(p.features ?? []).slice(0, 6).map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {(p.features ?? []).length > 6 && (
                    <li className="pl-5 text-[10px] text-muted-foreground">+{(p.features ?? []).length - 6} perincian lainnya</li>
                  )}
                  {(p.features ?? []).length === 0 && <li className="text-xs text-muted-foreground">Belum ada perincian.</li>}
                </ul>

                <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.maxAccounts} akun</span>
                  <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {p.durationDays} hari</span>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{p.activeSubscribers} langganan terkait</span>
                  <span className="font-mono">/{p.slug}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog tambah/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Paket' : 'Tambah Paket'}</DialogTitle>
            <DialogDescription>
              Perubahan harga hanya berlaku untuk tagihan BARU — tagihan lama tetap menyimpan nominal saat dibuat.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-name">Nama Paket *</Label>
              <Input id="plan-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Basic" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-desc">Deskripsi</Label>
              <Input id="plan-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Untuk usaha kecil yang baru memulai" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Harga Bulanan (Rp) *</Label>
              <Input id="plan-price" type="number" min="0" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} placeholder="99000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-original">Harga Sebelum Diskon (Rp)</Label>
              <Input id="plan-original" type="number" min="0" value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} placeholder="Kosongkan bila tanpa diskon" />
              <p className="text-[10px] text-muted-foreground">Bila &gt; harga bulanan → tampil dicoret (angka coret) + badge diskon.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-features">Perincian Fitur (satu per baris)</Label>
              <Textarea
                id="plan-features"
                rows={6}
                value={form.featuresText}
                onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
                placeholder={'Semua fitur dasar Darrellsoft\nBuat Invoice & Surat Jalan\nMaksimal 1 akun pengguna'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-accounts">Maks Akun Pengguna</Label>
              <Input id="plan-accounts" type="number" min="1" value={form.maxAccounts} onChange={(e) => setForm({ ...form, maxAccounts: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-duration">Masa Berlaku (hari)</Label>
              <Input id="plan-duration" type="number" min="1" max="3650" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm"><Crown className="h-4 w-4 text-amber-500" /> Paket Terpopuler</div>
              <Switch checked={form.isPopular} onCheckedChange={(v) => setForm({ ...form, isPopular: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-sm">Paket Aktif (bisa dipilih pelanggan)</div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-sort">Urutan Tampil</Label>
              <Input id="plan-sort" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Simpan Perubahan' : 'Tambah Paket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus paket {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Bila paket punya riwayat tagihan, paket hanya dinonaktifkan agar nominal tagihan lama tetap konsisten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteBusy}
            >
              {deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Halaman lama (rute direct) — kini diarahkan ke hub.
 * Konten dipakai ulang di hub terkait (mis. /panel-admin/pelanggan).
 */
export default function KelolaPaketPage() {
  return <KelolaPaketContent />
}
