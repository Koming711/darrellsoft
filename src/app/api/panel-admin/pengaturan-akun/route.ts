import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * PENGATURAN DAFTAR AKUN Panel Admin (Panel Admin → Pengaturan).
 * Disimpan di tabel Setting dan dipakai alur pendaftaran/verifikasi akun:
 *
 * - demo_days               → masa uji coba (hari) akun demo baru
 * - account_verify_required → 'true' = akun baru WAJIB diverifikasi admin
 *                             sebelum bisa login; 'false' = boleh langsung login
 * - account_active_months   → masa berlaku default (bulan) saat verifikasi /
 *                             aktivasi / perpanjangan akun
 * - account_notify_wa       → notifikasi WhatsApp ke admin saat ada pendaftar baru
 */

const ALLOWED_KEYS = [
  'demo_days',
  'account_verify_required',
  'account_active_months',
  'account_notify_wa',
] as const

type AllowedKey = (typeof ALLOWED_KEYS)[number]

const BOOL_KEYS: AllowedKey[] = ['account_verify_required', 'account_notify_wa']
const INT_KEYS: AllowedKey[] = ['demo_days', 'account_active_months']

function validate(key: string, value: unknown): { ok: boolean; value?: string; error?: string } {
  const s = String(value ?? '').trim()
  if (BOOL_KEYS.includes(key as AllowedKey)) {
    return { ok: true, value: s === 'true' ? 'true' : 'false' }
  }
  if (INT_KEYS.includes(key as AllowedKey)) {
    const n = parseInt(s, 10)
    if (!Number.isFinite(n) || n < 1) {
      return { ok: false, error: `${key} harus berupa angka minimal 1.` }
    }
    if (key === 'demo_days' && n > 365) return { ok: false, error: 'Masa demo maksimal 365 hari.' }
    if (key === 'account_active_months' && n > 120) return { ok: false, error: 'Masa berlaku maksimal 120 bulan.' }
    return { ok: true, value: String(n) }
  }
  return { ok: false, error: `Kunci pengaturan tidak dikenal: ${key}` }
}

export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const settings = await db.setting.findMany({
      where: { key: { in: [...ALLOWED_KEYS] } },
      select: { key: true, value: true },
    })
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
    return NextResponse.json({
      settings: {
        demo_days: map.demo_days ?? '7',
        account_verify_required: map.account_verify_required ?? 'false',
        account_active_months: map.account_active_months ?? '1',
        account_notify_wa: map.account_notify_wa ?? 'false',
      },
    })
  } catch (error) {
    console.error('Panel admin pengaturan-akun GET error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat pengaturan akun.') }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const body = await request.json()
    const updates = body?.settings
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Body settings tidak valid.' }, { status: 400 })
    }

    const saved: Record<string, string> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.includes(key as AllowedKey)) continue
      const v = validate(key, value)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      await db.setting.upsert({
        where: { key },
        update: { value: v.value! },
        create: { key, value: v.value! },
      })
      saved[key] = v.value!
    }

    return NextResponse.json({ success: true, settings: saved })
  } catch (error) {
    console.error('Panel admin pengaturan-akun PUT error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal menyimpan pengaturan akun.') }, { status: 500 })
  }
}
