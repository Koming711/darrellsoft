'use client'

// SubscriptionGate — layar pemblokiran aplikasi selama langganan BELUM
// diverifikasi/disetujui Admin (atau sedang ditangguhkan/dibatalkan).
// Dipasang di DashboardLayout sebagai pengganti SELURUH isi aplikasi:
// selama gate aktif, tidak ada modul aplikasi yang bisa diakses.
// Gate terangkat otomatis (DashboardLayout memeriksa ulang tiap 10 detik)
// begitu Admin menyetujui pembayaran.

import Link from 'next/link'
import {
  ArrowLeft,
  Clock3,
  FileWarning,
  Hourglass,
  LogOut,
  PackageOpen,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import type { SubscriptionAccessInfo } from '@/lib/subscription'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`

const INVOICE_STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  ditolak: { label: 'Ditolak', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

interface SubscriptionGateProps {
  info: SubscriptionAccessInfo | null
  rechecking: boolean
  onRecheck: () => void
  onLogout: () => void
}

export function SubscriptionGate({ info, rechecking, onRecheck, onLogout }: SubscriptionGateProps) {
  const reason = info?.reason ?? 'menunggu_verifikasi'
  const openInvoice = info?.openInvoice ?? null
  const subscription = info?.subscription ?? null

  const view = (() => {
    switch (reason) {
      case 'menunggu_verifikasi':
        return {
          icon: <Hourglass className="h-8 w-8 text-amber-600 dark:text-amber-400" />,
          iconWrap: 'bg-amber-100 dark:bg-amber-900/40',
          badge: { text: 'Menunggu Verifikasi Admin', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
          title: 'Aplikasi Belum Dapat Digunakan',
        }
      case 'menunggu_pembayaran':
        return {
          icon: <FileWarning className="h-8 w-8 text-amber-600 dark:text-amber-400" />,
          iconWrap: 'bg-amber-100 dark:bg-amber-900/40',
          badge: { text: 'Tagihan Belum Dibayar', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
          title: 'Selesaikan Pembayaran Anda',
        }
      case 'ditolak':
        return {
          icon: <FileWarning className="h-8 w-8 text-red-600 dark:text-red-400" />,
          iconWrap: 'bg-red-100 dark:bg-red-900/40',
          badge: { text: 'Pembayaran Ditolak', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
          title: 'Aplikasi Belum Dapat Digunakan',
        }
      case 'ditangguhkan':
        return {
          icon: <PauseCircle className="h-8 w-8 text-red-600 dark:text-red-400" />,
          iconWrap: 'bg-red-100 dark:bg-red-900/40',
          badge: { text: 'Langganan Ditangguhkan', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
          title: 'Aplikasi Tidak Dapat Digunakan',
        }
      case 'dibatalkan':
        return {
          icon: <PauseCircle className="h-8 w-8 text-red-600 dark:text-red-400" />,
          iconWrap: 'bg-red-100 dark:bg-red-900/40',
          badge: { text: 'Langganan Dibatalkan', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
          title: 'Aplikasi Tidak Dapat Digunakan',
        }
      default: // belum_pilih_paket
        return {
          icon: <PackageOpen className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />,
          iconWrap: 'bg-emerald-100 dark:bg-emerald-900/40',
          badge: { text: 'Belum Berlangganan', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
          title: 'Pilih Paket untuk Memulai',
        }
    }
  })()

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ backgroundColor: 'var(--app-content-bg, hsl(var(--background)))' }}
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-md">
        {/* Kartu utama */}
        <div
          className="rounded-2xl border shadow-sm p-6 sm:p-8 text-center"
          style={{ backgroundColor: 'var(--card, hsl(var(--card)))', borderColor: 'hsl(var(--border))' }}
        >
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${view.iconWrap}`}>
            {view.icon}
          </div>

          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${view.badge.cls}`}>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {view.badge.text}
          </span>

          <h1 className="mt-3 text-xl font-bold text-foreground">{view.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {info?.message ||
              'Bukti pembayaran Anda sedang diverifikasi admin. Aplikasi dapat digunakan setelah pembayaran disetujui.'}
          </p>

          {/* Kartu status tagihan / langganan */}
          {(openInvoice || subscription) && (
            <div className="mt-5 rounded-xl border bg-muted/40 p-4 text-left" style={{ borderColor: 'hsl(var(--border))' }}>
              {openInvoice && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Nomor Tagihan</span>
                    <span className="font-mono text-sm font-semibold text-foreground">{openInvoice.invoiceNumber}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Paket</span>
                    <span className="text-sm font-medium text-foreground">{openInvoice.planName}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Total Tagihan</span>
                    <span className="text-sm font-semibold text-foreground">{rupiah(openInvoice.amount)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${INVOICE_STATUS_TEXT[openInvoice.status]?.cls ?? 'bg-muted text-foreground'}`}>
                      {INVOICE_STATUS_TEXT[openInvoice.status]?.label ?? openInvoice.status}
                    </span>
                  </div>
                </>
              )}
              {!openInvoice && subscription && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Paket</span>
                    <span className="text-sm font-medium text-foreground">{subscription.planName ?? '-'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Status Langganan</span>
                    <span className="text-sm font-semibold text-foreground">{subscription.status}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Aksi utama sesuai alasan */}
          <div className="mt-6 space-y-2.5">
            {(reason === 'menunggu_pembayaran' || reason === 'ditolak') && openInvoice && (
              <Link
                href={`/langganan/pembayaran/${openInvoice.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 min-h-[44px]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {reason === 'ditolak' ? 'Ajukan Ulang Pembayaran' : 'Buka Halaman Pembayaran'}
              </Link>
            )}

            {reason !== 'menunggu_verifikasi' && reason !== 'ditangguhkan' && (
              <Link
                href="/pilih-paket"
                className="flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted min-h-[44px]"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <PackageOpen className="h-4 w-4" aria-hidden="true" />
                {reason === 'belum_pilih_paket' ? 'Pilih Paket Sekarang' : 'Pilih Paket Lain'}
              </Link>
            )}

            <button
              type="button"
              onClick={onRecheck}
              disabled={rechecking}
              className="flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 min-h-[44px]"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <RefreshCw className={`h-4 w-4 ${rechecking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {rechecking ? 'Memeriksa...' : 'Periksa Status Verifikasi'}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground min-h-[44px]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Keluar dari Akun
            </button>
          </div>
        </div>

        {/* Catatan otomatis */}
        <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Status diperiksa otomatis setiap beberapa detik — aplikasi terbuka sendiri begitu admin menyetujui pembayaran Anda.
          </span>
        </p>
      </div>
    </div>
  )
}
