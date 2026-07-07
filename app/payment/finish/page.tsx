'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PaymentStatus = 'success' | 'pending' | 'error' | 'deny' | 'cancel' | 'expire' | 'unknown'

function getPaymentStatus(statusCode?: string | null, transactionStatus?: string | null): PaymentStatus {
  if (transactionStatus === 'settlement' || transactionStatus === 'capture') return 'success'
  if (transactionStatus === 'pending') return 'pending'
  if (transactionStatus === 'deny' || statusCode === 'deny') return 'deny'
  if (transactionStatus === 'cancel') return 'cancel'
  if (transactionStatus === 'expire') return 'expire'
  if (transactionStatus === 'failure' || statusCode === '200' || transactionStatus === 'success') return 'success'
  if (statusCode === '200') return 'success'
  return 'unknown'
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; title: string; description: string; color: string; bgColor: string; borderColor: string }> = {
  success: {
    icon: CheckCircle2,
    title: 'Pembayaran Berhasil! 🎉',
    description: 'Terima kasih! Pembayaran Anda telah berhasil diproses. Akun Anda sudah aktif dan siap digunakan.',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  pending: {
    icon: Clock,
    title: 'Pembayaran Menunggu',
    description: 'Pembayaran Anda sedang diproses. Silakan selesaikan pembayaran jika belum. Akun akan aktif otomatis setelah pembayaran berhasil.',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  error: {
    icon: XCircle,
    title: 'Pembayaran Gagal',
    description: 'Maaf, pembayaran Anda gagal diproses. Silakan coba lagi atau hubungi customer service kami.',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  deny: {
    icon: XCircle,
    title: 'Pembayaran Ditolak',
    description: 'Pembayaran Anda ditolak oleh sistem pembayaran. Silakan gunakan metode pembayaran lain atau hubungi bank Anda.',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  cancel: {
    icon: XCircle,
    title: 'Pembayaran Dibatalkan',
    description: 'Pembayaran Anda telah dibatalkan. Anda bisa mencoba lagi kapan saja.',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  expire: {
    icon: Clock,
    title: 'Pembayaran Kadaluarsa',
    description: 'Waktu pembayaran Anda telah habis. Silakan buat pesanan baru untuk berlangganan.',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  unknown: {
    icon: Clock,
    title: 'Status Pembayaran',
    description: 'Status pembayaran Anda sedang diproses. Jika pembayaran berhasil, akun Anda akan aktif secara otomatis.',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
  },
}

function PaymentFinishContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [countdown, setCountdown] = useState(10)

  const statusCode = searchParams.get('status_code')
  const transactionStatus = searchParams.get('transaction_status')
  const orderId = searchParams.get('order_id')
  const paymentType = searchParams.get('payment_type')

  const paymentParam = searchParams.get('payment')

  let status: PaymentStatus
  if (paymentParam === 'finish') {
    status = 'success'
  } else if (paymentParam === 'error') {
    status = 'error'
  } else if (paymentParam === 'pending') {
    status = 'pending'
  } else {
    status = getPaymentStatus(statusCode, transactionStatus)
  }

  const config = statusConfig[status]
  const Icon = config.icon

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push('/login')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [router])

  const formatPaymentType = (type: string | null) => {
    if (!type) return null
    const map: Record<string, string> = {
      'credit_card': 'Kartu Kredit',
      'bank_transfer': 'Transfer Bank',
      'echannel': 'Transfer Bank (Mandiri)',
      'gopay': 'GoPay',
      'qris': 'QRIS',
      'shopeepay': 'ShopeePay',
      'cstore': 'Gerai (Alfamart/Indomaret)',
      'bca_va': 'BCA Virtual Account',
      'bni_va': 'BNI Virtual Account',
      'bri_va': 'BRI Virtual Account',
      'permata_va': 'Permata Virtual Account',
      'danamon_va': 'Danamon Virtual Account',
    }
    return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className={`rounded-2xl shadow-lg border ${config.borderColor} overflow-hidden`}>
          {/* Header */}
          <div className={`${config.bgColor} p-8 text-center`}>
            <div className="mx-auto w-20 h-20 rounded-full bg-white shadow-md flex items-center justify-center mb-4">
              <Icon className={`w-10 h-10 ${config.color}`} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">{config.title}</h1>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4 bg-white">
            <p className="text-sm text-slate-600 text-center leading-relaxed">{config.description}</p>

            {/* Transaction Info */}
            {orderId && (
              <div className="bg-slate-50 rounded-xl p-4 space-y-2.5">
                {orderId && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Order ID</span>
                    <span className="text-xs font-mono font-semibold text-slate-700">{orderId}</span>
                  </div>
                )}
                {paymentType && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Metode</span>
                    <span className="text-xs font-semibold text-slate-700">{formatPaymentType(paymentType)}</span>
                  </div>
                )}
                {transactionStatus && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Status</span>
                    <span className={`text-xs font-bold ${config.color}`}>
                      {transactionStatus === 'settlement' || transactionStatus === 'capture' ? 'Berhasil' :
                       transactionStatus === 'pending' ? 'Menunggu' :
                       transactionStatus === 'deny' ? 'Ditolak' :
                       transactionStatus === 'cancel' ? 'Dibatalkan' :
                       transactionStatus === 'expire' ? 'Kadaluarsa' :
                       transactionStatus === 'failure' ? 'Gagal' :
                       transactionStatus}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Auto-redirect notice */}
            <div className="text-center">
              <p className="text-xs text-slate-400">
                Otomatis mengalihkan ke halaman login dalam <span className="font-bold text-slate-600">{countdown}</span> detik
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <Button
                onClick={() => router.push('/login')}
                className="w-full gap-2"
              >
                <span>Login Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="w-full"
              >
                Kembali ke Beranda
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="text-[11px] text-slate-400">
            Powered by Darrell Soft &middot; Midtrans Payment Gateway
          </p>
        </div>
      </div>
    </div>
  )
}

function PaymentFinishFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Memuat status pembayaran...</p>
      </div>
    </div>
  )
}

export default function PaymentFinishPage() {
  return (
    <Suspense fallback={<PaymentFinishFallback />}>
      <PaymentFinishContent />
    </Suspense>
  )
}
