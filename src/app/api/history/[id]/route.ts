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
    const { dataJson, nomor, tanggal, pihakKedua, total } = body;

    if (!dataJson) {
      return NextResponse.json({ error: 'dataJson wajib diisi' }, { status: 400 });
    }

    // Parse the incoming dataJson to validate it's valid JSON
    try {
      JSON.parse(dataJson);
    } catch {
      return NextResponse.json({ error: 'dataJson harus berupa JSON valid' }, { status: 400 });
    }

    // Build update data — always include dataJson, optionally include other fields
    const updateData: Record<string, unknown> = { dataJson };
    if (nomor !== undefined) updateData.nomor = nomor;
    if (tanggal !== undefined) updateData.tanggal = tanggal;
    if (pihakKedua !== undefined) updateData.pihakKedua = pihakKedua;
    if (total !== undefined) updateData.total = total;

    const updated = await db.documentHistory.update({
      where: { id },
      data: updateData,
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

    // Jika yang dihapus adalah invoice DP, hapus juga dokumen pelunasan (PEL)
    // yang ter-link — agar laporan tidak menyisakan transaksi yatim.
    if (existing.docType === 'invoice') {
      try {
        const pelNomor = existing.nomor?.replace(/^INV/, 'PEL');
        const pelRows = await db.documentHistory.findMany({
          where: { docType: 'invoice-pelunasan', userId: existing.userId ?? undefined },
          select: { id: true, nomor: true, dataJson: true },
        });
        const pelIds = pelRows
          .filter((r) => {
            if (pelNomor && r.nomor === pelNomor) return true;
            try {
              const parsed = JSON.parse(r.dataJson || '{}');
              return parsed?.referensiInvoiceId === existing.id;
            } catch {
              return false;
            }
          })
          .map((r) => r.id);
        if (pelIds.length > 0) {
          await db.documentHistory.deleteMany({ where: { id: { in: pelIds } } });
        }
      } catch (cleanupErr) {
        console.error('Error cleaning linked pelunasan docs:', cleanupErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting history entry:', error);
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 });
  }
}
