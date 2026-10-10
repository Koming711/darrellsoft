'use client'

import { ShieldCheck } from 'lucide-react'
import { HakAksesContent } from '@/app/administrasi/hak-akses/page'

/**
 * Hak Akses di dalam Panel Admin (sidebar).
 * Konten sama dengan /administrasi/hak-akses, tanpa DashboardLayout
 * (frame disediakan oleh layout panel admin). Akses: admin/superadmin saja.
 */
export default function PanelAdminHakAksesPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </span>
          Hak Akses
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola hak akses &amp; peran pengguna</p>
      </header>
      <HakAksesContent />
    </div>
  )
}
