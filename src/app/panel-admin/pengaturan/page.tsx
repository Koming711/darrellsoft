'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Settings, Loader2, Save, UserPlus, UserCheck, Clock, UserX, FlaskConical, ShieldCheck, CalendarClock, BellRing,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { panelFetch } from '../panel-fetch'

interface AkunSettings {
  demo_days: string
  account_verify_required: string
  account_active_months: string
  account_notify_wa: string
}

interface Counts {
  baru: number
  aktif: number
  expired: number
  ditolak: number
}

/**
 * PENGATURAN (Panel Admin) — pengaturan khusus DAFTAR AKUN:
 * masa demo, verifikasi akun baru, masa berlaku default, notifikasi.
 * Berbeda dengan /administrasi/pengaturan yang berisi konfigurasi aplikasi umum.
 */
function PengaturanAkunContent() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [demoDays, setDemoDays] = useState('7')
  const [verifyRequired, setVerifyRequired] = useState(false)
  const [activeMonths, setActiveMonths] = useState('1')
  const [notifyWa, setNotifyWa] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      panelFetch<{ settings: AkunSettings }>('/api/panel-admin/pengaturan-akun'),
      panelFetch<{ counts: Counts }>('/api/panel-admin/akun?status=baru'),
    ])
      .then(([s, c]) => {
        if (s.authError || c.authError) return
        if (s.error) setError(s.error)
        else if (s.data?.settings) {
          setDemoDays(s.data.settings.demo_days)
          setVerifyRequired(s.data.settings.account_verify_required === 'true')
          setActiveMonths(s.data.settings.account_active_months)
          setNotifyWa(s.data.settings.account_notify_wa === 'true')
          setError('')
        }
        if (c.data?.counts) setCounts(c.data.counts)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    const { data, error, authError } = await panelFetch<{ success: boolean }>('/api/panel-admin/pengaturan-akun', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          demo_days: demoDays,
          account_verify_required: verifyRequired ? 'true' : 'false',
          account_active_months: activeMonths,
          account_notify_wa: notifyWa ? 'true' : 'false',
        },
      }),
    })
    setSaving(false)
    if (authError) return
    if (error) { toast.error(error); return }
    toast.success('Pengaturan daftar akun tersimpan.')
    if (data?.success) load()
  }

  const quickLinks = [
    { href: '/panel-admin/akun-baru', label: 'Akun Baru', icon: UserPlus, value: counts?.baru, tint: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' },
    { href: '/panel-admin/akun-aktif', label: 'Akun Aktif', icon: UserCheck, value: counts?.aktif, tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' },
    { href: '/panel-admin/akun-expired', label: 'Akun Expired', icon: Clock, value: counts?.expired, tint: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40' },
    { href: '/panel-admin/akun-ditolak', label: 'Akun Ditolak', icon: UserX, value: counts?.ditolak, tint: 'bg-red-50 text-red-600 dark:bg-red-950/40' },
  ]

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Pintasan kategori akun */}
      <section aria-label="Ringkasan daftar akun">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Daftar Akun</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${l.tint}`}>
                <l.icon className="w-4.5 h-4.5" />
              </div>
              <p className="text-xl font-bold text-foreground leading-tight">{l.value ?? '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">{l.label}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Form pengaturan */}
      <section aria-label="Form pengaturan akun" className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 md:p-6 shadow-sm space-y-6">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-4.5 h-4.5 text-slate-500" />
          Pengaturan Pendaftaran Akun
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Masa demo */}
            <div className="grid gap-2 md:grid-row items-start md:flex md:items-center md:justify-between md:gap-6">
              <div className="max-w-md">
                <Label htmlFor="demo-days" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-500" />
                  Masa demo akun baru (hari)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Masa uji coba otomatis untuk setiap pendaftaran akun baru (default 7 hari).
                </p>
              </div>
              <Input
                id="demo-days"
                type="number"
                min={1}
                max={365}
                value={demoDays}
                onChange={e => setDemoDays(e.target.value)}
                className="w-full md:w-32"
              />
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Verifikasi wajib */}
            <div className="flex items-center justify-between gap-6">
              <div className="max-w-md">
                <Label htmlFor="verify-required" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Akun baru wajib diverifikasi admin
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Bila aktif, akun baru <strong>belum bisa login</strong> sampai admin menyetujui di menu Akun Baru. Bila nonaktif, akun baru bisa langsung login (mode demo).
                </p>
              </div>
              <Switch
                id="verify-required"
                checked={verifyRequired}
                onCheckedChange={setVerifyRequired}
                aria-label="Akun baru wajib diverifikasi admin"
              />
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Masa berlaku default */}
            <div className="grid gap-2 md:grid-row items-start md:flex md:items-center md:justify-between md:gap-6">
              <div className="max-w-md">
                <Label htmlFor="active-months" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-sky-500" />
                  Masa berlaku default (bulan)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Dipakai saat memverifikasi, mengaktifkan, atau memperpanjang akun — nilai awal pengisian bulan.
                </p>
              </div>
              <Input
                id="active-months"
                type="number"
                min={1}
                max={120}
                value={activeMonths}
                onChange={e => setActiveMonths(e.target.value)}
                className="w-full md:w-32"
              />
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Notifikasi WA */}
            <div className="flex items-center justify-between gap-6">
              <div className="max-w-md">
                <Label htmlFor="notify-wa" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-teal-500" />
                  Notifikasi pendaftar baru
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Tandai akun baru sebagai belum diproses agar mudah ditemukan admin (indikator pada menu Akun Baru).
                </p>
              </div>
              <Switch
                id="notify-wa"
                checked={notifyWa}
                onCheckedChange={setNotifyWa}
                aria-label="Notifikasi pendaftar baru"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving} className="gap-2 min-w-36">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Pengaturan
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default function PanelAdminPengaturanPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </span>
          Pengaturan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pengaturan daftar akun — masa demo, verifikasi akun baru, masa berlaku &amp; notifikasi
        </p>
      </header>
      <PengaturanAkunContent />
    </div>
  )
}
