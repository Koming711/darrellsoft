import type { CompanyInfo, DocumentItem, InvoiceData } from '@/lib/types';
import { DEFAULT_COMPANY } from '@/lib/types';

/**
 * Normalisasi data invoice mentah (parsed dari `dataJson` riwayat) menjadi
 * `InvoiceData` yang aman untuk dirender (InvoicePreview / generateInvoicePdf).
 *
 * Latar belakang: data produksi lama / hasil restore backup lama TIDAK
 * menyimpan key `company` di dataJson (hanya type, nomor, client, items, ...).
 * Tanpa normalisasi, `data.company.logo` melempar TypeError dan membuat
 * seluruh halaman crash ("Application error: a client-side exception").
 *
 * `companyFallback` = data toko milik user (fetchUserCompany) agar invoice
 * lama tetap menampilkan konten toko user, bukan konten generik.
 */
export function normalizeInvoiceData(raw: unknown, companyFallback?: Partial<CompanyInfo> | null): InvoiceData {
  const d = (raw ?? {}) as Record<string, unknown>;

  // Company: data tersimpan > data toko user > DEFAULT_COMPANY.
  // (DEFAULT_COMPANY adalah CompanyInfo flat — bukan objek dokumen ber-key `company`.)
  const companyRaw = (d.company && typeof d.company === 'object' ? d.company : null) as Partial<CompanyInfo> | null;
  const companyBase: CompanyInfo = { ...DEFAULT_COMPANY, ...(companyFallback ?? {}) };
  const company: CompanyInfo = { ...companyBase, ...(companyRaw ?? {}) };

  // Client: pastikan selalu objek lengkap.
  const clientRaw = (d.client && typeof d.client === 'object' ? d.client : null) as Partial<InvoiceData['client']> | null;
  const client: InvoiceData['client'] = { nama: '', kontak: '', alamat: '', ...(clientRaw ?? {}) };

  // Items: pastikan array of DocumentItem dengan tipe angka yang benar.
  const itemsRaw = Array.isArray(d.items) ? d.items : [];
  const items: DocumentItem[] = itemsRaw.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `item-${i}`),
      deskripsi: String(o.deskripsi ?? ''),
      qty: Number(o.qty ?? 0),
      satuan: String(o.satuan ?? 'pcs'),
      harga: Number(o.harga ?? 0),
      ...(o.modal !== undefined && o.modal !== null ? { modal: Number(o.modal) } : {}),
    };
  });

  return {
    ...(d as unknown as InvoiceData),
    company,
    client,
    items,
    ppn: Number(d.ppn ?? 0) || 0,
    dp: Number(d.dp ?? 0) || 0,
    ...(d.dpAmount !== undefined && d.dpAmount !== null ? { dpAmount: Number(d.dpAmount) } : {}),
  };
}
