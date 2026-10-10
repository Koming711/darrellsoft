'use client'

import { UserPlus } from 'lucide-react'
import { AkunListPage } from '../akun-list'

export default function AkunBaruPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300 flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </span>
          Akun Baru
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Akun baru yang mendaftar dan perlu diverifikasi admin — verifikasi atau tolak di sini.
        </p>
      </header>
      <AkunListPage kategori="baru" />
    </div>
  )
}
