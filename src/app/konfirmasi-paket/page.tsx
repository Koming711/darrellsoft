'use client'

// /konfirmasi-paket — Langkah konfirmasi sebelum tagihan dibuat (di antara
// "Pilih Paket" dan "Pembayaran"). planId dibaca dari query (?planId=), lalu paket
// diambil ulang dari server agar harga selalu segar dari DB.
// Konfirmasi → POST /api/subscription/invoice → redirect ke /langganan/pembayaran/<id>
// (paket harga 0 langsung diaktifkan → /langganan-saya; tagihan ganda 409 → tagihan lama).

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { StepIndicator } from '@/components/darrellsoft/step-indicator'
import { SiteFooter } from '@/components/darrellsoft/site-footer'
import { useSession } from '@/hooks/use-session'
import { useToast } from '@/hooks/use-toast'
import { apiFetch, SubscriptionApiError } from '@/lib/subscription-client'
import { formatRupiah, formatDuration, formatUniqueCode } from '@/lib/subscription-format'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  Hash,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
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
  durationDays: number
  isPopular: boolean
  isActive: boolean
}

interface InvoiceCreated {
  success: boolean
  invoice: {
    id: string
    invoiceNumber: string
    amount: number
    basePrice: number
    uniqueCode: number | null
    originalPrice: number | null
    planName: string
    status: string
    dueDate: string
    isPlanChange: boolean
    freeActivated: boolean
  }
}

type PlanState = 'loading' | 'notfound' | 'error' | 'ready'

function KonfirmasiPaketContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planId = searchParams.get('planId')
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [fetchState, setFetchState] = useState<PlanState>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tanpa planId di URL → langsung dianggap tidak ditemukan (state turunan, bukan efek)
  const planState: PlanState = !planId ? 'notfound' : fetchState

  // Guard: belum login → login dengan next (admin/superadmin tetap boleh melihat)
  useEffect(() => {
    if (sessionLoading) return
    if (!user) router.push('/login?next=/konfirmasi-paket')
  }, [sessionLoading, user, router])

  // Ambil ulang paket dari server — harga & status aktif selalu dari DB
  useEffect(() => {
    if (!planId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<{ plans: Plan[] }>('/api/subscription/plans')
        if (cancelled) return
        const found = res.plans.find((p) => p.id === planId)
        if (found && found.isActive) {
          setPlan(found)
          setFetchState('ready')
        } else {
          setFetchState('notfound')
        }
      } catch {
        if (!cancelled) setFetchState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [planId])

  const discount = useMemo(() => {
    if (!plan?.originalPrice || plan.originalPrice <= plan.monthlyPrice) return 0
    return Math.round(((plan.originalPrice - plan.monthlyPrice) / plan.originalPrice) * 100)
  }, [plan])

  const isTrial = plan?.slug === 'trial'
  const isFree = !!plan && plan.monthlyPrice <= 0

  const handleKonfirmasi = async () => {
    if (!plan || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch<InvoiceCreated>('/api/subscription/invoice', {
        json: { planId: plan.id },
      })
      if (res.invoice?.freeActivated) {
        // Paket harga 0 → langsung aktif tanpa pembayaran
        toast({
          title: 'Paket gratis aktif',
          description: `Paket ${res.invoice.planName} langsung aktif — detail lengkap di halaman Langganan Saya.`,
        })
        window.location.assign('/langganan-saya')
        return
      }
      window.location.assign(`/langganan/pembayaran/${res.invoice.id}`)
      return
    } catch (e) {
      // Tagihan ganda → arahkan ke tagihan terbuka yang sudah ada
      if (e instanceof SubscriptionApiError && e.status === 409) {
        const existingId =
          typeof e.payload.existingInvoiceId === 'string' ? e.payload.existingInvoiceId : null
        toast({ title: 'Masih ada tagihan terbuka', description: e.message })
        if (existingId) {
          window.location.assign(`/langganan/pembayaran/${existingId}`)
          return
        }
      }
      setError(e instanceof Error ? e.message : 'Gagal membuat tagihan')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3">
          <Link
            href="/pilih-paket"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Kembali ke halaman pilih paket"
          >
            <ChevronLeft className="h-4 w-4" /> Kembali ke Pilih Paket
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {/* Indikator langkah: Daftar ✓ → Pilih Paket ✓ → Konfirmasi/Pembayaran → Verifikasi → Selesai */}
        <StepIndicator step={3} className="mx-auto mb-8 max-w-3xl" />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Konfirmasi Paket</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Periksa pilihan Anda sebelum tagihan dibuat. Harga diambil langsung dari server.
          </p>
        </div>

        {planState === 'loading' && (
          <Card className="mx-auto max-w-xl rounded-2xl">
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        )}

        {planState === 'error' && (
          <Alert variant="destructive" className="mx-auto max-w-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Gagal memuat paket</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              Terjadi kesalahan saat mengambil data paket. Silakan coba lagi.
              <Button asChild size="sm" variant="outline">
                <Link href="/pilih-paket">Kembali ke Pilih Paket</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {planState === 'notfound' && (
          <Alert className="mx-auto max-w-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Paket tidak ditemukan</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              Paket tidak tersedia atau sudah dinonaktifkan. Silakan pilih paket lain.
              <Button asChild size="sm">
                <Link href="/pilih-paket">Kembali ke Pilih Paket</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {planState === 'ready' && plan && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            {/* Ringkasan paket */}
            <Card className="rounded-2xl lg:col-span-3">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">Paket {plan.name}</CardTitle>
                  {plan.isPopular && (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <Sparkles className="mr-1 h-3 w-3" /> Terpopuler
                    </Badge>
                  )}
                  {isTrial && (
                    <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300">
                      Trial
                    </Badge>
                  )}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Durasi</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                      <Clock className="h-4 w-4 text-emerald-600" /> {formatDuration(plan.durationDays)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Batas Akun</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                      <Users className="h-4 w-4 text-emerald-600" /> Maks {plan.maxAccounts} akun pengguna
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Fitur utama</p>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {(plan.features ?? []).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Total tagihan */}
            <Card className="h-fit rounded-2xl lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-5 w-5 text-emerald-600" /> Total Tagihan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Harga paket</span>
                  <span>{isFree ? 'Gratis' : formatRupiah(plan.monthlyPrice)}</span>
                </div>
                {discount > 0 && plan.originalPrice !== null && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Harga normal</span>
                      <span className="line-through">{formatRupiah(plan.originalPrice)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-emerald-600">
                      <span>Diskon</span>
                      <span>-{discount}%</span>
                    </div>
                  </>
                )}
                {!isFree && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kode unik</span>
                    <span className="text-xs">+3 digit di halaman pembayaran</span>
                  </div>
                )}
                <Separator />
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">Total</span>
                  <span className={`text-2xl font-bold ${!isFree ? 'text-primary' : ''}`}>
                    {isFree ? 'Gratis' : formatRupiah(plan.monthlyPrice)}
                  </span>
                </div>

                {!isFree ? (
                  <Alert className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40">
                    <Hash className="h-4 w-4 text-violet-600" />
                    <AlertDescription className="text-xs">
                      Total tagihan = harga paket + <b>kode unik 3 digit</b> (
                      {formatUniqueCode(1)}–{formatUniqueCode(999)}). Kode unik ditambahkan ke nominal
                      transfer agar pembayaran Anda mudah dikenali dan tidak tertukar dengan pelanggan
                      lain. Rincian lengkap tampil di halaman pembayaran.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-xs">
                      Paket ini <b>gratis</b> — langganan langsung aktif setelah dikonfirmasi, tanpa
                      pembayaran, sesuai durasi paket.
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive" className="text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="flex-col gap-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  size="lg"
                  disabled={submitting}
                  onClick={handleKonfirmasi}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses…
                    </>
                  ) : isFree ? (
                    isTrial ? (
                      'Aktifkan Trial Gratis'
                    ) : (
                      'Aktifkan Sekarang'
                    )
                  ) : (
                    'Konfirmasi & Buat Tagihan'
                  )}
                </Button>
                <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Nominal dihitung &amp; divalidasi di server
                </p>
              </CardFooter>
            </Card>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}

export default function KonfirmasiPaketPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <KonfirmasiPaketContent />
    </Suspense>
  )
}
