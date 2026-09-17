import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/** Map Expense record -> ExpenseRow shape used by the client. */
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

/**
 * GET /api/expenses?from=&to=&category=
 * Filter tanggal inklusif (YYYY-MM-DD, string compare) + filter kategori opsional.
 * orderBy date desc, createdAt desc.
 */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)

    const { searchParams } = new URL(request.url)
    const from = (searchParams.get('from') || '').trim()
    const to = (searchParams.get('to') || '').trim()
    const category = (searchParams.get('category') || '').trim()

    const dateFilter: Record<string, string> = {}
    if (from) dateFilter.gte = from
    if (to) dateFilter.lte = to

    const expenses = await db.expense.findMany({
      where: {
        ...dataFilter,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json(
      { expenses: expenses.map(mapExpense) },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('Error fetching expenses:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memuat data biaya operasional') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/expenses { description, amount, date?, category?, notes? }
 * 201 { expense }.
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const { description, amount, date, category, notes } = body

    if (!description || !String(description).trim()) {
      return NextResponse.json({ error: 'Nama biaya wajib diisi' }, { status: 400 })
    }

    const amountNum = Number(amount)
    if (amount === undefined || amount === null || isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'Nominal biaya harus lebih dari 0' }, { status: 400 })
    }

    let dateStr = String(date || '').trim()
    if (!dateStr) {
      const now = new Date()
      const tz = now.getTimezoneOffset() * 60000
      dateStr = new Date(now.getTime() - tz).toISOString().slice(0, 10)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'Tanggal tidak valid' }, { status: 400 })
    }

    const created = await db.expense.create({
      data: {
        description: String(description).trim(),
        category: (category && String(category).trim()) || 'Lain-lain',
        amount: Math.round(amountNum * 100) / 100,
        notes: notes ? String(notes).trim() : null,
        date: dateStr,
        userId: user?.id || null,
      },
    })

    return NextResponse.json({ expense: mapExpense(created) }, { status: 201 })
  } catch (error) {
    console.error('Error creating expense:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menambah biaya operasional') },
      { status: 500 }
    )
  }
}
