'use client'

// /pilih-paket — "Pilih Paket Darrellsoft"
// Halaman pilihan paket langganan bulanan (data dari DB, diatur Admin).
// Bisa diakses tanpa login (lihat paket) — tombol Pilih Paket arahkan ke login.
// Setelah pilih → buat tagihan (nominal BEKU dari server) → halaman pembayaran.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  Check,
  ChevronLeft,
  Users,
  Zap,
  Database,
  CalendarClock,
  Crown,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react'

interface Plan {
  id: string
  slug: string
  name: string
  description: string
  monthlyPrice: number
  originalPrice: number | null
  features: string[]
  maxAccounts: number
  maxTransactions: number | null
  maxStorageMb: number | null
  durationDays: number
  isPopular: boolean
  isActive: boolean
}

interface MySub {
  subscription?: {
    status: string
    planName?: string | null
    endDate?: string | null
    daysLeft?: number | null
  }
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

function discountPercent(price: number, original: number | null): number | null {
  if (!original || original <= price) return null
  return Math.round(((original - price) / original) * 100)
}

export default function PilihPaketPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [authed, setAuthed] = useState(false)
  const [mySub, setMySub] = useState<MySub['subscription'] | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    const user = getAuthUser()
    setAuthed(!!user)
    const load = async () => {
      try {
        const res = await fetch('/api/subscription/plans', { cache: 'no-store' })
        const json = await res.json()
        setPlans(json.plans ?? [])
      } catch {
        setPlans([])
      }
      if (user) {
        try {
          const res = await authFetch('/api/subscription/my')
          if (res.ok) {
            const json = await res.json()
            setMySub(json.subscription ?? null)
          }
        } catch { /* abaikan */ }
      }
    }
    load()
  }, [])

  const choosePlan = async (plan: Plan) => {
    if (!authed) {
      router.push('/login?next=/pilih-paket')
      return
    }
    if (creating) return
    setCreating(plan.id)
    try {
      const res = await authFetch('/api/subscription/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409 && json.existingInvoiceId) {
          toast.info(json.error)
          router.push(`/langganan/pembayaran/${json.existingInvoiceId}`)
          return
        }
        toast.error(json.error || 'Gagal membuat tagihan')
        return
      }
      toast.success(`Tagihan ${json.invoice.invoiceNumber} dibuat`)
      router.push(`/langganan/pembayaran/${json.invoice.id}`)
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setCreating(null)
    }
  }

  const activeSub = mySub && (mySub.status === 'aktif' || mySub.status === 'akan_berakhir')

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href={authed ? '/pembukaan' : '/'} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            {authed ? 'Beranda' : 'Beranda Publik'}
          </Link>
          <div className="flex items-center gap-2">
            {authed ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/langganan-saya">Langganan Saya</Link>
              </Button>
            ) : (
              <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <Link href="/login?next=/pilih-paket">Login Masuk</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        {/* Hero */}
        <div className="mb-8 text-center">
          <Badge className="mb-3 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Crown className="mr-1 h-3.5 w-3.5" /> Langganan Bulanan
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Pilih Paket Darrellsoft</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Satu akun = satu langganan. Bayar bulanan via QRIS atau Transfer Bank, diverifikasi admin,
            langganan aktif otomatis setelah persetujuan.
          </p>
        </div>

        {/* Info langganan berjalan */}
        {mySub && (
          <Alert className="mx-auto mb-6 max-w-3xl border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
            {activeSub ? (
              <Info className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <AlertTitle>
              {activeSub
                ? `Langganan aktif: ${mySub.planName ?? '-'}${mySub.endDate ? ` — berakhir ${new Date(mySub.endDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}`
                : 'Anda belum memiliki langganan aktif'}
            </AlertTitle>
            <AlertDescription>
              {activeSub
                ? 'Jika memilih paket berbeda, perubahan berlaku setelah pembayaran paket baru disetujui admin. Masa aktif paket baru dimulai dari tanggal persetujuan.'
                : 'Pilih salah satu paket di bawah, lalu selesaikan pembayaran untuk mengaktifkan langganan.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Kartu paket */}
        {plans === null ? (
          <div className="grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[420px] rounded-2xl" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <Alert className="mx-auto max-w-3xl">
            <Info className="h-4 w-4" />
            <AlertTitle>Belum ada paket tersedia</AlertTitle>
            <AlertDescription>Paket langganan belum diatur oleh admin. Silakan coba lagi nanti.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid items-start gap-5 md:grid-cols-3">
            {plans.map((plan) => {
              const disc = discountPercent(plan.monthlyPrice, plan.originalPrice)
              return (
                <Card
                  key={plan.id}
                  className={`relative overflow-hidden rounded-2xl transition-shadow hover:shadow-lg ${
                    plan.isPopular ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500/40' : ''
                  }`}
                >
                  {plan.isPopular && (
                    <div className="bg-emerald-600 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-white">
                      Terpopuler
                    </div>
                  )}
                  <CardContent className="p-6">
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <p className="mt-1 min-h-[40px] text-xs text-muted-foreground">{plan.description}</p>

                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-3xl font-extrabold tracking-tight">{rupiah(plan.monthlyPrice)}</span>
                      <span className="pb-1 text-sm text-muted-foreground">/bulan</span>
                    </div>
                    {plan.originalPrice && plan.originalPrice > plan.monthlyPrice && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground line-through">{rupiah(plan.originalPrice)}</span>
                        {disc && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">
                            Hemat {disc}%
                          </Badge>
                        )}
                      </div>
                    )}

                    <ul className="mt-5 space-y-2.5">
                      {(plan.features ?? []).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 space-y-1.5 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" /> Maks {plan.maxAccounts} akun pengguna
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5" />
                        {plan.maxTransactions === null ? 'Transaksi tanpa batas' : `Batas ${plan.maxTransactions.toLocaleString('id-ID')} transaksi/bulan`}
                      </div>
                      <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5" />
                        {plan.maxStorageMb === null ? 'Penyimpanan tanpa batas' : `Penyimpanan ${plan.maxStorageMb >= 1024 ? `${plan.maxStorageMb / 1024} GB` : `${plan.maxStorageMb} MB`}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5" /> Masa berlaku {plan.durationDays} hari per pembayaran
                      </div>
                    </div>

                    <Button
                      className={`mt-5 w-full ${plan.isPopular ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                      variant={plan.isPopular ? 'default' : 'outline'}
                      disabled={!plan.isActive || creating === plan.id}
                      onClick={() => choosePlan(plan)}
                    >
                      {creating === plan.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Membuat tagihan…
                        </>
                      ) : (
                        'Pilih Paket'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
          Pembayaran diverifikasi manual oleh admin — bukti transfer/QRIS tidak langsung mengaktifkan langganan.
          Harga tagihan mengikuti saat tagihan dibuat; perubahan harga paket tidak mempengaruhi tagihan lama.
        </p>
      </main>
    </div>
  )
}
