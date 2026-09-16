// Ensures a linked invoice-pelunasan entry exists and is in sync when an
// invoice with DP is saved or updated.
//
// Why this exists:
// The Editor Pelunasan tab only lists documents of docType "invoice-pelunasan".
// A regular "invoice" with dp > 0 will NOT appear there on its own — it needs a
// linked pelunasan entry. The CREATE flow used to create one, but the UPDATE
// flow (restore an invoice, add DP, save) did not — so invoices that gained a
// DP during an edit never showed up in Editor Pelunasan. This helper fixes that
// by being called from BOTH flows.
//
// Behavior:
// - If the invoice has no DP (dp <= 0), does nothing.
// - Fetches all invoice-pelunasan entries and looks for one linked to this
//   invoice (by referensiInvoiceId or referensiInvoiceNomor).
// - If a linked entry exists: PUT-updates it to sync items/amounts/company/
//   client/dp/tanggal, while PRESERVING its lunas / tanggalPelunasan /
//   tanggalJatuhTempo / caraPembayaran state.
// - If no linked entry exists: POST-creates a new one (PEL/<nomor>) just like
//   the original CREATE flow did.
import { getAuthHeaders } from '@/lib/auth';
import type { InvoiceData } from '@/lib/types';

type BaseData = InvoiceData & { dpAmount: number; originalTotal: number };

export async function syncLinkedPelunasan(
  invoiceId: string | number,
  invNomor: string,
  baseData: BaseData,
): Promise<void> {
  // Only sync when the invoice actually has DP
  if (!baseData.dp || baseData.dp <= 0) return;
  try {
    const pelRes = await fetch('/api/history?docType=invoice-pelunasan', { headers: getAuthHeaders() });
    const pelJson = pelRes.ok ? await pelRes.json() : { data: [] };
    const pelEntries: Array<{ id: string | number; nomor: string; dataJson: string }> = pelJson.data || [];
    const linked = pelEntries.find((e) => {
      try {
        const p = JSON.parse(e.dataJson);
        return String(p.referensiInvoiceId) === String(invoiceId) || p.referensiInvoiceNomor === invNomor;
      } catch {
        return false;
      }
    });

    const pelunasanData: Record<string, unknown> = {
      ...baseData,
      type: 'invoice-pelunasan',
      referensiInvoiceId: invoiceId,
      referensiInvoiceNomor: invNomor,
      lunas: false,
      tanggalPelunasan: '',
    };

    if (linked) {
      // Preserve settlement state from the existing linked entry
      try {
        const existingParsed = JSON.parse(linked.dataJson);
        pelunasanData.lunas = existingParsed.lunas === true;
        pelunasanData.tanggalPelunasan = existingParsed.tanggalPelunasan || '';
        pelunasanData.tanggalJatuhTempo = existingParsed.tanggalJatuhTempo || '';
        pelunasanData.caraPembayaran = existingParsed.caraPembayaran || '';
        // Item pelunasan adalah milik user: bisa diedit lewat tab Pelunasan
        // (Editor Invoice Pelunasan). Jangan timpa item dari invoice DP setiap
        // kali invoice DP di-save ulang / Tandai Lunas — kalau tidak, hasil
        // edit item di tab Pelunasan selalu terbalikkan ke item invoice DP.
        if (Array.isArray(existingParsed.items)) {
          pelunasanData.items = existingParsed.items;
        }
      } catch {
        /* keep defaults */
      }
      await fetch(`/api/history/${linked.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          nomor: linked.nomor || invNomor.replace(/^INV/, 'PEL'),
          tanggal: baseData.tanggal || '',
          pihakKedua: baseData.client?.nama || '-',
          total: '-',
          dataJson: JSON.stringify(pelunasanData),
        }),
      });
    } else {
      // Create a new linked pelunasan entry
      const pelNomor = invNomor.replace(/^INV/, 'PEL');
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          docType: 'invoice-pelunasan',
          customNomor: pelNomor,
          tanggal: baseData.tanggal || '',
          pihakKedua: baseData.client?.nama || '-',
          total: '-',
          dataJson: JSON.stringify(pelunasanData),
        }),
      });
    }
  } catch (e) {
    console.error('Failed to sync linked pelunasan entry:', e);
  }
}
