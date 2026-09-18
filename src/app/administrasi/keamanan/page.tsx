'use client'

import { Save, ShieldCheck } from 'lucide-react'
import React, { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'

export default function KeamananPage() {
  const { t } = useLanguage()

  // === AKUN DEMO STATE ===
  const [demoDays, setDemoDays] = useState('7')
  const [demoMessage, setDemoMessage] = useState('')
  const demoMsgRef = useRef<HTMLTextAreaElement>(null)

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

  return (
    <DashboardLayout title={t('keamanan')} subtitle={t('subtitle_keamanan')}>
      {/* Header Info */}
      <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Pengaturan Keamanan & Akun Demo</p>
          <p className="text-xs text-emerald-600">Konfigurasi kebijakan sesi login dan pengaturan akun demo.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* AKUN DEMO */}
        <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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

        {/* KEBIJAKAN SESI */}
        <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Kebijakan Sesi Login</h2>
            <p className="text-sm text-slate-500 mt-0.5">Berlaku otomatis untuk semua pengguna</p>
          </div>
          <div className="p-4 lg:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-700">Selalu login</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pengguna yang sudah login tetap masuk ke Beranda setiap kali membuka aplikasi, tanpa perlu login ulang. Sesi berlaku sangat lama (10 tahun) dan tidak berakhir sendiri.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-700">Logout hanya oleh pengguna sendiri</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tidak ada logout otomatis (idle maupun karena login di perangkat lain). Sesi hanya berakhir ketika pengguna menekan tombol Logout di menu aplikasi.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-700">Multi perangkat diizinkan</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Satu akun boleh dipakai di beberapa perangkat sekaligus tanpa saling mengeluarkan.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
