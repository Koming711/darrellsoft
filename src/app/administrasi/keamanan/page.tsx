'use client'

import { Save, ShieldCheck } from 'lucide-react'
import React, { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'

export default function KeamananPage() {
  const { t } = useLanguage()

  // === AKUN DEMO STATE ===
  const [demoDays, setDemoDays] = useState('7')
  const [demoMessage, setDemoMessage] = useState('')
  const demoMsgRef = useRef<HTMLTextAreaElement>(null)

  // === KEAMANAN STATE ===
  const [singleDevice, setSingleDevice] = useState(true)
  const [singleDeviceMessage, setSingleDeviceMessage] = useState('')
  const singleDeviceMsgRef = useRef<HTMLTextAreaElement>(null)
  const [autoLogoutMin, setAutoLogoutMin] = useState('10')
  const [logoutWarningSec, setLogoutWarningSec] = useState('20')

  // === LOAD SETTINGS ===
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/settings')
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data)) {
          for (const s of data) {
            if (s.key === 'demo_days') setDemoDays(s.value || '7')
            if (s.key === 'demo_message') setDemoMessage(s.value || 'Selamat datang! Anda sedang menggunakan akun demo.\nUpgrade ke akun penuh untuk mengakses semua fitur.')
            if (s.key === 'single_device') setSingleDevice(s.value === 'false' ? false : true)
            if (s.key === 'single_device_message') setSingleDeviceMessage(s.value || 'Akun sudah digunakan, silahkan logout di perangkat yang lain')
            if (s.key === 'auto_logout_min') setAutoLogoutMin(s.value || '10')
            if (s.key === 'logout_warning_sec') setLogoutWarningSec(s.value || '20')
          }
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  const saveSetting = async (key: string, value: string) => {
    try {
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      })
      if (!res.ok) throw new Error('Save failed')
    } catch {
      toast.error('Gagal menyimpan pengaturan!')
    }
  }

  // === DEMO HANDLER ===
  const handleSaveDemo = async () => {
    const msgValue = demoMsgRef.current?.value || ''
    await saveSetting('demo_days', demoDays)
    await saveSetting('demo_message', msgValue)
    setDemoMessage(msgValue)
    toast.success('Pengaturan akun demo berhasil disimpan!')
  }

  // === KEAMANAN HANDLER ===
  const handleSaveKeamanan = async () => {
    const sdmValue = singleDeviceMsgRef.current?.value || ''
    await saveSetting('single_device', singleDevice ? 'true' : 'false')
    await saveSetting('single_device_message', sdmValue)
    await saveSetting('auto_logout_min', autoLogoutMin)
    await saveSetting('logout_warning_sec', logoutWarningSec)
    setSingleDeviceMessage(sdmValue)
    toast.success('Pengaturan keamanan berhasil disimpan!')
  }

  return (
    <DashboardLayout title={t('keamanan')} subtitle={t('subtitle_keamanan')}>
      {/* Header Info */}
      <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Pengaturan Keamanan & Akun Demo</p>
          <p className="text-xs text-emerald-600">Konfigurasi keamanan login, auto logout, dan pengaturan akun demo.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* AKUN DEMO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Akun Demo</h2>
            <p className="text-sm text-slate-500 mt-0.5">Pengaturan untuk akun pengguna demo</p>
          </div>
          <div className="p-4 lg:p-6 space-y-5">
            <div>
              <Label className="text-sm font-medium text-slate-700">Masa Aktif Demo (hari)</Label>
              <Input
                type="number"
                min="1"
                value={demoDays}
                onChange={(e) => setDemoDays(e.target.value)}
                className="mt-1.5"
                placeholder="7"
              />
              <p className="text-xs text-slate-400 mt-1">Berapa hari akun demo bisa digunakan sebelum kadaluarsa</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Pesan Popup Demo</Label>
              <textarea
                ref={demoMsgRef}
                rows={4}
                defaultValue={demoMessage}
                className="mt-1.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Pesan yang muncul saat pengguna demo login..."
              />
              <p className="text-xs text-slate-400 mt-1">Pesan yang ditampilkan saat pengguna demo mengakses aplikasi</p>
            </div>

            <Button onClick={handleSaveDemo} className="w-full gap-2">
              <Save className="w-4 h-4" />
              Simpan
            </Button>
          </div>
        </div>

        {/* KEAMANAN */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Keamanan Login</h2>
            <p className="text-sm text-slate-500 mt-0.5">Pengaturan keamanan akun pengguna</p>
          </div>
          <div className="p-4 lg:p-6 space-y-5">
            {/* Single Device */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium text-slate-700">Login 1 Perangkat</Label>
                <p className="text-xs text-slate-400 mt-1">
                  Jika diaktifkan, setiap akun hanya bisa login di satu perangkat saja. Jika ada yang login dari perangkat lain, akan muncul peringatan.
                </p>
              </div>
              <Switch checked={singleDevice} onCheckedChange={setSingleDevice} />
            </div>

            <div className="border-t border-slate-100" />

            {/* Pesan Peringatan Multi-Perangkat */}
            {singleDevice && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Pesan Peringatan Multi-Perangkat</Label>
                <textarea
                  ref={singleDeviceMsgRef}
                  rows={3}
                  defaultValue={singleDeviceMessage}
                  className="mt-1.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Akun sudah digunakan, silahkan logout di perangkat yang lain"
                />
                <p className="text-xs text-slate-400 mt-1">Pesan yang muncul jika akun digunakan di perangkat lain</p>
              </div>
            )}

            <div className="border-t border-slate-100" />

            {/* Auto Logout */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Auto Logout (menit)</Label>
              <Input
                type="number"
                min="0"
                value={autoLogoutMin}
                onChange={(e) => setAutoLogoutMin(e.target.value)}
                className="mt-1.5"
                placeholder="10"
              />
              <p className="text-xs text-slate-400 mt-1">Logout otomatis jika pengguna tidak aktif (0 = nonaktif). Default 10 menit</p>
            </div>

            {/* Peringatan Logout */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Peringatan Logout (detik)</Label>
              <Input
                type="number"
                min="0"
                value={logoutWarningSec}
                onChange={(e) => setLogoutWarningSec(e.target.value)}
                className="mt-1.5"
                placeholder="20"
              />
              <p className="text-xs text-slate-400 mt-1">Tampilkan popup hitung mundur sebelum logout otomatis (0 = tanpa peringatan). Default 20 detik</p>
            </div>

            <Button onClick={handleSaveKeamanan} className="w-full gap-2">
              <Save className="w-4 h-4" />
              Simpan
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
