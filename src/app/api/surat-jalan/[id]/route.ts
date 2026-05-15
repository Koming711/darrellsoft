import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET single surat jalan
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const suratJalan = await prisma.suratJalan.findUnique({ where: { id } })
    if (!suratJalan) {
      return NextResponse.json({ error: 'Surat Jalan not found' }, { status: 404 })
    }
    return NextResponse.json(suratJalan)
  } catch (error) {
    console.error('GET /api/surat-jalan/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch surat jalan' }, { status: 500 })
  }
}

// PUT update surat jalan
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const suratJalan = await prisma.suratJalan.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(suratJalan)
  } catch (error) {
    console.error('PUT /api/surat-jalan/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update surat jalan' }, { status: 500 })
  }
}

// DELETE surat jalan
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.suratJalan.delete({ where: { id } })
    return NextResponse.json({ message: 'Surat Jalan deleted' })
  } catch (error) {
    console.error('DELETE /api/surat-jalan/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete surat jalan' }, { status: 500 })
  }
}
