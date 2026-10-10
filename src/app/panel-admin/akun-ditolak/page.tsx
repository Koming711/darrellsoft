'use client'

import { UserX } from 'lucide-react'
import { AkunListPage } from '../akun-list'

export default function AkunDitolakPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300 flex items-center justify-center">
            <UserX className="w-5 h-5" />
          </span>
          Akun Ditolak
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pendaftaran akun yang ditolak admin — login otomatis diblokir. Pulihkan bila salah tolak.
        </p>
      </header>
      <AkunListPage kategori="ditolak" />
    </div>
  )
}
