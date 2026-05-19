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
