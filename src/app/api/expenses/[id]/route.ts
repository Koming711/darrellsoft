import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

type Params = { params: Promise<{ id: string }> }

function mapExpense(e: {
  id: string
  description: string
  category: string
  amount: number
  notes: string | null
  date: string
}) {
  return {
    id: e.id,
    description: e.description,
    category: e.category,
    amount: e.amount,
    notes: e.notes,
    date: e.date,
  }
}

/** PUT /api/expenses/:id { description?, amount?, date?, category?, notes? } */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.expense.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Biaya tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()

    const data: {
      description?: string
      category?: string
      amount?: number
      notes?: string | null
      date?: string
    } = {}

    if (body.description !== undefined) {
      const description = String(body.description).trim()
      if (!description) {
        return NextResponse.json({ error: 'Nama biaya wajib diisi' }, { status: 400 })
      }
      data.description = description
    }
    if (body.category !== undefined) {
      data.category = String(body.category).trim() || 'Lain-lain'
    }
    if (body.amount !== undefined) {
      const amountNum = Number(body.amount)
      if (body.amount === null || isNaN(amountNum) || amountNum <= 0) {
        return NextResponse.json({ error: 'Nominal biaya harus lebih dari 0' }, { status: 400 })
      }
      data.amount = Math.round(amountNum * 100) / 100
    }
    if (body.notes !== undefined) {
      data.notes = body.notes ? String(body.notes).trim() : null
    }
    if (body.date !== undefined) {
      const dateStr = String(body.date || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return NextResponse.json({ error: 'Tanggal tidak valid' }, { status: 400 })
      }
      data.date = dateStr
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Tidak ada data yang diubah' }, { status: 400 })
    }

    const updated = await db.expense.update({ where: { id }, data })
    return NextResponse.json({ expense: mapExpense(updated) })
  } catch (error) {
    console.error('Error updating expense:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memperbarui biaya operasional') },
      { status: 500 }
    )
  }
}

/** DELETE /api/expenses/:id */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.expense.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Biaya tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.expense.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting expense:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus biaya operasional') },
      { status: 500 }
    )
  }
}
