'use client'

// /pilih-paket — "Pilih Paket Darrellsoft" (Langkah 2 alur langganan).
// Port dari implementasi referensi (pilih-paket + konfirmasi-paket), disesuaikan
// dengan backend Darrell Soft: GET /api/subscription/plans (publik) +
// GET /api/subscription/my (banner tagihan terbuka + status trial).
// Bisa dilihat tanpa login — tombol pilih diarahkan ke login bila belum masuk,
// atau ke /konfirmasi-paket?planId=<id> (tagihan dibuat di halaman konfirmasi).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { StepIndicator } from '@/components/darrellsoft/step-indicator'
import { SiteFooter } from '@/components/darrellsoft/site-footer'
import { useSession } from '@/hooks/use-session'
import { apiFetch } from '@/lib/subscription-client'
import { formatRupiah, formatDuration, formatUniqueCode } from '@/lib/subscription-format'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Info,
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

interface MySubscription {
  planId: string | null
  planName: string | null
  status: string
  endDate: string | null
  daysLeft: number | null
}

interface MyInvoice {
  id: string
  invoiceNumber: string
  planId: string
  planName: string
  amount: number
  uniqueCode: number | null
  originalPrice: number | null
  status: string
  dueDate: string
  isPlanChange: boolean
  createdAt: string
}

interface MyData {
  subscription: MySubscription | null
  invoices: MyInvoice[]
}

function discountPercent(price: number, original: number | null): number | null {
  if (!original || original <= price) return null
  return Math.round(((original - price) / original) * 100)
}

/**
 * Resolve daftar fitur paket — ikuti rujukan "Seluruh fitur paket X" agar tabel
 * perbandingan akurat. Semua konten tetap dari DB (tidak ada fitur karangan).
 */
function resolveFeatures(plan: Plan, allPlans: Plan[]): string[] {
  const out = new Set<string>()
  const visit = (p: Plan, depth: number) => {
    for (const f of p.features ?? []) {
      if (out.has(f)) continue
      out.add(f)
      if (depth < 3) {
        const m = f.match(/seluruh\s+fitur\s+(?:paket\s+)?([A-Za-z]+)/i)
        if (m) {
          const base = allPlans.find(
            (b) => b.id !== p.id && (b.name.toLowerCase() === m[1].toLowerCase() || b.slug === m[1].toLowerCase()),
          )
          if (base) visit(base, depth + 1)
        }
      }
    }
  }
  visit(plan, 0)
  return [...out]
}

