import { db } from '@/lib/db'

/**
 * Katalog Paket Premium — persisten di tabel Setting (key: premium_plans_v1).
 *
 * Harga, masa berlaku, perincian fitur, dan harga coret (diskon) dapat
 * diedit admin dari Panel Admin → Paket Premium. Semua konsumen harga
 * (checkout, landing page, aktivasi Midtrans) membaca dari sini agar
 * konsisten; fallback ke DEFAULT_PLANS bila belum pernah disimpan.
 */

export const PLANS_SETTING_KEY = 'premium_plans_v1'

export interface PremiumPlan {
  id: string
  name: string
  subtitle: string
  /** Harga jual saat ini (Rupiah) */
  price: number
  /** Harga normal sebelum diskon — ditampilkan dengan angka coret. null = tanpa diskon */
  originalPrice: number | null
  /** Label periode, mis. "/bulan (1 akun)" */
  period: string
  /** Masa berlaku langganan (bulan) — dipakai saat aktivasi pembayaran */
  durationMonths: number
  /** Maksimal akun pengguna dalam langganan */
  maxAccounts: number
  /** Perincian fitur paket (tiap item satu baris) */
  features: string[]
  /** Paket tampil & bisa dibeli */
  active: boolean
}

export const DEFAULT_PLANS: PremiumPlan[] = [
  {
    id: 'bulanan-ekonomis',
    name: 'Ekonomis',
    subtitle: 'Bulanan Ekonomis',
    price: 78000,
    originalPrice: null,
    period: '/bulan (1 akun)',
    durationMonths: 1,
    maxAccounts: 1,
    features: [
      'Hitung ongkos cetak',
      'Master harga kertas',
      'Hitung finishing',
      'Potong kertas',
      'Maksimal 1 akun pengguna',
    ],
    active: true,
  },
  {
    id: 'bulanan',
    name: 'Basic',
    subtitle: 'Langganan Bulanan',
    price: 128000,
    originalPrice: null,
    period: '/bulan',
    durationMonths: 1,
    maxAccounts: 2,
    features: [
      'Hitung ongkos cetak',
      'Master harga kertas',
      'Hitung finishing',
      'Potong kertas',
      'Riwayat cetakan',
      'Maksimal 2 akun pengguna',
    ],
    active: true,
  },
  {
    id: 'tahunan',
    name: 'Premium',
    subtitle: 'Langganan Tahunan',
    price: 888000,
    originalPrice: 1536000,
    period: '/tahun (hemat 42%)',
    durationMonths: 12,
    maxAccounts: 2,
    features: [
      'Semua fitur Basic',
      'Multi perangkat',
      'Master customer',
      'Invoice & surat jalan',
      'Export laporan',
      'Priority support',
      'Maksimal 2 akun pengguna',
    ],
    active: true,
  },
]

/** Config lama untuk paket lifetime (pembayaran lama) */
const LEGACY_PLAN_CONFIG: Record<string, { durationMonths: number; maxAccounts: number }> = {
  lifetime: { durationMonths: 1200, maxAccounts: 2 },
}

function sanitizePlan(raw: unknown, index: number): PremiumPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `paket-${index + 1}`
  const price = Math.max(0, Math.round(Number(r.price) || 0))
  const rawOriginal = r.originalPrice === null || r.originalPrice === undefined || r.originalPrice === ''
    ? null
    : Math.max(0, Math.round(Number(r.originalPrice) || 0))
  const originalPrice = rawOriginal !== null && rawOriginal > price ? rawOriginal : null
  const features = Array.isArray(r.features)
    ? r.features.map((f) => String(f).trim()).filter(Boolean).slice(0, 20)
    : []
  return {
    id,
    name: String(r.name || `Paket ${index + 1}`).slice(0, 60),
    subtitle: String(r.subtitle || '').slice(0, 120),
    price,
    originalPrice,
    period: String(r.period || '').slice(0, 60),
    durationMonths: Math.max(1, Math.round(Number(r.durationMonths) || 1)),
    maxAccounts: Math.max(1, Math.round(Number(r.maxAccounts) || 1)),
    features,
    active: r.active !== false,
  }
}

/** Ambil katalog paket tersimpan (fallback: DEFAULT_PLANS). Server-side only. */
export async function getPlans(): Promise<PremiumPlan[]> {
  try {
    const setting = await db.setting.findUnique({ where: { key: PLANS_SETTING_KEY } })
    if (!setting?.value) return DEFAULT_PLANS
    const parsed = JSON.parse(setting.value)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PLANS
    const plans = parsed
      .map((p: unknown, i: number) => sanitizePlan(p, i))
      .filter((p: PremiumPlan | null): p is PremiumPlan => p !== null)
    return plans.length > 0 ? plans : DEFAULT_PLANS
  } catch {
    return DEFAULT_PLANS
  }
}

/** Simpan katalog paket. Melempar error bila tidak valid. Server-side only. */
export async function savePlans(input: unknown): Promise<PremiumPlan[]> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Daftar paket tidak boleh kosong.')
  }
  if (input.length > 12) {
    throw new Error('Maksimal 12 paket.')
  }
  const plans = input
    .map((p: unknown, i: number) => sanitizePlan(p, i))
    .filter((p: PremiumPlan | null): p is PremiumPlan => p !== null)
  if (plans.length === 0) throw new Error('Data paket tidak valid.')
  const ids = new Set<string>()
  for (const p of plans) {
    if (ids.has(p.id)) throw new Error(`ID paket duplikat: ${p.id}`)
    ids.add(p.id)
  }
  const value = JSON.stringify(plans)
  await db.setting.upsert({
    where: { key: PLANS_SETTING_KEY },
    update: { value },
    create: { key: PLANS_SETTING_KEY, value },
  })
  return plans
}

/**
 * Durasi & jumlah akun untuk sebuah packageType (dipakai aktivasi Midtrans).
 * Prioritas: katalog tersimpan → LEGACY (lifetime) → fallback 1 bulan.
 */
export async function getPlanConfig(
  packageType: string
): Promise<{ durationMonths: number; maxAccounts: number }> {
  const plans = await getPlans()
  const found = plans.find((p) => p.id === packageType)
  if (found) return { durationMonths: found.durationMonths, maxAccounts: found.maxAccounts }
  if (LEGACY_PLAN_CONFIG[packageType]) return LEGACY_PLAN_CONFIG[packageType]
  return { durationMonths: 1, maxAccounts: 1 }
}

/** Format Rupiah singkat untuk server-rendered payload */
export const formatRupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
