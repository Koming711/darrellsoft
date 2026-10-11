'use client'

// /panel-admin/pengaturan-pembayaran — pengaturan pembayaran manual:
// gambar QRIS + nama penerima, rekening bank, instruksi pembayaran,
// batas waktu tagihan (jam) & masa tenggang kedaluwarsa (hari).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import { Landmark, Loader2, QrCode, Save, Trash2, Upload, Wallet } from 'lucide-react'

interface Settings {
  qrisImageUrl: string
  qrisReceiverName: string
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
  paymentInstructions: string
  paymentDueHours: number
  gracePeriodDays: number
  updatedAt?: string
}

export function PengaturanPembayaranContent() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [qrisBusy, setQrisBusy] = useState(false)
  const qrisRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/panel-admin/payment-settings')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat pengaturan')
        return
      }
      setSettings(json.settings)
    } catch {
      toast.error('Gagal terhubung ke server')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = (p: Partial<Settings>) => setSettings((prev) => (prev ? { ...prev, ...p } : prev))

  const pickQris = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('QRIS harus berupa gambar JPG/PNG')
      return
    }
    if (file.size > 500 * 1024) {
      toast.error(`Ukuran gambar QRIS maksimal 500KB (file Anda ${Math.round(file.size / 1024)}KB)`)
      return
    }
    setQrisBusy(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      patch({ qrisImageUrl: dataUrl })
      toast.success('Gambar QRIS dimuat — klik Simpan untuk menerapkan')
    } finally {
      setQrisBusy(false)
    }
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await authFetch('/api/panel-admin/payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrisImageUrl: settings.qrisImageUrl,
          qrisReceiverName: settings.qrisReceiverName,
          bankName: settings.bankName,
          bankAccountNumber: settings.bankAccountNumber,
          bankAccountName: settings.bankAccountName,
          paymentInstructions: settings.paymentInstructions,
          paymentDueHours: Number(settings.paymentDueHours) || 24,
          gracePeriodDays: Number(settings.gracePeriodDays) || 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success('Pengaturan pembayaran disimpan')
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pengaturan Pembayaran</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            QRIS resmi, rekening penerima, instruksi, batas waktu tagihan & masa tenggang — dipakai di semua halaman pembayaran pelanggan.
          </p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* QRIS */}
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-base font-bold"><QrCode className="h-5 w-5 text-emerald-600" /> QRIS Manual</div>
            <input
              ref={qrisRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => pickQris(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => qrisRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
            >
              {settings.qrisImageUrl ? (
                <>
                  { }
                  <img src={settings.qrisImageUrl} alt="QRIS Darrellsoft" className="h-48 w-48 rounded-lg border bg-white object-contain p-1" />
                  <span className="font-medium text-foreground">Klik untuk mengganti gambar QRIS</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8" />
                  <span>Unggah gambar QRIS resmi (JPG/PNG, maks 500KB)</span>
                </>
              )}
            </button>
            {settings.qrisImageUrl && (
              <Button variant="outline" size="sm" className="gap-1.5 text-red-600" onClick={() => patch({ qrisImageUrl: '' })}>
                <Trash2 className="h-3.5 w-3.5" /> Hapus QRIS
              </Button>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="qris-name">Nama Penerima QRIS</Label>
              <Input id="qris-name" value={settings.qrisReceiverName} onChange={(e) => patch({ qrisReceiverName: e.target.value })} placeholder="CV Darrell Soft" />
            </div>
            <p className="text-xs text-muted-foreground">
              QRIS bersifat manual: pelanggan membayar lalu mengunggah bukti — langganan TIDAK aktif otomatis sebelum Anda menyetujui.
            </p>
          </CardContent>
        </Card>

        {/* Bank */}
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-base font-bold"><Landmark className="h-5 w-5 text-emerald-600" /> Transfer Bank</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-name">Nama Bank</Label>
                <Input id="bank-name" value={settings.bankName} onChange={(e) => patch({ bankName: e.target.value })} placeholder="BCA" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-no">Nomor Rekening</Label>
                <Input id="bank-no" value={settings.bankAccountNumber} onChange={(e) => patch({ bankAccountNumber: e.target.value })} placeholder="1234567890" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-owner">Nama Pemilik Rekening</Label>
              <Input id="bank-owner" value={settings.bankAccountName} onChange={(e) => patch({ bankAccountName: e.target.value })} placeholder="CV Darrell Soft" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instructions">Instruksi Pembayaran</Label>
              <Textarea id="instructions" rows={4} value={settings.paymentInstructions} onChange={(e) => patch({ paymentInstructions: e.target.value })} placeholder={'1. Transfer PERSIS sesuai nominal tagihan\n2. Simpan bukti transfer\n3. Unggah bukti di halaman pembayaran'} />
            </div>
          </CardContent>
        </Card>

        {/* Kebijakan */}
        <Card className="rounded-2xl lg:col-span-2">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-base font-bold"><Wallet className="h-5 w-5 text-emerald-600" /> Kebijakan Tagihan & Tenggang</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
              <div className="space-y-1.5">
                <Label htmlFor="due-hours">Batas Waktu Pembayaran Tagihan (jam)</Label>
                <Input id="due-hours" type="number" min="1" max="720" value={settings.paymentDueHours} onChange={(e) => patch({ paymentDueHours: Number(e.target.value) })} />
                <p className="text-[10px] text-muted-foreground">Tagihan baru otomatis kedaluwarsa setelah jam ini.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grace-days">Masa Tenggang Kedaluwarsa (hari)</Label>
                <Input id="grace-days" type="number" min="0" max="90" value={settings.gracePeriodDays} onChange={(e) => patch({ gracePeriodDays: Number(e.target.value) })} />
                <p className="text-[10px] text-muted-foreground">
                  Akun kedaluwarsa masih bisa mengakses aplikasi selama masa tenggang; setelah itu akses dikunci hingga perpanjangan disetujui.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
