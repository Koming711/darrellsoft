import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/** Kode customer otomatis: C001, C002, ... (max nomor existing + 1) */
function nextCode(codes: string[]): string {
  let max = 0
  for (const c of codes) {
    const m = /^C(\d+)$/.exec(c)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `C${String(max + 1).padStart(3, '0')}`
}

/** GET /api/customers/next-code — kode customer berikutnya, mis. { code: "C004" } */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const customers = await db.customer.findMany({
      where: { code: { startsWith: 'C' } },
      select: { code: true },
    })

    return NextResponse.json({ code: nextCode(customers.map((c) => c.code)) })
  } catch (error: unknown) {
    console.error('Error generating next customer code:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal membuat kode customer') },
      { status: 500 }
    )
  }
}
