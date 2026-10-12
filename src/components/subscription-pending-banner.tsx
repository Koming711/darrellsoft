'use client'

// SubscriptionPendingBanner — keterangan "Menunggu Verifikasi Pembayaran".
// Tampil di seluruh halaman aplikasi (dipasang di DashboardLayout, jadi selalu
// terlihat di Beranda) selama ada tagihan berstatus menunggu_verifikasi dan
// langganan BELUM aktif. Setelah admin menyetujui pembayaran:
//  - langganan → aktif (role demo → user, aplikasi bisa dipakai sesuai paket)
//  - banner hilang otomatis (fetch ulang saat mount / tab kembali aktif).

import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { authFetch } from '@/lib/auth-fetch'
import { getAuthUser } from '@/lib/auth'

interface PendingInfo {
  invoiceNumber: string
  planName: string
  amount: number
}

// Module-level cache — hindari fetch berulang setiap pindah halaman.
let _cache: { at: number; pending: PendingInfo | null } | null = null
const CACHE_TTL = 30_000 // 30 detik

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`

export function SubscriptionPendingBanner() {
  // undefined = belum tahu (jangan render apa pun dulu), null = tidak pending
  const [pending, setPending] = useState<PendingInfo | null | undefined>(
    _cache ? _cache.pending : undefined,
  )

  const load = useCallback(async (force = false) => {
    // Admin/superadmin tidak membeli paket — lewati.
    const authUser = getAuthUser()
    if (!authUser || authUser.role === 'admin' || authUser.role === 'superadmin') {
      setPending(null)
      return
    }
    if (!force && _cache && Date.now() - _cache.at < CACHE_TTL) {
      setPending(_cache.pending)
      return
    }
    try {
      const res = await authFetch('/api/subscription/my')
      if (!res.ok) {
        setPending(null)
        return
      }
      const json = await res.json()
      const sub = json.subscription
      const active = !!sub && (sub.status === 'aktif' || sub.status === 'akan_berakhir')
      const inv = (json.invoices ?? []).find(
        (i: { status?: string }) => i.status === 'menunggu_verifikasi',
      )
      const info: PendingInfo | null =
        !active && inv
          ? {
              invoiceNumber: inv.invoiceNumber ?? '',
              planName: inv.planName ?? '',
              amount: inv.amount ?? 0,
            }
          : null
      _cache = { at: Date.now(), pending: info }
      setPending(info)
    } catch {
      // Gagal jaringan — jangan tampilkan banner (hindari false positive).
      setPending(null)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Refetch saat tab kembali aktif — agar banner hilang segera setelah admin
  // menyetujui pembayaran di tab lain.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  if (!pending) return null

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
        <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          Menunggu Verifikasi Pembayaran
        </p>
        <p className="mt-0.5 leading-relaxed text-amber-700 dark:text-amber-400">
          Tagihan <b>{pending.invoiceNumber}</b> — paket <b>{pending.planName}</b> (
          {rupiah(pending.amount)}) sudah dikirim dan sedang diverifikasi admin.
          Langganan aktif otomatis setelah disetujui — aplikasi dapat digunakan
          penuh sesuai paket yang dipilih.
        </p>
      </div>
    </div>
  )
}
