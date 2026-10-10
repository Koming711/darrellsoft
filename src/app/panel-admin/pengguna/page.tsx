'use client'

import { Users } from 'lucide-react'
import { PenggunaContent } from '@/app/administrasi/pengguna/page'

/**
 * Pengguna di dalam Panel Admin (sidebar).
 * Konten sama dengan /administrasi/pengguna, tanpa DashboardLayout
 * (frame disediakan oleh layout panel admin). Akses: admin/superadmin saja.
 */
export default function PanelAdminPenggunaPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </span>
          Pengguna
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola pengguna sistem &amp; tenant</p>
      </header>
      <PenggunaContent />
    </div>
  )
}
