'use client'

// SubscriptionWaitingPopup — popup (Dialog) "Aplikasi Belum Dapat Digunakan"
// yang tampil di BERANDA aplikasi (/pembukaan) selama konfirmasi pembayaran
// pelanggan masih menunggu verifikasi Admin (invoice status menunggu_verifikasi).
//
// Berbeda dengan SubscriptionGate (layar penuh yang menggantikan seluruh isi
// aplikasi di rute modul lain), popup ini hanya MEMBERITAHU: beranda tetap
// tampil di belakangnya, popup bisa ditutup, dan hilang otomatis begitu Admin
// menyetujui pembayaran (DashboardLayout memeriksa ulang berkala).

import Link from 'next/link'
import { Hourglass, RefreshCw, ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SubscriptionAccessInfo } from '@/lib/subscription'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`

const INVOICE_STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  ditolak: { label: 'Ditolak', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

interface SubscriptionWaitingPopupProps {
  info: SubscriptionAccessInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  rechecking: boolean
  onRecheck: () => void
}

export function SubscriptionWaitingPopup({
  info,
  open,
  onOpenChange,
  rechecking,
  onRecheck,
}: SubscriptionWaitingPopupProps) {
  const invoice = info?.openInvoice ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden rounded-2xl" aria-describedby="sub-waiting-desc">
        <div className="p-6 text-center sm:p-7">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            <Hourglass className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Menunggu Verifikasi Admin
          </span>

          <DialogHeader className="space-y-0 sm:text-center">
            <DialogTitle className="mt-3 text-lg font-bold text-foreground">
              Aplikasi Belum Dapat Digunakan
            </DialogTitle>
            <DialogDescription id="sub-waiting-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {info?.message ||
                'Konfirmasi pembayaran Anda sedang diverifikasi admin. Aplikasi dapat digunakan setelah pembayaran disetujui.'}
            </DialogDescription>
          </DialogHeader>

          {/* Ringkasan tagihan */}
          {invoice && (
            <div className="mt-5 rounded-xl border bg-muted/40 p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Nomor Tagihan</span>
                <span className="font-mono text-sm font-semibold text-foreground">{invoice.invoiceNumber}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Paket</span>
                <span className="text-sm font-medium text-foreground">{invoice.planName}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Total Tagihan</span>
                <span className="text-sm font-semibold text-foreground">{rupiah(invoice.amount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${INVOICE_STATUS_TEXT[invoice.status]?.cls ?? 'bg-muted text-foreground'}`}>
                  {INVOICE_STATUS_TEXT[invoice.status]?.label ?? invoice.status}
                </span>
              </div>
            </div>
          )}

          {/* Aksi */}
          <div className="mt-5 space-y-2.5">
            <Button
              type="button"
              onClick={onRecheck}
              disabled={rechecking}
              className="h-11 w-full gap-2 text-sm font-semibold"
            >
              <RefreshCw className={`h-4 w-4 ${rechecking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {rechecking ? 'Memeriksa...' : 'Periksa Status Verifikasi'}
            </Button>

            {invoice && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 text-sm font-semibold"
                asChild
              >
                <Link href={`/langganan/pembayaran/${invoice.id}`}>
                  Lihat Konfirmasi Pembayaran
                </Link>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-10 w-full text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Tutup
            </Button>
          </div>

          <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
            <Hourglass className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              Status diperiksa otomatis — popup hilang sendiri begitu admin menyetujui pembayaran Anda.
            </span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
