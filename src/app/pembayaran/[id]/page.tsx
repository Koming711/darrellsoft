'use client'

// /pembayaran/[id] — stub redirect untuk tautan lama gaya implementasi
// standalone (/pembayaran/[invoiceId]) → halaman pembayaran live
// /langganan/pembayaran/[invoiceId].

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function PembayaranLegacyRedirectPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  useEffect(() => {
    if (id) {
      window.location.replace(`/langganan/pembayaran/${id}`)
    }
  }, [id])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Mengalihkan…" />
    </div>
  )
}
