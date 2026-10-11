// /api/biaya/kategori — kategori biaya kustom milik user (per-tenant).
//
// GET  → { defaults: string[], custom: string[] }
// POST { nama } → tambah kategori kustom (dedupe case-insensitive) → { custom }
//
// Disimpan di UserSetting key="biaya_custom_kategori" (JSON array string)
// — pola sama dengan pengaturan per-user lainnya.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

export const dynamic = 'force-dynamic'

const SETTING_KEY = 'biaya_custom_kategori'
const MAX_CUSTOM = 50
const MAX_NAME_LEN = 30

const DEFAULT_KATEGORI = [
  'Listrik', 'Air', 'Tinta', 'Kertas', 'Gaji', 'Sewa', 'Transportasi',
  'Packing', 'Ongkir', 'ATK', 'Maintenance', 'Internet', 'Telepon', 'Lainnya',
]

function parseCustom(raw: string | undefined | null): string[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, MAX_CUSTOM)
  } catch {
    return []
  }
}

async function readSetting(userId: string): Promise<string[]> {
  const row = await db.userSetting.findUnique({
    where: { userId_key: { userId, key: SETTING_KEY } },
  })
  return parseCustom(row?.value)
}

export async function GET(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr
  const user = getServerUser(request)
  if (!user) return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })

  try {
    const custom = await readSetting(user.id)
    return NextResponse.json({ defaults: DEFAULT_KATEGORI, custom })
  } catch (error) {
    console.error('GET /api/biaya/kategori error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat kategori') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr
  const user = getServerUser(request)
  if (!user) return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const nama = String(body?.nama || '').trim()
    if (!nama) {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 })
    }
    if (nama.length > MAX_NAME_LEN) {
      return NextResponse.json({ error: `Nama kategori maksimal ${MAX_NAME_LEN} karakter` }, { status: 400 })
    }

    const custom = await readSetting(user.id)
    const isDefault = DEFAULT_KATEGORI.some((k) => k.toLowerCase() === nama.toLowerCase())
    const isDuplicate = custom.some((k) => k.toLowerCase() === nama.toLowerCase())
    if (isDefault || isDuplicate) {
      return NextResponse.json({ error: `Kategori "${nama}" sudah ada` }, { status: 409 })
    }
    if (custom.length >= MAX_CUSTOM) {
      return NextResponse.json({ error: `Maksimal ${MAX_CUSTOM} kategori kustom` }, { status: 400 })
    }

    const next = [...custom, nama]
    await db.userSetting.upsert({
      where: { userId_key: { userId: user.id, key: SETTING_KEY } },
      update: { value: JSON.stringify(next) },
      create: { userId: user.id, key: SETTING_KEY, value: JSON.stringify(next) },
    })

    return NextResponse.json({ ok: true, added: nama, custom: next })
  } catch (error) {
    console.error('POST /api/biaya/kategori error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal menambah kategori') }, { status: 500 })
  }
}
