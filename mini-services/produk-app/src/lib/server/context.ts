import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { can, type Permission, type Role } from '@/lib/permissions'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface SessionContext {
  companyId: string
  userId: string
  role: Role
  userName: string
}

/** Ambil sesi dari header X-Company-Id & X-User-Id (dipilih pengguna di UI). */
export async function getSession(req: Request): Promise<SessionContext> {
  const companyId = req.headers.get('x-company-id')
  const userId = req.headers.get('x-user-id')
  if (!companyId || !userId) {
    throw new ApiError(400, 'Pilih perusahaan dan pengguna terlebih dahulu.')
  }
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || user.companyId !== companyId) {
    throw new ApiError(403, 'Pengguna tidak terdaftar pada perusahaan ini.')
  }
  return { companyId, userId, role: user.role as Role, userName: user.name }
}

/** Ambil sesi + pastikan pengguna punya izin tertentu. */
export async function requirePerm(req: Request, perm: Permission): Promise<SessionContext> {
  const session = await getSession(req)
  if (!can(session.role, perm)) {
    throw new ApiError(403, `Anda tidak memiliki izin untuk ${perm.replace(':', ' ')}.`)
  }
  return session
}

/** Parse tanggal 'YYYY-MM-DD' → Date pukul 12:00 UTC (aman zona waktu). */
export function parseDay(value: string | null | undefined, field = 'Tanggal'): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${field} tidak valid (harus format YYYY-MM-DD).`)
  }
  return new Date(`${value}T12:00:00.000Z`)
}

/** Ubah Date → 'YYYY-MM-DD'. */
export function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Handler error terpusat untuk route handlers. */
export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  console.error('[API Error]', e)
  const message = e instanceof Error ? e.message : 'Terjadi kesalahan pada server.'
  return NextResponse.json({ error: message }, { status: 500 })
}
