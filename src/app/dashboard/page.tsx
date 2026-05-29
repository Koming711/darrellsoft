'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { LayoutDashboard } from 'lucide-react'

export default function DashboardPage() {
  const { t } = useLanguage()

  return (
    <DashboardLayout title={t('dashboard')} subtitle={t('subtitle_dashboard')}>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center shadow-lg mb-6">
          <LayoutDashboard className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t('dashboard')}</h2>
        <p className="text-slate-500 text-sm">Selamat datang di Darrell Soft</p>
      </div>
    </DashboardLayout>
  )
}
