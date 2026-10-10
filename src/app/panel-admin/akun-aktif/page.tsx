'use client'

import { UserCheck } from 'lucide-react'
import { AkunListPage } from '../akun-list'

export default function AkunAktifPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </span>
          Akun Aktif
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Akun terdaftar yang sudah diverifikasi/disetujui dan masih dalam masa berlaku.
        </p>
      </header>
      <AkunListPage kategori="aktif" />
    </div>
  )
}
