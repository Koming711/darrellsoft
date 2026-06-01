import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser } from '@/lib/server-auth'

function buildDatePrefix(prefix: string, year: number, month: string): string {
  return `${prefix}-${String(year).slice(-2)}${month}`
}

function parseLastSeq(number: string, prefix: string): number {
  const parts = number.split('-')
  const lastNum = parseInt(parts[parts.length - 1], 10)
  return isNaN(lastNum) ? 0 : lastNum
}

function buildDocNumber(datePrefix: string, seq: number): string {
  return `${datePrefix}-${String(seq).padStart(4, '0')}`
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const prefix = searchParams.get('prefix')

    if (!prefix) {
      return NextResponse.json({ error: 'Missing prefix' }, { status: 400 })
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const datePrefix = buildDatePrefix(prefix, year, month)

    let maxSeq = 0

    // Single table lookup (global - no userId filter to prevent duplicates)
    const model = searchParams.get('model')
    const field = searchParams.get('field')
    if (!model || !field) {
      return NextResponse.json({ error: 'Missing model or field' }, { status: 400 })
    }
    const lastDoc = await (db as any)[model].findFirst({
      where: { [field]: { startsWith: datePrefix } },
      orderBy: { [field]: 'desc' },
    })
    if (lastDoc) {
      const seq = parseLastSeq(lastDoc[field], prefix)
      if (seq > maxSeq) maxSeq = seq
    }

    const nextNum = maxSeq + 1
    const docNumber = buildDocNumber(datePrefix, nextNum)
    return NextResponse.json({ nextNumber: docNumber })
  } catch (error) {
    console.error('Error previewing doc number:', error)
    return NextResponse.json({ error: 'Failed to preview doc number' }, { status: 500 })
  }
}
