import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { sanitizeError } from '@/lib/api-error'

export async function GET() {
  const results: Record<string, string> = {}

  results['DATABASE_URL'] = process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : 'NOT SET'

  try {
    const userCount = await db.pengguna.count()
    results['pengguna_count'] = String(userCount)
    results['db_connection'] = 'OK'
  } catch (err: any) {
    results['db_connection'] = 'FAILED'
    results['db_error'] = sanitizeError(err, 'Database connection failed')
  }

  try {
    await db.$queryRaw`SELECT current_database(), current_user`
    results['raw_query'] = 'OK'
  } catch (err: any) {
    results['raw_query'] = 'FAILED'
    results['raw_error'] = sanitizeError(err, 'Raw query failed')
  }

  return NextResponse.json(results)
}
