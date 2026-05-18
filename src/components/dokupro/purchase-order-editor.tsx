'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { useDokuproStore } from '@/lib/store';
import { CompanyFields } from './company-fields';
import { ItemsFields } from './items-fields';
import { PurchaseOrderPreview } from './purchase-order-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { HistoryTable } from './history-table';
import { DocumentActionButtons } from './document-action-buttons';
import { formatRupiah } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import type { PurchaseOrderData } from '@/lib/types';

interface RiwayatPotongKertasItem {
  id: string;
  namaCustomer: string;
  namaCetakan: string;
  paperName: string;
  paperId: string;
  grammage: string;
  paperWidth: string;
  paperHeight: string;
  cutWidth: string;
  cutHeight: string;
  quantity: string;
  setelanKertas: string;
  sheetsNeeded: string;
  totalPrice: number;
  pricePerSheet: number;
  efficiency: number;
  strategy: string;
  jumlahPesanan: string;
  berapaMata: string;
  resultData: string;
  createdAt: string;
}

export function PurchaseOrderEditor() {
  const po = useDokuproStore((s) => s.purchaseOrder);
  const setPurchaseOrder = useDokuproStore((s) => s.setPurchaseOrder);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);

  // Riwayat potong kertas dropdown state
  const [riwayatList, setRiwayatList] = useState<RiwayatPotongKertasItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(po.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fetchRiwayatPotongKertas = useCallback(async () => {
    try {
      const res = await fetch('/api/riwayat-potong-kertas', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRiwayatList(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadCompanyFromAPI() }, [loadCompanyFromAPI]);
  useEffect(() => { fetchRiwayatPotongKertas() }, [fetchRiwayatPotongKertas]);

  // Sync referensiInput when po.referensi changes externally
  useEffect(() => { setReferensiInput(po.referensi) }, [po.referensi]);

  // Filter riwayat list by input
  const filteredRiwayatList = riwayatList.filter((r) => {
    const search = referensiInput.toLowerCase().trim();
    if (!search) return true;
    const namaCetakan = (r.namaCetakan || '').toLowerCase();
    const customer = (r.namaCustomer || '').toLowerCase();
    const paper = (r.paperName || '').toLowerCase();
    return namaCetakan.includes(search) || customer.includes(search) || paper.includes(search);
  });

  const handleReferensiInputChange = (value: string) => {
    setReferensiInput(value);
    setPurchaseOrder({ ...po, referensi: value });
    setDropdownOpen(true);
  };

  const handleReferensiSelect = (item: RiwayatPotongKertasItem) => {
    const ref = item.namaCetakan || item.paperName || '';
    setReferensiInput(ref);

    // Build item description from potong kertas data
    const descLines: string[] = [];

    // Line 1: Nama Barang
    if (item.namaCetakan) descLines.push(item.namaCetakan);

    // Line 2: Nama Bahan (Paper 150g 65x100)
    const bahanParts: string[] = [];
    if (item.paperName) bahanParts.push(item.paperName);
    if (item.grammage && item.grammage !== '0') bahanParts.push(item.grammage + 'g');
    if (item.paperWidth && item.paperHeight && item.paperWidth !== '0' && item.paperHeight !== '0') {
      bahanParts.push(`${item.paperWidth}x${item.paperHeight}`);
    }
    if (bahanParts.length > 0) descLines.push(bahanParts.join(' '));

    // Line 3: Ukuran potong
    if (item.cutWidth && item.cutHeight && item.cutWidth !== '0' && item.cutHeight !== '0') {
      descLines.push(`Uk. potong ${item.cutWidth} x ${item.cutHeight}`);
    }

    // Line 4: Potongan jadi (potongan/lembar)
    if (item.setelanKertas && item.setelanKertas !== '0') {
      descLines.push(`Potongan jadi (${item.setelanKertas}/lembar)`);
    }

    const deskripsi = descLines.join('\n');
    // Qty = kertas yang dibeli (sheetsNeeded)
    const qty = parseInt(item.sheetsNeeded) || parseInt(item.quantity) || 1;
    // Harga = harga per lembar
    const hargaPerLembar = item.pricePerSheet || (qty > 0 ? Math.round(item.totalPrice / qty) : 0);

    const items: typeof po.items = [{
      id: 'riwayat-pk-0',
      deskripsi: deskripsi || ref,
      qty,
      satuan: 'lembar',
      harga: hargaPerLembar,
    }];

    setPurchaseOrder({
      ...po,
      referensi: ref,
      pemasok: {
        ...po.pemasok,
        nama: item.paperName || po.pemasok.nama,
      },
      items,
      catatan: '',
    });
    setDropdownOpen(false);
  };

  const updateCompany = (company: typeof po.company) => {
    setPurchaseOrder({ ...po, company });
  };

  const updatePemasok = (field: string, value: string) => {
    setPurchaseOrder({
      ...po,
      pemasok: { ...po.pemasok, [field]: value },
    });
  };

  const subtotal = po.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (po.ppn / 100);
  const total = subtotal + ppnAmount;

  const handleLoad = (data: unknown) => {
    setPurchaseOrder(data as PurchaseOrderData);
  };

  return (
    <>
      <DocumentEditorLayout
        title="Purchase Order"
        previewContent={<PurchaseOrderPreview data={po} />}
        actions={
          <DocumentActionButtons
            docType="purchase-order"
            documentLabel="Purchase Order"
            currentData={po}
            onReset={() => resetDocument('purchase-order')}
          />
        }
      >
        <CompanyFields company={po.company} onChange={updateCompany} />

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">No. Purchase Order</Label>
              <Input
                value={po.nomor}
                onChange={(e) => setPurchaseOrder({ ...po, nomor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={po.tanggal}
                onChange={(e) => setPurchaseOrder({ ...po, tanggal: e.target.value })}
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
                    placeholder="Pilih riwayat potong kertas / ketik referensi..."
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
                className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {filteredRiwayatList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Riwayat Potong Kertas</div>
                    {filteredRiwayatList.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleReferensiSelect(r) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${po.referensi === (r.namaCetakan || r.paperName) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="truncate">{r.namaCetakan || r.paperName || '-'}</span>
                        {r.namaCustomer && <span className="text-slate-400 ml-1.5 text-[11px]">({r.namaCustomer})</span>}
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {r.paperName}{r.grammage && r.grammage !== '0' ? ` ${r.grammage}g` : ''} 
                          {r.cutWidth && r.cutHeight && r.cutWidth !== '0' ? ` • ${r.cutWidth}×${r.cutHeight}` : ''}
                          {r.jumlahPesanan ? ` • ${r.jumlahPesanan} pcs` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {filteredRiwayatList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada riwayat potong kertas</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Pemasok
          </h3>
          <div className="space-y-2">
            <Label className="text-xs">Nama</Label>
            <Input
              value={po.pemasok.nama}
              onChange={(e) => updatePemasok('nama', e.target.value)}
              placeholder="Nama pemasok / perusahaan"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Kontak</Label>
            <Input
              value={po.pemasok.kontak}
              onChange={(e) => updatePemasok('kontak', e.target.value)}
              placeholder="No. telepon / email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={po.pemasok.alamat}
              onChange={(e) => updatePemasok('alamat', e.target.value)}
              placeholder="Alamat pemasok"
            />
          </div>
        </div>

        <ItemsFields
          items={po.items}
          onChange={(items) => setPurchaseOrder({ ...po, items })}
          showPrice
        />

        <div className="space-y-2">
          <Label className="text-xs">PPN (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={po.ppn}
            onChange={(e) => setPurchaseOrder({ ...po, ppn: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            Total: <span className="font-bold">{formatRupiah(total)}</span>
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Catatan
          </h3>
          <Textarea
            value={po.catatan}
            onChange={(e) => setPurchaseOrder({ ...po, catatan: e.target.value })}
            placeholder="Catatan tambahan..."
            rows={3}
          />
        </div>
      </DocumentEditorLayout>

      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <HistoryTable
          docType="purchase-order"
          documentLabel="Purchase Order"
          onLoad={handleLoad}
        />
      </div>
    </>
  );
}
