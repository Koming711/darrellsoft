import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth';
import { generateDocumentHistoryNumber } from '@/lib/doc-number';

// Prefix mapping for doc types
const DOC_PREFIX: Record<string, 'INV' | 'PEL' | 'PO' | 'SJ' | 'SPK'> = {
  'invoice': 'INV',
  'invoice-pelunasan': 'PEL',
  'purchase-order': 'PO',
  'surat-jalan': 'SJ',
  'spk': 'SPK',
};

// POST /api/history/generate-number?docType=invoice
// Atomically generates and reserves the NEXT sequential document number.
// The persistent counter is incremented, so the number is "consumed" even if
// the caller never uses it (deleted numbers are never reused).
//
// Used by the invoice "Gabungkan" feature: the merged result gets a brand-new
// number instead of keeping the primary's existing number.
export async function POST(req: NextRequest) {
  try {
    const authErr = requireAuth(req);
    if (authErr) return authErr;
    const user = getServerUser(req)!;

    const { searchParams } = new URL(req.url);
    const docType = searchParams.get('docType') || 'invoice';

    const prefix = DOC_PREFIX[docType];
    if (!prefix) {
      return NextResponse.json({ error: 'Unknown docType' }, { status: 400 });
    }

    const dataFilter = await getDataFilter(user);
    const nomor = await generateDocumentHistoryNumber(prefix, docType, dataFilter);

    // Safety: if for some reason the generated number already exists as a
    // documentHistory row (extremely unlikely due to the counter), still return it —
    // the caller (PUT) will overwrite that row's content only if it targets the same id.
    return NextResponse.json({ success: true, nomor });
  } catch (error) {
    console.error('Error generating document number:', error);
    return NextResponse.json({ error: 'Gagal generate nomor' }, { status: 500 });
  }
}
