import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'

// GET single surat jalan
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params
    const suratJalan = await db.suratJalan.findUnique({ where: { id } })
    if (!suratJalan) {
      return NextResponse.json({ error: 'Surat Jalan not found' }, { status: 404 })
    }

    // Check ownership
    if (!canAccessRecord(user, suratJalan.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(suratJalan)
  } catch (error) {
    console.error('GET /api/surat-jalan/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch surat jalan' }, { status: 500 })
  }
}

// PUT update surat jalan
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params

    // Check ownership first
    const existing = await db.suratJalan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Surat Jalan not found' }, { status: 404 })
    }
    if (!canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    // Prevent userId from being changed
    delete body.userId

    const suratJalan = await db.suratJalan.update({
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
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params

    // Check ownership first
    const existing = await db.suratJalan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Surat Jalan not found' }, { status: 404 })
    }
    if (!canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.suratJalan.delete({ where: { id } })
    return NextResponse.json({ message: 'Surat Jalan deleted' })
  } catch (error) {
    console.error('DELETE /api/surat-jalan/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete surat jalan' }, { status: 500 })
  }
}
