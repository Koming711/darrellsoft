import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'

const SLASH_FORMAT_PREFIXES = ['PK', 'HC']

function buildDatePrefix(prefix: string, year: number, month: string): string {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    const yy = String(year).slice(-2)
    return `${prefix}/${month}/${yy}`
  }
  return `${prefix}-${year}${month}`
}

function parseLastSeq(number: string, prefix: string): number {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    const parts = number.split('/')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    return isNaN(lastNum) ? 0 : lastNum
  }
  const parts = number.split('-')
  const lastNum = parseInt(parts[parts.length - 1], 10)
  return isNaN(lastNum) ? 0 : lastNum
}

function buildDocNumber(datePrefix: string, seq: number, prefix: string): string {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    return `${datePrefix}/${String(seq).padStart(4, '0')}`
  }
  return `${datePrefix}-${String(seq).padStart(4, '0')}`
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const dataFilter = await getDataFilter(user)
    const { searchParams } = new URL(request.url)
    const model = searchParams.get('model')
    const field = searchParams.get('field')
    const prefix = searchParams.get('prefix')

    if (!model || !field || !prefix) {
      return NextResponse.json({ error: 'Missing model, field, or prefix' }, { status: 400 })
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const datePrefix = buildDatePrefix(prefix, year, month)

    const lastDoc = await (db as any)[model].findFirst({
      where: {
        ...dataFilter,
        [field]: { startsWith: datePrefix },
      },
      orderBy: { [field]: 'desc' },
    })

    let nextNum = 1
    if (lastDoc) {
      const existingNumber: string = lastDoc[field]
      const lastSeq = parseLastSeq(existingNumber, prefix)
      if (lastSeq > 0) {
        nextNum = lastSeq + 1
      }
    }

    const docNumber = buildDocNumber(datePrefix, nextNum, prefix)
    return NextResponse.json({ nextNumber: docNumber })
  } catch (error) {
    console.error('Error previewing doc number:', error)
    return NextResponse.json({ error: 'Failed to preview doc number' }, { status: 500 })
  }
}
