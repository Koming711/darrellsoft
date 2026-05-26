'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { useDokuproStore } from '@/lib/store';
import { CompanyFields } from './company-fields';
import { ItemsFields } from './items-fields';
import { InvoicePreview } from './invoice-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { HistoryTable } from './history-table';
import { DocumentActionButtons } from './document-action-buttons';
import { formatRupiah } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/types';

interface RiwayatCetakanItem {
  id: string;
  printName: string;
  customerName: string;
  paperName: string;
  paperGrammage: string;
  cutWidth: string;
  cutHeight: string;
  quantity: string;
  jumlahPesanan: string;
  berapaMata: string;
  warna: string;
  machineName: string;
  ongkosCetak: number;
  machineName2: string;
  ongkosCetak2: number;
  totalPaperPrice: number;
  pricePerSheet: number;
  finishingNames: string;
  finishingCost: number;
  packingCost: number;
  shippingCost: number;
  otherCost: number;
  otherCost2: number;
  otherCostLabel: string;
  otherCostLabel2: string;
  glueCost: number;
  glueBorongan: number;
  subTotal: number;
  profitPercent: number;
  profitAmount: number;
  grandTotal: number;
  createdAt: string;
}

export function InvoiceEditor() {
  const invoice = useDokuproStore((s) => s.invoice);
  const setInvoice = useDokuproStore((s) => s.setInvoice);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);
  const router = useRouter();

  const searchParams = useSearchParams();
  const riwayatIdFromUrl = searchParams.get('riwayatId');
  const autoSelectRef = useRef(false);
  const [savingSj, setSavingSj] = useState(false);

  // Riwayat cetakan dropdown state
  const [riwayatList, setRiwayatList] = useState<RiwayatCetakanItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(invoice.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchRiwayatCetakan = useCallback(async () => {
    try {
      const res = await fetch('/api/riwayat-cetakan', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRiwayatList(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadCompanyFromAPI() }, [loadCompanyFromAPI]);
  useEffect(() => { fetchRiwayatCetakan() }, [fetchRiwayatCetakan]);

  // Sync referensiInput when invoice.referensi changes externally
  useEffect(() => { setReferensiInput(invoice.referensi) }, [invoice.referensi]);

  // Filter riwayat list by input
  const filteredRiwayatList = riwayatList.filter((r) => {
    const search = referensiInput.toLowerCase().trim();
    if (!search) return true;
    const printName = (r.printName || '').toLowerCase();
    const name = (r.customerName || '').toLowerCase();
    return printName.includes(search) || name.includes(search);
  });

  const handleReferensiInputChange = (value: string) => {
    setReferensiInput(value);
    setInvoice({ ...invoice, referensi: value });
    setDropdownOpen(true);
  };

  const handleReferensiSelect = (item: RiwayatCetakanItem) => {
    const ref = item.printName || '';
    setReferensiInput(ref);

    // Build single item with multi-line description
    const descLines: string[] = [];

    // Line 1: Nama Barang
    if (item.printName) descLines.push(item.printName);

    // Line 2: Nama Bahan
    const bahanParts: string[] = [];
    if (item.paperName) bahanParts.push(item.paperName);
    if (item.paperGrammage) bahanParts.push(item.paperGrammage + 'g');
    if (bahanParts.length > 0) descLines.push(bahanParts.join(' '));

    // Line 3+: Finishing: label on its own line, then each rincian on its own line
    if (item.finishingNames) {
      const finishings = item.finishingNames.split(',').map(f => f.trim()).filter(Boolean);
      descLines.push('Finishing:');
      finishings.forEach(f => descLines.push(f));
    }

    const deskripsi = descLines.join('\n');
    const jumlahPesanan = parseInt(item.jumlahPesanan) || 1;
    const hargaPerPcs = jumlahPesanan > 0 ? Math.round(item.grandTotal / jumlahPesanan) : 0;

    const items: typeof invoice.items = [{
      id: 'riwayat-0',
      deskripsi: deskripsi || ref,
      qty: jumlahPesanan,
      satuan: 'pcs',
      harga: hargaPerPcs,
    }];

    setInvoice({
      ...invoice,
      referensi: ref,
      client: {
        ...invoice.client,
        nama: item.customerName || invoice.client.nama,
      },
      items,
      catatan: '',
    });
    setDropdownOpen(false);
  };

  // Auto-select referensi when coming from hitung cetakan with riwayatId
  useEffect(() => {
    if (riwayatIdFromUrl && riwayatList.length > 0 && !autoSelectRef.current) {
      const found = riwayatList.find((r) => r.id === riwayatIdFromUrl);
      if (found) {
        autoSelectRef.current = true;
        // Reset invoice store first to clear stale data
        resetDocument('invoice');
        // Use setTimeout to ensure reset is applied before setting new data
        setTimeout(() => {
          handleReferensiSelect(found);
        }, 0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riwayatIdFromUrl, riwayatList]);

  const updateCompany = (company: typeof invoice.company) => {
    setInvoice({ ...invoice, company });
  };

  const updateClient = (field: string, value: string) => {
    setInvoice({
      ...invoice,
      client: { ...invoice.client, [field]: value },
    });
  };

  const subtotal = invoice.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (invoice.ppn / 100);
  const total = subtotal + ppnAmount;

  const handleLoad = (data: unknown) => {
    setInvoice(data as InvoiceData);
  };

  const handleSuratJalan = async () => {
    // Check if data has content
    const pihakKedua = invoice.client?.nama;
    const hasItem = invoice.items?.some((item) => item.deskripsi.trim() !== '');
    if (!pihakKedua?.trim() || !hasItem) {
      toast.error('Lengkapi data invoice terlebih dahulu!');
      return;
    }

    setSavingSj(true);
    try {
      // Save invoice to history first
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: 'invoice',
          nomor: invoice.nomor || '-',
          tanggal: invoice.tanggal || '',
          pihakKedua: invoice.client?.nama || '-',
          total: '-',
          dataJson: JSON.stringify(invoice),
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'));
        toast.success('Invoice disimpan ke riwayat');
        // Reset invoice form after saving
        resetDocument('invoice');
        router.push(`/surat-jalan?invoiceId=${saved.id}`);
      } else if (res.status === 409) {
        // Invoice already saved, get existing ID and navigate
        const errData = await res.json().catch(() => ({}));
        if (errData.id) {
          resetDocument('invoice');
          router.push(`/surat-jalan?invoiceId=${errData.id}`);
        } else {
          toast('Invoice sudah ada di riwayat.');
        }
      } else {
        toast.error('Gagal menyimpan invoice');
      }
    } catch {
      toast.error('Gagal menyimpan invoice');
    }
    setSavingSj(false);
  };

  return (
    <>
      <DocumentEditorLayout
        title="Invoice"
        previewContent={<InvoicePreview data={invoice} />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DocumentActionButtons
              docType="invoice"
              documentLabel="Invoice"
              currentData={invoice}
              onReset={() => resetDocument('invoice')}
            />
            <Button
              size="sm"
              onClick={handleSuratJalan}
              disabled={savingSj}
              className="bg-orange-600 hover:bg-orange-700 h-8 sm:h-9"
            >
              <Truck className="mr-1.5 h-3.5 w-3.5" />
              {savingSj ? 'Menyimpan...' : 'Surat Jalan'}
            </Button>
          </div>
        }
      >
        <CompanyFields company={invoice.company} onChange={updateCompany} />

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">No. Invoice</Label>
              <Input
                value={invoice.nomor}
                onChange={(e) => setInvoice({ ...invoice, nomor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={invoice.tanggal}
                onChange={(e) => setInvoice({ ...invoice, tanggal: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Referensi (opsional)</Label>
            <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pilih riwayat cetakan / ketik referensi..."
                    value={referensiInput}
                    onChange={(e) => handleReferensiInputChange(e.target.value)}
                    onFocus={() => setDropdownOpen(true)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] pr-9"
                  />
                  {/* Dropdown chevron icon */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                className="p-0 w-[var(--radix-popover-trigger-width)] max-h-52 overflow-y-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {filteredRiwayatList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Riwayat Hitung Cetakan</div>
                    {filteredRiwayatList.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleReferensiSelect(r) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${invoice.referensi === r.printName ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="truncate">{r.printName || '-'}</span>
                        {r.customerName && <span className="text-slate-400 ml-1.5 text-[11px]">({r.customerName})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {filteredRiwayatList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada riwayat cetakan</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Yth :
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Customer</Label>
            <Input
              value={invoice.client.nama}
              onChange={(e) => updateClient('nama', e.target.value)}
              placeholder="Nama perusahaan / individu"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nomor Telp</Label>
            <Input
              value={invoice.client.kontak}
              onChange={(e) => updateClient('kontak', e.target.value)}
              placeholder="No. telepon / email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={invoice.client.alamat}
              onChange={(e) => updateClient('alamat', e.target.value)}
              placeholder="Alamat lengkap"
            />
          </div>
        </div>

        <ItemsFields
          items={invoice.items}
          onChange={(items) => setInvoice({ ...invoice, items })}
          showPrice
        />

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">PPN (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={invoice.ppn}
              onChange={(e) => setInvoice({ ...invoice, ppn: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="mt-3 rounded-lg bg-emerald-50 p-3">
            <p className="text-sm text-emerald-800">
              Total: <span className="font-bold">{formatRupiah(total)}</span>
            </p>
          </div>

          <div className="mt-3 space-y-2">
            <Label className="text-xs">Catatan</Label>
            <Textarea
              value={invoice.catatan}
              onChange={(e) => setInvoice({ ...invoice, catatan: e.target.value })}
              placeholder="Catatan tambahan..."
              rows={3}
            />
          </div>
        </div>
      </DocumentEditorLayout>

      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <HistoryTable
          docType="invoice"
          documentLabel="Invoice"
          onLoad={handleLoad}
        />
      </div>
    </>
  );
}
