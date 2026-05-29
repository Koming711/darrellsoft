import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth';

// POST /api/history — Save a document to history (per-user isolation)
export async function POST(req: NextRequest) {
  try {
    const user = getServerUser(req);
    const authErr = requireAuth(req);
    if (authErr) return authErr;

    const body = await req.json();
    const { docType, nomor, tanggal, pihakKedua, total, dataJson } = body;

    if (!docType || !nomor || !dataJson) {
      return NextResponse.json({ error: 'docType, nomor, dataJson wajib diisi' }, { status: 400 });
    }

    // Check for duplicate: same docType + same content (within user's own records)
    const parsed = JSON.parse(dataJson);
    const items = parsed.items || [];
    const client = parsed.client || parsed.penerima || parsed.pemasok || {};
    const pihakNama = client.nama || pihakKedua || '-';

    // Build a content-based fingerprint (without nomor — same content = duplicate)
    const itemFingerprint = items.map((it: any) =>
      `${it.deskripsi || ''}|${it.qty || 0}|${it.harga || 0}`
    ).join(';;');

    const fingerprint = `${docType}||${pihakNama}||${itemFingerprint}`;

    // Only check THIS user's records for duplicates
    const dataFilter = await getDataFilter(user);
    const existingRecords = await db.documentHistory.findMany({
      where: { docType, ...dataFilter },
    });

    for (const existing of existingRecords) {
      try {
        const existParsed = JSON.parse(existing.dataJson);
        const existItems = existParsed.items || [];
        const existClient = existParsed.client || existParsed.penerima || existParsed.pemasok || {};
        const existPihakNama = existClient.nama || existing.pihakKedua || '-';
        const existFingerprint = `${existing.docType}||${existPihakNama}||${existItems.map((it: any) =>
          `${it.deskripsi || ''}|${it.qty || 0}|${it.harga || 0}`
        ).join(';;')}`;

        if (fingerprint === existFingerprint) {
          return NextResponse.json({ error: 'Data sudah ada di riwayat, tidak disimpan ulang.', duplicate: true, id: existing.id }, { status: 409 });
        }
      } catch {
        // If parsing fails for this record, skip and check next
      }
    }

    const history = await db.documentHistory.create({
      data: {
        docType,
        nomor,
        tanggal: tanggal || '',
        pihakKedua: pihakKedua || '-',
        total: total || '-',
        dataJson,
        userId: user!.id,
      },
    });

    return NextResponse.json({ success: true, id: history.id });
  } catch (error) {
    console.error('Error saving document history:', error);
    return NextResponse.json({ error: 'Gagal menyimpan' }, { status: 500 });
  }
}

// GET /api/history?docType=invoice&startDate=2024-01-01&endDate=2024-12-31 — List history by document type (per-user isolation)
export async function GET(req: NextRequest) {
  try {
    const user = getServerUser(req);
    const authErr = requireAuth(req);
    if (authErr) return authErr;

    const { searchParams } = new URL(req.url);
    const docType = searchParams.get('docType');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!docType) {
      return NextResponse.json({ error: 'docType wajib diisi' }, { status: 400 });
    }

    // Apply per-user filter
    const dataFilter = await getDataFilter(user);

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (startDateStr) {
      const start = new Date(startDateStr);
      start.setHours(0, 0, 0, 0);
      dateFilter.gte = start;
    }
    if (endDateStr) {
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const where: Record<string, unknown> = { docType, ...dataFilter };
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter;
    }

    const history = await db.documentHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching document history:', error);
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 });
  }
}