export default function PilihPaketPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useSession()
  const authed = !!user

  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [myData, setMyData] = useState<MyData | null>(null)
  const [showCompare, setShowCompare] = useState(false)

  // Guard: belum login → login dengan next (admin/superadmin tetap boleh melihat)
  useEffect(() => {
    if (sessionLoading) return
    if (!user) router.push('/login?next=/pilih-paket')
  }, [sessionLoading, user, router])

  // Katalog paket (endpoint publik)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<{ plans: Plan[] }>('/api/subscription/plans')
        if (!cancelled) setPlans(res.plans)
      } catch (e) {
        if (!cancelled) setPlansError(e instanceof Error ? e.message : 'Gagal memuat paket')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Data langganan milik user — untuk banner tagihan terbuka & status trial (non-fatal)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<MyData>('/api/subscription/my')
        if (!cancelled) setMyData(res)
      } catch {
        // abaikan — banner & status trial tetap netral
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const subscription = myData?.subscription ?? null
  const activeSub =
    !!subscription && (subscription.status === 'aktif' || subscription.status === 'akan_berakhir')

  // Tagihan terbuka terbaru (menunggu pembayaran / verifikasi) → banner lanjut bayar
  const openInvoice = useMemo(
    () =>
      myData?.invoices.find(
        (i) => i.status === 'menunggu_pembayaran' || i.status === 'menunggu_verifikasi',
      ) ?? null,
    [myData],
  )

  // Trial dianggap terpakai bila ada tagihan trial disetujui ATAU langganan trial
  // pernah berjalan (bukan belum_aktif/dibatalkan)
  const trialUsed = useMemo(() => {
    if (!myData) return false
    const trialId = plans?.find((p) => p.slug === 'trial')?.id
    if (!trialId) return false
    const invoiceUsed = myData.invoices.some(
      (i) => i.planId === trialId && i.status === 'disetujui',
    )
    const subUsed =
      subscription !== null &&
      subscription.planId === trialId &&
      !['belum_aktif', 'dibatalkan'].includes(subscription.status)
    return invoiceUsed || subUsed
  }, [myData, plans, subscription])

  // ===== Data tabel perbandingan fitur (union fitur hasil resolve antar paket) =====
  const compareRows = useMemo(() => {
    if (!plans || plans.length === 0) return []
    const resolved = plans.map((p) => ({ plan: p, feats: resolveFeatures(p, plans) }))
    const union: string[] = []
    for (const r of resolved) {
      for (const f of r.feats) if (!union.includes(f)) union.push(f)
    }
    return union.map((f) => ({
      feature: f,
      byPlan: resolved.map((r) => ({ plan: r.plan, has: r.feats.includes(f) })),
    }))
  }, [plans])

  const handlePilih = (plan: Plan) => {
    if (!authed) {
      router.push('/login?next=/pilih-paket')
      return
    }
    router.push(`/konfirmasi-paket?planId=${plan.id}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            href={authed ? '/pembukaan' : '/'}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8">
        {/* Indikator langkah: Daftar → Pilih Paket → Pembayaran → Verifikasi → Selesai */}
        <StepIndicator step={2} className="mx-auto mb-8 max-w-3xl" />

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
        {subscription && (
          <Alert className="mx-auto mb-6 max-w-3xl border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
            {activeSub ? (
              <Info className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <AlertTitle>
              {activeSub
                ? `Langganan aktif: ${subscription.planName ?? '-'}${subscription.endDate ? ` — berakhir ${new Date(subscription.endDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}`
                : 'Anda belum memiliki langganan aktif'}
            </AlertTitle>
            <AlertDescription>
              {activeSub
                ? 'Jika memilih paket berbeda, perubahan berlaku setelah pembayaran paket baru disetujui admin. Masa aktif paket baru dimulai dari tanggal persetujuan.'
                : 'Pilih salah satu paket di bawah, lalu selesaikan pembayaran untuk mengaktifkan langganan.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Banner tagihan terbuka */}
        {openInvoice && (
          <Alert className="mx-auto mb-6 max-w-3xl border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Anda memiliki tagihan yang belum selesai</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Tagihan {openInvoice.invoiceNumber} untuk paket {openInvoice.planName} (
                {formatRupiah(openInvoice.amount)})
                {typeof openInvoice.uniqueCode === 'number' && (
                  <> — termasuk kode unik {formatUniqueCode(openInvoice.uniqueCode)}</>
                )}
                .
              </span>
              <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
                <Link href={`/langganan/pembayaran/${openInvoice.id}`}>
                  Lanjutkan Pembayaran <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Kartu paket */}
        {plans === null && !plansError ? (
          <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[420px] rounded-2xl" />
            ))}
          </div>
        ) : plansError ? (
          <Alert variant="destructive" className="mx-auto max-w-3xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Gagal memuat paket</AlertTitle>
            <AlertDescription>{plansError}</AlertDescription>
          </Alert>
        ) : plans && plans.length === 0 ? (
          <Alert className="mx-auto max-w-3xl">
            <Info className="h-4 w-4" />
            <AlertTitle>Belum ada paket tersedia</AlertTitle>
            <AlertDescription>Paket langganan belum diatur oleh admin. Silakan coba lagi nanti.</AlertDescription>
          </Alert>
        ) : plans && plans.length > 0 ? (
          <>
            <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  trialBlocked={plan.slug === 'trial' && trialUsed}
                  onSelect={() => handlePilih(plan)}
                />
              ))}
            </div>

            {/* Perbandingan fitur antar paket */}
            {compareRows.length > 0 && (
              <div className="mx-auto mt-10 max-w-4xl">
                <button
                  type="button"
                  onClick={() => setShowCompare((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted/60"
                  aria-expanded={showCompare}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" /> Bandingkan Fitur Antar Paket
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showCompare ? 'rotate-180' : ''}`} />
                </button>
                {showCompare && (
                  <div className="mt-3 overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/60">
                          <th className="p-3 text-left font-semibold">Fitur</th>
                          {plans.map((p) => (
                            <th key={p.id} className="whitespace-nowrap p-3 text-center font-semibold">
                              {p.name}
                              {p.isPopular && (
                                <div className="text-[10px] font-normal text-emerald-600">Terpopuler</div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b bg-muted/30">
                          <td className="p-3 font-medium">Harga / bulan</td>
                          {plans.map((p) => (
                            <td key={p.id} className="whitespace-nowrap p-3 text-center font-semibold">
                              {p.monthlyPrice <= 0 ? 'Gratis' : formatRupiah(p.monthlyPrice)}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b bg-muted/30">
                          <td className="p-3 font-medium">Masa berlaku</td>
                          {plans.map((p) => (
                            <td key={p.id} className="whitespace-nowrap p-3 text-center">
                              {formatDuration(p.durationDays)}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b bg-muted/30">
                          <td className="p-3 font-medium">Maks akun pengguna</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-3 text-center">
                              {p.maxAccounts}
                            </td>
                          ))}
                        </tr>
                        {compareRows.map((row, i) => (
                          <tr key={i} className="border-b last:border-b-0">
                            <td className="p-3">{row.feature}</td>
                            {row.byPlan.map((b) => (
                              <td key={b.plan.id} className="p-3 text-center">
                                {b.has ? (
                                  <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Tersedia" />
                                ) : (
                                  <span className="text-muted-foreground/40" aria-label="Tidak tersedia">
                                    —
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
          Pembayaran diverifikasi manual oleh admin — bukti transfer/QRIS tidak langsung mengaktifkan langganan.
          Harga tagihan mengikuti saat tagihan dibuat; perubahan harga paket tidak mempengaruhi tagihan lama.
          {' '}Total transfer = harga paket + kode unik 3 digit agar pembayaran mudah dikenali.
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}

function PlanCard({
  plan,
  trialBlocked,
  onSelect,
}: {
  plan: Plan
  trialBlocked: boolean
  onSelect: () => void
}) {
  const isTrial = plan.slug === 'trial'
  const isFree = plan.monthlyPrice <= 0
  const disc = discountPercent(plan.monthlyPrice, plan.originalPrice)

  return (
    <Card
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
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">{plan.name}</h3>
          {isTrial && (
            <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300">
              <Sparkles className="mr-1 h-3 w-3" /> Trial
            </Badge>
          )}
        </div>
        <p className="mt-1 min-h-[40px] text-xs text-muted-foreground">{plan.description}</p>

        <div className="mt-4 flex items-end gap-2">
          <span className="text-3xl font-extrabold tracking-tight">
            {isFree ? 'Gratis' : formatRupiah(plan.monthlyPrice)}
          </span>
          {!isFree && <span className="pb-1 text-sm text-muted-foreground">/bulan</span>}
        </div>
        {plan.originalPrice && plan.originalPrice > plan.monthlyPrice && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-muted-foreground line-through">{formatRupiah(plan.originalPrice)}</span>
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
            <CalendarClock className="h-3.5 w-3.5" /> Masa berlaku {formatDuration(plan.durationDays)} per
            pembayaran
          </div>
        </div>

        <Button
          className={`mt-5 w-full ${plan.isPopular ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
          variant={plan.isPopular ? 'default' : 'outline'}
          disabled={!plan.isActive || trialBlocked}
          onClick={onSelect}
        >
          {trialBlocked
            ? 'Trial Sudah Digunakan'
            : isTrial
              ? isFree
                ? 'Coba Gratis'
                : 'Coba Trial'
              : 'Pilih Paket'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
