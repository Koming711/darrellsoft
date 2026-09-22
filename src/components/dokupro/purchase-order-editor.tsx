'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { useDokuproStore } from '@/lib/store';
import { ItemsFields } from './items-fields';
import { PurchaseOrderPreview } from './purchase-order-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { DocumentActionButtons } from './document-action-buttons';
import { PhotoUpload } from '@/components/photo-upload';
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
  nomorUrut: string;
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
  const autoSelectDoneRef = useRef<string | null>(null); // track which riwayatId was auto-selected

  // Riwayat potong kertas dropdown state
  const [riwayatList, setRiwayatList] = useState<RiwayatPotongKertasItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(po.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Suplier dropdown state
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
        return data;
      }
    } catch {
      // silently fail
    }
    return [];
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

  // Fetch next PO number from server
  const fetchNextNumber = useCallback(() => {
    fetch('/api/history?preview=next-number&docType=purchase-order', { headers: getAuthHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.nextNumber) setPurchaseOrder((prev) => ({ ...prev, nomor: data.nextNumber })) })
      .catch(() => {});
  }, [setPurchaseOrder]);

  useEffect(() => { fetchNextNumber() }, [fetchNextNumber]);

  // Re-fetch next number after a document is saved
  useEffect(() => {
    const handler = () => { fetchNextNumber() };
    window.addEventListener('dokupro:history-updated', handler);
    return () => { window.removeEventListener('dokupro:history-updated', handler) };
  }, [fetchNextNumber]);

  // Sync referensiInput when po.referensi changes externally
  useEffect(() => { setReferensiInput(po.referensi) }, [po.referensi]);
  // Sync pemasokInput when po.pemasok.nama changes externally
  useEffect(() => { setPemasokInput(po.pemasok.nama) }, [po.pemasok.nama]);

  // Apply referensi data using functional setPurchaseOrder to avoid stale `po` closure
  const applyReferensi = (item: RiwayatPotongKertasItem) => {
    const ref = item.nomorUrut || item.namaCetakan || item.paperName || '';
    setReferensiInput(ref);

    // Build item description from potong kertas data
    const descLines: string[] = [];
    if (item.namaCetakan) descLines.push(item.namaCetakan);

    const bahanParts: string[] = [];
    if (item.paperName) bahanParts.push(item.paperName);
    if (item.grammage && item.grammage !== '0') bahanParts.push(item.grammage + 'g');
    if (item.paperWidth && item.paperHeight && item.paperWidth !== '0' && item.paperHeight !== '0') {
      bahanParts.push(`${item.paperWidth}x${item.paperHeight}`);
    }
    if (bahanParts.length > 0) descLines.push(bahanParts.join(' '));

    if (item.cutWidth && item.cutHeight && item.cutWidth !== '0' && item.cutHeight !== '0') {
      descLines.push(`Uk. potong ${item.cutWidth} x ${item.cutHeight}`);
    }

    let potonganPerLembar = 0;
    try {
      const rd = JSON.parse(item.resultData || '{}');
      potonganPerLembar = rd.totalPieces || 0;
    } catch {}
    if (potonganPerLembar > 0) {
      descLines.push(`Potongan/lembar dapat ${potonganPerLembar}`);
    }

    const qty = parseInt(item.sheetsNeeded) || parseInt(item.quantity) || 0;
    if (potonganPerLembar > 0 && qty > 0) {
      const jumlahJadi = potonganPerLembar * qty;
      descLines.push(`Jumlah jadi ${jumlahJadi} lembar`);
    }

    const deskripsi = descLines.join('\n');
    const hargaPerLembar = item.pricePerSheet || (qty > 0 ? Math.round(item.totalPrice / qty) : 0);

    const newItems: PurchaseOrderData['items'] = [{
      id: 'riwayat-pk-0',
      deskripsi: deskripsi || ref,
      qty,
      satuan: 'lembar',
      harga: hargaPerLembar,
    }];

    // Use functional form to always get the LATEST state — avoids race with loadCompanyFromAPI
    setPurchaseOrder((prev) => ({
      ...prev,
      referensi: ref,
      items: newItems,
      catatan: '',
      riwayatPotongKertasId: item.id,
    }));
    setDropdownOpen(false);
  };

  // Auto-select referensi when coming from potong kertas with riwayatId
  // Fetches the specific riwayat directly by ID for reliability (no race condition with list loading)
  useEffect(() => {
    if (!riwayatIdFromUrl) return;
    // Skip if we already auto-selected this exact riwayatId
    if (autoSelectDoneRef.current === riwayatIdFromUrl) return;

    let cancelled = false;

    const fetchAndApply = async () => {
      // First, try to find it in the already-loaded list (fast path)
      const foundInList = riwayatList.find((r) => r.id === riwayatIdFromUrl);
      if (foundInList) {
        if (!cancelled) {
          autoSelectDoneRef.current = riwayatIdFromUrl;
          applyReferensi(foundInList);
        }
        return;
      }

      // Not in list yet — fetch directly by ID from the API (reliable path)
      try {
        const res = await fetch(`/api/riwayat-potong-kertas?id=${riwayatIdFromUrl}`, { headers: getAuthHeaders() });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data && !data.error) {
            autoSelectDoneRef.current = riwayatIdFromUrl;
            applyReferensi(data as RiwayatPotongKertasItem);
          }
        }
      } catch {
        // Fallback: retry once after a short delay
        if (cancelled) return;
        await new Promise(r => setTimeout(r, 800));
        if (cancelled) return;
        try {
          const res = await fetch(`/api/riwayat-potong-kertas?id=${riwayatIdFromUrl}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            if (data && !data.error) {
              autoSelectDoneRef.current = riwayatIdFromUrl;
              applyReferensi(data as RiwayatPotongKertasItem);
            }
          }
        } catch {
          // Give up silently
        }
      }
    };

    fetchAndApply();

    return () => { cancelled = true; };
  }, [riwayatIdFromUrl]);

  // Filter riwayat list by input
  const filteredRiwayatList = riwayatList.filter((r) => {
    const search = referensiInput.toLowerCase().trim();
    if (!search) return true;
    const noPk = (r.nomorUrut || '').toLowerCase();
    const namaCetakan = (r.namaCetakan || '').toLowerCase();
    const customer = (r.namaCustomer || '').toLowerCase();
    const paper = (r.paperName || '').toLowerCase();
    return noPk.includes(search) || namaCetakan.includes(search) || customer.includes(search) || paper.includes(search);
  });

  const handleReferensiInputChange = (value: string) => {
    setReferensiInput(value);
    setPurchaseOrder((prev) => ({ ...prev, referensi: value }));
    setDropdownOpen(true);
  };

  // Manual referensi select from dropdown — also uses functional form
  const handleReferensiSelect = (item: RiwayatPotongKertasItem) => {
    applyReferensi(item);
  };

  const updatePemasok = (field: string, value: string) => {
    setPurchaseOrder((prev) => ({
      ...prev,
      pemasok: { ...prev.pemasok, [field]: value },
    }));
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
    setPurchaseOrder((prev) => ({
      ...prev,
      pemasok: {
        nama: item.namaToko,
        jenisBarang: item.jenisBarang,
        kontak: item.kontak,
        alamat: item.alamat,
      },
    }));
    setPemasokDropdownOpen(false);
  };

  const subtotal = po.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (po.ppn / 100);
  const total = subtotal + ppnAmount;

  return (
    <>
      <DocumentEditorLayout
        title="Purchase Order"
        previewMode="inline-bottom"
        previewMaxWidth={560}
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
        {/* Catatan: kotak "Data Perusahaan" dihapus dari form editor — data perusahaan
            untuk kop dokumen A5 kini diatur melalui halaman Pengaturan.
            State po.company tetap ada karena masih dipakai PurchaseOrderPreview. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-5 items-start">
          {/* === KOLOM KIRI: Detail Dokumen + Informasi Pemasok === */}
          <div className="space-y-3 lg:space-y-5 min-w-0">
        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">No. Purchase Order</Label>
              <Input
                value={po.nomor}
                readOnly
                className="bg-slate-50 text-slate-500 cursor-not-allowed text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={po.tanggal}
                onChange={(e) => setPurchaseOrder((prev) => ({ ...prev, tanggal: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            <Label className="text-xs">Tgl. Jatuh Tempo</Label>
            <Input
              type="date"
              value={po.tanggalJatuhTempo}
              onChange={(e) => setPurchaseOrder((prev) => ({ ...prev, tanggalJatuhTempo: e.target.value }))}
              className="text-sm"
            />
          </div>
          {po.tanggalJatuhTempo && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs text-amber-700">
                Jatuh tempo: <span className="font-semibold">{new Date(po.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs">Referensi (No. PK)</Label>
            <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pilih No. PK / ketik referensi..."
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
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${po.referensi === r.nomorUrut ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="font-semibold text-xs text-emerald-700">{r.nomorUrut || '-'}</span>
                        <span className="ml-1.5 truncate">{r.namaCetakan || r.paperName || ''}</span>
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

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Yth.
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Suplier</Label>
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
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Master Suplier</div>
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
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Kontak</Label>
            <Input
              value={po.pemasok.kontak}
              onChange={(e) => updatePemasok('kontak', e.target.value)}
              placeholder="No. telepon / email"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={po.pemasok.alamat}
              onChange={(e) => updatePemasok('alamat', e.target.value)}
              placeholder="Alamat pemasok"
              className="text-sm"
            />
          </div>
        </div>
          </div>

          {/* === KOLOM KANAN: Item + Informasi Tambahan === */}
          <div className="space-y-3 lg:space-y-5 min-w-0">
        <ItemsFields
          items={po.items}
          onChange={(items) => setPurchaseOrder((prev) => ({ ...prev, items }))}
          showPrice
        />

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-1.5 mt-3">
            <Label className="text-xs">PPN (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={po.ppn}
              onChange={(e) => setPurchaseOrder((prev) => ({ ...prev, ppn: Number(e.target.value) || 0 }))}
              className="text-sm"
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
              onChange={(e) => setPurchaseOrder((prev) => ({ ...prev, catatan: e.target.value }))}
              placeholder="Catatan tambahan..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        {/* Foto Lampiran — sama seperti halaman editor Hitung Cetakan:
            Pilih File / Kamera, kompresi otomatis JPG <=300KB, ikut tersimpan di riwayat
            & tampil di preview/JPG/Cetak/PDF (lihat PurchaseOrderPreview + generatePurchaseOrderPdf). */}
        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <PhotoUpload
            value={po.photoUrl || ''}
            onChange={(photoUrl) => setPurchaseOrder((prev) => ({ ...prev, photoUrl }))}
            label="Foto Lampiran"
          />
        </div>
          </div>
        </div>
      </DocumentEditorLayout>

    </>
  );
}
