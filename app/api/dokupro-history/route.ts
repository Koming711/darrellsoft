import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { docType, nomor, tanggal, pihakKedua, total, dataJson, userId } = body

    if (!docType || !nomor || !dataJson) {
      return NextResponse.json({ error: 'docType, nomor, and dataJson are required' }, { status: 400 })
    }

    const doc = await db.documentHistory.create({
      data: {
        docType,
        nomor,
        tanggal: tanggal || '',
        pihakKedua: pihakKedua || '',
        total: total || '',
        dataJson,
        userId: userId || null,
      },
    })

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('Error saving document history:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const docType = searchParams.get('docType')

    const where: Record<string, string> = {}
    if (docType) where.docType = docType

    const docs = await db.documentHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ data: docs })
  } catch (error) {
    console.error('Error fetching document history:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
