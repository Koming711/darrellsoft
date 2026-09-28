import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/** Kode CUST-xxx unik per user: mulai dari count+1, loop sampai unik.
 *  (logika sama dengan POST /api/customers). */
async function nextCode(userId: string | null): Promise<string> {
  const count = await db.customer.count({ where: { userId } })
  let n = count + 1
  for (;;) {
    const code = `CUST-${String(n).padStart(3, '0')}`
    const exists = await db.customer.findFirst({ where: { userId, code } })
    if (!exists) return code
    n += 1
  }
}

/** GET /api/customers/next-code — kode customer berikutnya, mis. { code: "CUST-006" } */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)

    return NextResponse.json({ code: await nextCode(user?.id ?? null) })
  } catch (error: unknown) {
    console.error('Error generating next customer code:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal membuat kode customer') },
      { status: 500 }
    )
  }
}
