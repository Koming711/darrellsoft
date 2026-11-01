'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getAuthUser } from '@/lib/auth'

/**
 * Halaman Produk — menu "Produk" kini adalah aplikasi Manajemen Penjualan &
 * Harga Customer lengkap dari workspace upload (d167b051), dijalankan sbg
 * mini-service terpisah (port 3010) dan di-embed di sini melalui proxy
 * /produk-app (rewrites di next.config.ts).
 *
 * App lama /master-barang tidak lagi ada di menu; routenya tetap hidup untuk
 * tautan lama, sedangkan fitur harga per customer tetap tersedia di menu
 * "Harga Customer".
 */
export default function ProdukPage() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getAuthUser()) {
      window.location.href = '/login'
      return
    }
    setReady(true)
  }, [])

  return (
    <DashboardLayout title="Produk" subtitle="Manajemen penjualan: produk, customer, harga customer, invoice & laporan">
      {!ready ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Memuat…</div>
      ) : (
        <iframe
          src="/produk-app/"
          title="Produk — Manajemen Penjualan"
          className="w-full rounded-lg border bg-white shadow-sm"
          style={{ height: 'calc(100dvh - 130px)', minHeight: 560 }}
          allow="clipboard-write"
        />
      )}
    </DashboardLayout>
  )
}
