import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/server/context'
import type { Role } from '@/lib/permissions'
import type { BootstrapDTO, CompanyDTO, UserDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bootstrap
 * Daftar perusahaan & pengguna untuk pemilih sesi (tanpa header auth).
 */
export async function GET() {
  try {
    const [companies, users] = await Promise.all([
      db.company.findMany({ orderBy: { name: 'asc' } }),
      db.user.findMany({ orderBy: { name: 'asc' } }),
    ])

    const data: BootstrapDTO = {
      companies: companies.map<CompanyDTO>((c) => ({ id: c.id, name: c.name })),
      users: users.map<UserDTO>((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as Role,
        companyId: u.companyId,
      })),
    }

    return NextResponse.json(data)
  } catch (e) {
    return handleApiError(e)
  }
}
