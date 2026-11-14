'use client'

// useAdminCountsStore — hitungan badge sidebar panel admin yang DIBAGI antar komponen.
// Sidebar (admin-sidebar.tsx) dan konten Verifikasi Pembayaran (verifikasi-pembayaran/content.tsx)
// sama-sama memakai store ini, sehingga saat admin membuka halaman Pendaftar Baru dan antrean
// ditandai "sudah dilihat" (POST /api/panel-admin/payments/mark-seen), badge angka di sidebar
// LANGSUNG hilang tanpa menunggu polling 30 detik — dan muncul kembali otomatis saat ada
// pendaftar BARU yang belum dilihat.
import { create } from 'zustand'
import { authFetch } from '@/lib/auth-fetch'

interface AdminCountsState {
  /** Jumlah pendaftar baru (menunggu verifikasi) yang BELUM dilihat admin — null = belum dimuat */
  pembayaranBelumDilihat: number | null
  /** Set langsung (dipakai konten setelah mark-seen — nilai sudah dihitung server) */
  setPembayaranBelumDilihat: (n: number) => void
  /** Fetch ulang dari /api/panel-admin/subscription-stats (polling sidebar 30 detik) */
  refresh: () => Promise<void>
}

export const useAdminCountsStore = create<AdminCountsState>((set) => ({
  pembayaranBelumDilihat: null,

  setPembayaranBelumDilihat: (n) => set({ pembayaranBelumDilihat: n }),

  refresh: async () => {
    try {
      const res = await authFetch('/api/panel-admin/subscription-stats')
      if (!res.ok) return
      const json = await res.json()
      set({ pembayaranBelumDilihat: json?.pembayaranBelumDilihat ?? 0 })
    } catch {
      /* senyap — badge hanya pelengkap */
    }
  },
}))
