import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/server-auth'
import { createProtectedExcel } from '@/lib/backup-excel'

// Map of master table keys to Prisma models and display names
const MASTER_TABLES: Record<string, { model: any; name: string }> = {
  finishing: { model: db.finishing, name: 'Master Finishing' },
  printing_cost: { model: db.printingCost, name: 'Master Ongkos Cetak' },
  paper: { model: db.paper, name: 'Master Harga Kertas' },
  customer: { model: db.customer, name: 'Master Customer' },
}

function getUserFromRequest(req: NextRequest) {
  let userId = req.cookies.get('userId')?.value
  let userRole = req.cookies.get('userRole')?.value

  if (!userId || !userRole) {
    userId = userId || req.headers.get('x-user-id')
    userRole = userRole || req.headers.get('x-user-role')
  }

  // Fallback: query params (for window.open downloads)
  if (!userId || !userRole) {
    userId = userId || req.nextUrl.searchParams.get('uid')
    userRole = userRole || req.nextUrl.searchParams.get('role')
  }

  if (!userId || !userRole) return null
  return { id: userId, role: userRole }
}

// GET: Backup a specific master table as protected Excel (download via browser)
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  try {
    const table = req.nextUrl.searchParams.get('table')
    if (!table || !MASTER_TABLES[table]) {
      return NextResponse.json(
        { success: false, error: `Tabel master "${table}" tidak valid. Pilihan: ${Object.keys(MASTER_TABLES).join(', ')}` },
        { status: 400 }
      )
    }

    const filter = user ? { userId: user.id } : { id: '__unauthenticated__' }
    const tableConfig = MASTER_TABLES[table]
    const data = await tableConfig.model.findMany({ where: filter, orderBy: { createdAt: 'desc' } })

    const excelBuffer = await createProtectedExcel(tableConfig.name, data, {
      type: 'master-backup',
      table,
      tableName: tableConfig.name,
    })

    const fileName = `backup-${table}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(excelBuffer.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Master backup error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan backup master' },
      { status: 500 }
    )
  }
}

// POST: Backup a specific master table as protected Excel (for fetch-based download)
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  try {
    const { table } = await req.json()
    if (!table || !MASTER_TABLES[table]) {
      return NextResponse.json(
        { success: false, error: `Tabel master "${table}" tidak valid. Pilihan: ${Object.keys(MASTER_TABLES).join(', ')}` },
        { status: 400 }
      )
    }

    const filter = { userId: user.id }
    const tableConfig = MASTER_TABLES[table]
    const data = await tableConfig.model.findMany({ where: filter, orderBy: { createdAt: 'desc' } })

    const excelBuffer = await createProtectedExcel(tableConfig.name, data, {
      type: 'master-backup',
      table,
      tableName: tableConfig.name,
    })

    const fileName = `backup-${table}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(excelBuffer.length),
        'X-Backup-Count': String(data.length),
        'X-Backup-Table': table,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Master backup error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan backup master' },
      { status: 500 }
    )
  }
}
