'use client'

import { Clock } from 'lucide-react'
import { AkunListPage } from '../akun-list'

export default function AkunExpiredPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </span>
          Akun Expired
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Akun yang masa berlakunya sudah habis — aktifkan kembali beserta masa berlakunya.
        </p>
      </header>
      <AkunListPage kategori="expired" />
    </div>
  )
}
