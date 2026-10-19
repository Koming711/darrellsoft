'use client'

// /pilih-paket — "Pilih Paket Darrellsoft"
// Halaman pilihan paket langganan (Trial/Basic/Pro/Premium) — data dari DB, diatur Admin.
// Bisa diakses tanpa login (lihat paket) — tombol Pilih Paket arahkan ke login.
// Alur (Langkah 3): Pilih Paket → dialog KONFIRMASI (nama, harga, durasi, fitur, total)
// → buat tagihan (nominal BEKU dari server, termasuk kode unik 3 digit) → halaman pembayaran.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StepIndicator } from '@/components/darrellsoft/step-indicator'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  Check,
  ChevronLeft,
  ChevronDown,
  Users,
  CalendarClock,
  Crown,
  Info,
  AlertTriangle,
  Loader2,
  Sparkles,
  Hash,
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
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [authed, setAuthed] = useState(false)
  const [mySub, setMySub] = useState<MySub['subscription'] | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  // Dialog konfirmasi paket (Langkah 3)
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null)
  const [showCompare, setShowCompare] = useState(false)

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

  // ===== Langkah 4: buat tagihan SETELAH pelanggan konfirmasi di dialog =====
  const createInvoice = async (plan: Plan) => {
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
          setConfirmPlan(null)
          router.push(`/langganan/pembayaran/${json.existingInvoiceId}`)
          return
        }
        toast.error(json.error || 'Gagal membuat tagihan')
        return
      }
      toast.success(`Tagihan ${json.invoice.invoiceNumber} dibuat`)
      setConfirmPlan(null)
      router.push(`/langganan/pembayaran/${json.invoice.id}`)
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setCreating(null)
    }
  }

  const activeSub = mySub && (mySub.status === 'aktif' || mySub.status === 'akan_berakhir')

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
          <>
            <div className="grid items-start gap-5 md:grid-cols-3 xl:grid-cols-4">
              {plans.map((plan) => {
                const disc = discountPercent(plan.monthlyPrice, plan.originalPrice)
                const isTrial = plan.slug === 'trial'
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
                          {plan.monthlyPrice <= 0 ? 'Gratis' : rupiah(plan.monthlyPrice)}
                        </span>
                        {plan.monthlyPrice > 0 && <span className="pb-1 text-sm text-muted-foreground">/bulan</span>}
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
                          <CalendarClock className="h-3.5 w-3.5" /> Masa berlaku {plan.durationDays} hari per pembayaran
                        </div>
                      </div>

                      <Button
                        className={`mt-5 w-full ${plan.isPopular ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                        variant={plan.isPopular ? 'default' : 'outline'}
                        disabled={!plan.isActive || creating === plan.id}
                        onClick={() => (authed ? setConfirmPlan(plan) : router.push('/login?next=/pilih-paket'))}
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
                            <th key={p.id} className="p-3 text-center font-semibold whitespace-nowrap">
                              {p.name}
                              {p.isPopular && <div className="text-[10px] font-normal text-emerald-600">Terpopuler</div>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b bg-muted/30">
                          <td className="p-3 font-medium">Harga / bulan</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-3 text-center font-semibold whitespace-nowrap">
                              {p.monthlyPrice <= 0 ? 'Gratis' : rupiah(p.monthlyPrice)}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b bg-muted/30">
                          <td className="p-3 font-medium">Masa berlaku</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-3 text-center whitespace-nowrap">{p.durationDays} hari</td>
                          ))}
                        </tr>
                        <tr className="border-b bg-muted/30">
                          <td className="p-3 font-medium">Maks akun pengguna</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-3 text-center">{p.maxAccounts}</td>
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
                                  <span className="text-muted-foreground/40" aria-label="Tidak tersedia">—</span>
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
        )}

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
          Pembayaran diverifikasi manual oleh admin — bukti transfer/QRIS tidak langsung mengaktifkan langganan.
          Harga tagihan mengikuti saat tagihan dibuat; perubahan harga paket tidak mempengaruhi tagihan lama.
          {' '}Total transfer = harga paket + kode unik 3 digit agar pembayaran mudah dikenali.
        </p>
      </main>

      {/* ===== Dialog Konfirmasi Paket (Langkah 3) ===== */}
      <Dialog open={!!confirmPlan} onOpenChange={(open) => !open && setConfirmPlan(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          {confirmPlan && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Konfirmasi Pilihan Paket
                  {confirmPlan.slug === 'trial' && (
                    <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300">Trial</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Periksa ringkasan pesanan Anda sebelum membuat tagihan.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-bold">{confirmPlan.name}</div>
                      <div className="text-xs text-muted-foreground">{confirmPlan.description}</div>
                    </div>
                    {confirmPlan.isPopular && (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Terpopuler
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-2xl font-extrabold tracking-tight">
                      {confirmPlan.monthlyPrice <= 0 ? 'Gratis' : rupiah(confirmPlan.monthlyPrice)}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>Masa berlaku {confirmPlan.durationDays} hari</div>
                      <div className="flex items-center justify-end gap-1">
                        <Users className="h-3 w-3" /> Maks {confirmPlan.maxAccounts} akun
                      </div>
                    </div>
                  </div>
                  {confirmPlan.originalPrice && confirmPlan.originalPrice > confirmPlan.monthlyPrice && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Harga normal <span className="line-through">{rupiah(confirmPlan.originalPrice)}</span> — hemat {discountPercent(confirmPlan.monthlyPrice, confirmPlan.originalPrice)}%
                    </div>
                  )}
                  <ul className="mt-3 space-y-1.5 border-t pt-3">
                    {(confirmPlan.features ?? []).slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                    {(confirmPlan.features ?? []).length > 4 && (
                      <li className="pl-6 text-xs text-muted-foreground">+{(confirmPlan.features ?? []).length - 4} fitur lainnya</li>
                    )}
                  </ul>
                </div>

                {confirmPlan.monthlyPrice > 0 ? (
                  <Alert className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40">
                    <Hash className="h-4 w-4 text-violet-600" />
                    <AlertDescription className="text-xs">
                      Total tagihan = harga paket + <b>kode unik 3 digit</b> (001–999). Kode unik ditambahkan
                      ke nominal transfer agar pembayaran Anda mudah dikenali dan tidak tertukar dengan
                      pelanggan lain. Rincian lengkap tampil di halaman pembayaran.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-xs">
                      Paket ini <b>gratis</b> — langganan langsung aktif setelah dikonfirmasi, tanpa pembayaran,
                      sesuai durasi paket.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmPlan(null)} disabled={creating === confirmPlan.id}>
                  Batal
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => createInvoice(confirmPlan)}
                  disabled={creating === confirmPlan.id}
                >
                  {creating === confirmPlan.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Membuat tagihan…
                    </>
                  ) : confirmPlan.monthlyPrice <= 0 ? (
                    'Aktifkan Sekarang'
                  ) : (
                    'Ya, Buat Tagihan'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
