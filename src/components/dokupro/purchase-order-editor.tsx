'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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

interface TokoPemasokItem {
  id: string;
  namaToko: string;
  jenisBarang: string;
  kontak: string;
  alamat: string;
}

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

  const searchParams = useSearchParams();
  const riwayatIdFromUrl = searchParams.get('riwayatId');
  const autoSelectRef = useRef(false);

  // Riwayat potong kertas dropdown state
  const [riwayatList, setRiwayatList] = useState<RiwayatPotongKertasItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(po.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Toko/Pemasok dropdown state
  const [tokoList, setTokoList] = useState<TokoPemasokItem[]>([]);
  const [pemasokInput, setPemasokInput] = useState(po.pemasok.nama);
  const [pemasokDropdownOpen, setPemasokDropdownOpen] = useState(false);
  const [pemasokTyping, setPemasokTyping] = useState(false);

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

  // Fetch toko/pemasok list
  const fetchTokoPemasok = useCallback(async () => {
    try {
      const res = await fetch('/api/toko-pemasok', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTokoList(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { fetchTokoPemasok() }, [fetchTokoPemasok]);

  // Sync referensiInput when po.referensi changes externally
  useEffect(() => { setReferensiInput(po.referensi) }, [po.referensi]);
  // Sync pemasokInput when po.pemasok.nama changes externally
  useEffect(() => { setPemasokInput(po.pemasok.nama) }, [po.pemasok.nama]);

  // Auto-select referensi when coming from potong kertas with riwayatId
  useEffect(() => {
    if (riwayatIdFromUrl && riwayatList.length > 0 && !autoSelectRef.current) {
      const found = riwayatList.find((r) => r.id === riwayatIdFromUrl);
      if (found) {
        autoSelectRef.current = true;
        handleReferensiSelect(found);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riwayatIdFromUrl, riwayatList]);

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

    // Line 4: Potongan/lembar (dari resultData.totalPieces)
    let potonganPerLembar = 0;
    try {
      const rd = JSON.parse(item.resultData || '{}');
      potonganPerLembar = rd.totalPieces || 0;
    } catch {}
    if (potonganPerLembar > 0) {
      descLines.push(`Potongan/lembar dapat ${potonganPerLembar}`);
    }

    // Line 5: Jumlah jadi (potongan/lembar × qty)
    const qty = parseInt(item.sheetsNeeded) || parseInt(item.quantity) || 0;
    if (potonganPerLembar > 0 && qty > 0) {
      const jumlahJadi = potonganPerLembar * qty;
      descLines.push(`Jumlah jadi ${jumlahJadi} lembar`);
    }

    const deskripsi = descLines.join('\n');
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
        nama: item.namaCustomer || po.pemasok.nama,
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

  // Filter toko/pemasok list by input (only when user is actively typing)
  const filteredTokoList = pemasokTyping
    ? tokoList.filter((t) => {
        const search = pemasokInput.toLowerCase().trim();
        if (!search) return true;
        return t.namaToko.toLowerCase().includes(search) ||
               t.jenisBarang.toLowerCase().includes(search) ||
               t.kontak.toLowerCase().includes(search) ||
               t.alamat.toLowerCase().includes(search);
      })
    : tokoList;

  const handlePemasokInputChange = (value: string) => {
    setPemasokInput(value);
    setPemasokTyping(true);
    updatePemasok('nama', value);
    setPemasokDropdownOpen(true);
  };

  const handlePemasokSelect = (item: TokoPemasokItem) => {
    setPemasokInput(item.namaToko);
    setPemasokTyping(false);
    setPurchaseOrder({
      ...po,
      pemasok: {
        nama: item.namaToko,
        jenisBarang: item.jenisBarang,
        kontak: item.kontak,
        alamat: item.alamat,
      },
    });
    setPemasokDropdownOpen(false);
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

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
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

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Yth.
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Nama</Label>
            <Popover open={pemasokDropdownOpen} onOpenChange={setPemasokDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik atau pilih toko/pemasok..."
                    value={pemasokInput}
                    onChange={(e) => handlePemasokInputChange(e.target.value)}
                    onFocus={() => { setPemasokDropdownOpen(true); setPemasokTyping(false); }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] pr-9"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onMouseDown={(e) => { e.preventDefault(); setPemasokTyping(false); setPemasokDropdownOpen(!pemasokDropdownOpen); }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {filteredTokoList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Toko / Pemasok</div>
                    {filteredTokoList.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handlePemasokSelect(t) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${po.pemasok.nama === t.namaToko ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="truncate">{t.namaToko}</span>
                        {t.jenisBarang && <span className="text-slate-400 ml-1.5 text-[11px]">({t.jenisBarang})</span>}
                        {(t.kontak || t.alamat) && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {t.kontak && <span>{t.kontak}</span>}
                            {t.kontak && t.alamat && <span> · </span>}
                            {t.alamat && <span className="truncate">{t.alamat}</span>}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {filteredTokoList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada data toko/pemasok</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Jenis Barang</Label>
            <Input
              value={po.pemasok.jenisBarang}
              onChange={(e) => updatePemasok('jenisBarang', e.target.value)}
              placeholder="Jenis barang"
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
              value={po.ppn}
              onChange={(e) => setPurchaseOrder({ ...po, ppn: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="mt-3 rounded-lg bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Total: <span className="font-bold">{formatRupiah(total)}</span>
            </p>
          </div>

          <div className="mt-3 space-y-2">
            <Label className="text-xs">Catatan</Label>
            <Textarea
              value={po.catatan}
              onChange={(e) => setPurchaseOrder({ ...po, catatan: e.target.value })}
              placeholder="Catatan tambahan..."
              rows={3}
            />
          </div>
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
