import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth';

// GET /api/history/[id] — Get a single history entry (per-user isolation)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request);
    if (authErr) return authErr;
    const user = getServerUser(request)!;

    const { id } = await params;
    const entry = await db.documentHistory.findUnique({ where: { id } });

    if (!entry) {
      return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    }

    // Check ownership
    if (!canAccessRecord(user, entry.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching history entry:', error);
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 });
  }
}

// PUT /api/history/[id] — Update a history entry's dataJson (e.g. status pembayaran)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request);
    if (authErr) return authErr;
    const user = getServerUser(request)!;

    const { id } = await params;

    // Check ownership first
    const existing = await db.documentHistory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    }

    if (!canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const body = await request.json();
    const { dataJson } = body;

    if (!dataJson) {
      return NextResponse.json({ error: 'dataJson wajib diisi' }, { status: 400 });
    }

    // Parse the incoming dataJson to validate it's valid JSON
    try {
      JSON.parse(dataJson);
    } catch {
      return NextResponse.json({ error: 'dataJson harus berupa JSON valid' }, { status: 400 });
    }

    const updated = await db.documentHistory.update({
      where: { id },
      data: { dataJson },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating history entry:', error);
    return NextResponse.json({ error: 'Gagal mengupdate' }, { status: 500 });
  }
}

// DELETE /api/history/[id] — Delete a history entry (per-user isolation)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request);
    if (authErr) return authErr;
    const user = getServerUser(request)!;

    const { id } = await params;

    // Check ownership first
    const existing = await db.documentHistory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    }

    if (!canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    await db.documentHistory.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting history entry:', error);
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 });
  }
}
