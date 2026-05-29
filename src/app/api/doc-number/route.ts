import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const dataFilter = await getDataFilter(user)
    const { searchParams } = new URL(request.url)
    const model = searchParams.get('model') // 'riwayatPotongKertas' | 'riwayatCetakan'
    const field = searchParams.get('field') // 'nomorUrut'
    const prefix = searchParams.get('prefix') // 'PK' | 'HC'

    if (!model || !field || !prefix) {
      return NextResponse.json({ error: 'Missing model, field, or prefix' }, { status: 400 })
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const datePrefix = `${prefix}-${year}${month}`

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
      const parts = existingNumber.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    const docNumber = `${datePrefix}-${String(nextNum).padStart(4, '0')}`
    return NextResponse.json({ nextNumber: docNumber })
  } catch (error) {
    console.error('Error previewing doc number:', error)
    return NextResponse.json({ error: 'Failed to preview doc number' }, { status: 500 })
  }
}
