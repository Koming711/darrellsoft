import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/history — Save a document to history
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { docType, nomor, tanggal, pihakKedua, total, dataJson } = body;

    if (!docType || !nomor || !dataJson) {
      return NextResponse.json({ error: 'docType, nomor, dataJson wajib diisi' }, { status: 400 });
    }

    // Check for duplicate: same docType + same content (regardless of nomor)
    const parsed = JSON.parse(dataJson);
    const items = parsed.items || [];
    const client = parsed.client || parsed.penerima || parsed.pemasok || {};
    const pihakNama = client.nama || pihakKedua || '-';

    // Build a content-based fingerprint (without nomor — same content = duplicate)
    const itemFingerprint = items.map((it: any) =>
      `${it.deskripsi || ''}|${it.qty || 0}|${it.harga || 0}`
    ).join(';;');

    const fingerprint = `${docType}||${pihakNama}||${itemFingerprint}`;

    // Check ALL existing records with same docType
    const existingRecords = await db.documentHistory.findMany({
      where: { docType },
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
      },
    });

    return NextResponse.json({ success: true, id: history.id });
  } catch (error) {
    console.error('Error saving document history:', error);
    return NextResponse.json({ error: 'Gagal menyimpan' }, { status: 500 });
  }
}

// GET /api/history?docType=invoice — List history by document type
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docType = searchParams.get('docType');

    if (!docType) {
      return NextResponse.json({ error: 'docType wajib diisi' }, { status: 400 });
    }

    const history = await db.documentHistory.findMany({
      where: { docType },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching document history:', error);
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 });
  }
}
