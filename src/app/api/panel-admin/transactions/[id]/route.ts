// /api/panel-admin/transactions/[id] — soft delete, pulihkan & hapus permanen transaksi (HANYA ADMIN).
// DELETE                → pindahkan ke Sampah (set deletedAt = now, data tidak hilang).
// DELETE ?permanent=1   → hapus permanen dari database — HANYA untuk transaksi yang sudah di Sampah.
// POST                  → pulihkan dari Sampah (set deletedAt = null).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { id } = await params
    const permanent = request.nextUrl.searchParams.get('permanent') === '1'
    const existing = await db.subscriptionPayment.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }
    if (permanent) {
      // Hapus permanen — hanya utk transaksi yang sudah ada di Sampah (alur: riwayat → sampah → permanen)
      if (!existing.deletedAt) {
        return NextResponse.json({ error: 'Hapus permanen hanya untuk transaksi di Sampah' }, { status: 409 })
      }
      await db.subscriptionPayment.delete({ where: { id } })
      return NextResponse.json({ ok: true, message: 'Transaksi dihapus permanen' })
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: 'Transaksi sudah ada di Sampah', idempotent: true }, { status: 409 })
    }
    await db.subscriptionPayment.update({ where: { id }, data: { deletedAt: new Date() } })
    return NextResponse.json({ ok: true, message: 'Transaksi dipindahkan ke Sampah' })
  } catch (error) {
    console.error('DELETE /api/panel-admin/transactions/[id] error:', error)
    return NextResponse.json({ error: 'Gagal menghapus transaksi' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { id } = await params
    const existing = await db.subscriptionPayment.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }
    if (!existing.deletedAt) {
      return NextResponse.json({ error: 'Transaksi tidak ada di Sampah', idempotent: true }, { status: 409 })
    }
    await db.subscriptionPayment.update({ where: { id }, data: { deletedAt: null } })
    return NextResponse.json({ ok: true, message: 'Transaksi dipulihkan ke riwayat' })
  } catch (error) {
    console.error('POST /api/panel-admin/transactions/[id] error:', error)
    return NextResponse.json({ error: 'Gagal memulihkan transaksi' }, { status: 500 })
  }
}
