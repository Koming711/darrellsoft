'use client'

import { Shield, Users, Wrench, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'

const adminMenus = [
  {
    title: 'Hak Akses',
    description: 'Kelola hak akses pengguna sistem',
    href: '/administrasi/hak-akses',
    icon: Shield,
    color: 'blue'
  },
  {
    title: 'Pengguna',
    description: 'Kelola data pengguna aplikasi',
    href: '/administrasi/pengguna',
    icon: Users,
    color: 'green'
  },
]

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600'
}

export default function AdministrasiPage() {
  const { t } = useLanguage()
  return (
    <DashboardLayout
      title={t('administrasi')}
      subtitle={t('subtitle_administrasi')}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Menu Administrasi</h2>
          <p className="text-sm text-slate-600">Pilih menu untuk mengelola administrasi sistem</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adminMenus.map((menu) => (
            <Link
              key={menu.title}
              href={menu.href}
              className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all group"
            >
              <div className={`w-14 h-14 ${colorClasses[menu.color as keyof typeof colorClasses]} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <menu.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">{menu.title}</h3>
              <p className="text-sm text-slate-600 mb-4">{menu.description}</p>
              <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                Buka Menu
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>

        {/* Info Card */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <Wrench className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-amber-800 mb-2">Penting</h3>
              <p className="text-sm text-amber-700">
                Menu administrasi memerlukan hak akses khusus. Pastikan Anda memiliki izin yang tepat sebelum melakukan perubahan pada sistem.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
