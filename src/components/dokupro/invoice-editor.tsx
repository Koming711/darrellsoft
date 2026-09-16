'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { useDokuproStore } from '@/lib/store';
import { ItemsFields, type BarangOption } from './items-fields';
import { InvoicePreview } from './invoice-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { DocumentActionButtons } from './document-action-buttons';
import { formatRupiah } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/types';

interface CustomerItem {
  id: string;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface RiwayatCetakanItem {
  id: string;
  nomorUrut: string;
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


export function InvoiceEditor({ dpDisabled = false, onSaved }: { dpDisabled?: boolean; onSaved?: (id: string) => void }) {
  const invoice = useDokuproStore((s) => s.invoice);
  const setInvoice = useDokuproStore((s) => s.setInvoice);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);
  const invoiceEditingId = useDokuproStore((s) => s.invoiceEditingId);
  const setInvoiceEditingId = useDokuproStore((s) => s.setInvoiceEditingId);
  const searchParams = useSearchParams();
  const riwayatIdFromUrl = searchParams.get('riwayatId');
  const autoSelectDoneRef = useRef<string | null>(null); // track which riwayatId was auto-selected

  // Daftar barang milik customer terpilih (Master Barang per pelanggan)
  const [barangList, setBarangList] = useState<BarangOption[]>([]);
  // Nama customer sebelumnya — untuk mendeteksi perubahan customer
  const prevClientNameRef = useRef<string>(invoice.client.nama);
  // Nama yang diisi otomatis oleh pemilihan referensi (hitung cetakan) —
  // perubahan nama dari alur ini TIDAK boleh mengosongkan item yang baru diisi.
  const autoFillNameRef = useRef<string>('');

  // Riwayat cetakan dropdown state
  const [riwayatList, setRiwayatList] = useState<RiwayatCetakanItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(invoice.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Customer dropdown state
  const [customerList, setCustomerList] = useState<CustomerItem[]>([]);
  const [clientInput, setClientInput] = useState(invoice.client.nama);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientTyping, setClientTyping] = useState(false);

  const fetchRiwayatCetakan = useCallback(async () => {
    try {
      const res = await fetch('/api/riwayat-cetakan', { headers: getAuthHeaders() });
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

  // Fetch customer list
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCustomerList(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadCompanyFromAPI() }, [loadCompanyFromAPI]);
  useEffect(() => { fetchRiwayatCetakan() }, [fetchRiwayatCetakan]);
  useEffect(() => { fetchCustomers() }, [fetchCustomers]);

  // Muat daftar barang milik customer terpilih (Master Barang per pelanggan).
  // Jika customer tidak dikenal / belum memilih, daftar barang = kosong.
  useEffect(() => {
    const nama = invoice.client.nama.trim().toLowerCase();
    const found = nama
      ? customerList.find((c) => c.name.trim().toLowerCase() === nama)
      : undefined;
    if (!found) {
      setBarangList([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/items?customerId=${encodeURIComponent(found.id)}&active=1`, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.items) ? data.items : [];
        setBarangList(rows.map((r: { id: string; name: string; unit: string; standardPrice: number; hpp: number | null; qty?: number }) => ({
          id: r.id,
          name: r.name,
          unit: r.unit || 'pcs',
          standardPrice: r.standardPrice || 0,
          hpp: r.hpp ?? null,
          qty: r.qty ?? 0,
        })));
      })
      .catch(() => { if (!cancelled) setBarangList([]); });
    return () => { cancelled = true; };
  }, [invoice.client.nama, customerList]);

  // Ganti customer → otomatis KOSONGKAN nama barang di kotak item
  // (barang milik tiap pelanggan tidak boleh tercampur).
  // Pengecualian: nama yang diisi otomatis oleh pemilihan referensi cetakan.
  useEffect(() => {
    const nama = invoice.client.nama.trim();
    const prev = prevClientNameRef.current.trim();
    if (nama !== prev) {
      prevClientNameRef.current = invoice.client.nama;
      if (autoFillNameRef.current && nama === autoFillNameRef.current.trim()) {
        // Diisi otomatis oleh applyReferensi — jangan kosongkan
        autoFillNameRef.current = '';
        return;
      }
      autoFillNameRef.current = '';
      setInvoice((prevInv) => ({
        ...prevInv,
        items: prevInv.items.map((it, i) => (
          i === 0
            ? { ...it, deskripsi: '', qty: 1, harga: 0, modal: 0 }
            : null
        )).filter((it): it is typeof prevInv.items[number] => it !== null),
      }));
    }
  }, [invoice.client.nama, setInvoice]);

  // Fetch next Invoice number from server (only when creating new, not editing)
  const fetchNextNumber = useCallback(() => {
    // Read current editingId from store to avoid stale closure
    const currentEditingId = useDokuproStore.getState().invoiceEditingId;
    if (currentEditingId) return; // Don't overwrite nomor when editing
    fetch('/api/history?preview=next-number&docType=invoice', { headers: getAuthHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.nextNumber) setInvoice((prev) => ({ ...prev, nomor: data.nextNumber })) })
      .catch(() => {});
  }, [setInvoice]);

  useEffect(() => { fetchNextNumber() }, [fetchNextNumber]);

  // Re-fetch next number after a document is saved
  useEffect(() => {
    const handler = () => { fetchNextNumber() };
    window.addEventListener('dokupro:history-updated', handler);
    return () => { window.removeEventListener('dokupro:history-updated', handler) };
  }, [fetchNextNumber]);

  // Mode Regular (dpDisabled): paksa DP = 0 dan sembunyikan input DP
  useEffect(() => {
    if (dpDisabled) {
      setInvoice((prev) => (prev.dp === 0 ? prev : ({ ...prev, dp: 0 })));
    }
  }, [dpDisabled, setInvoice]);

  // Sync referensiInput when invoice.referensi changes externally
  useEffect(() => { setReferensiInput(invoice.referensi) }, [invoice.referensi]);
  // Sync clientInput when invoice.client.nama changes externally
  useEffect(() => { setClientInput(invoice.client.nama) }, [invoice.client.nama]);

  // Filter riwayat list — when dropdown is open show all, otherwise not used
  const filteredRiwayatList = riwayatList;

  const handleReferensiInputChange = (value: string) => {
    setReferensiInput(value);
    setInvoice((prev) => ({ ...prev, referensi: value }));
    setDropdownOpen(true);
  };

  // Apply referensi data using functional setInvoice to avoid stale closure
  const applyReferensi = (item: RiwayatCetakanItem) => {
    const ref = item.nomorUrut || item.printName || '';
    setReferensiInput(ref);

    // Build single item with multi-line description
    const descLines: string[] = [];
    if (item.printName) descLines.push(item.printName);

    const bahanParts: string[] = [];
    if (item.paperName) bahanParts.push(item.paperName);
    if (item.paperGrammage) bahanParts.push(item.paperGrammage + 'g');
    if (bahanParts.length > 0) descLines.push(bahanParts.join(' '));

    if (item.finishingNames) {
      const finishings = item.finishingNames.split(',').map(f => f.trim()).filter(Boolean);
      descLines.push('Finishing:');
      finishings.forEach(f => descLines.push(f));
    }

    const deskripsi = descLines.join('\n');
    const jumlahPesanan = parseInt(item.jumlahPesanan) || 1;
    const hargaPerPcs = jumlahPesanan > 0 ? Math.round(item.grandTotal / jumlahPesanan) : 0;

    const newItems: InvoiceData['items'] = [{
      id: 'riwayat-0',
      deskripsi: deskripsi || ref,
      qty: jumlahPesanan,
      satuan: 'pcs',
      harga: hargaPerPcs,
    }];

    // Tandai bahwa perubahan nama customer berikutnya berasal dari alur
    // referensi cetakan — jangan kosongkan item yang baru saja diisi.
    if (item.customerName) autoFillNameRef.current = item.customerName;

    // Use functional form to always get the LATEST state
    setInvoice((prev) => ({
      ...prev,
      referensi: ref,
      client: {
        ...prev.client,
        nama: item.customerName || prev.client.nama,
      },
      items: newItems,
      catatan: '',
      uangCapek: item.profitAmount || 0,
    }));
    setDropdownOpen(false);
  };

  const handleReferensiSelect = (item: RiwayatCetakanItem) => {
    applyReferensi(item);
  };

  // Auto-select referensi when coming from hitung cetakan with riwayatId
  // Fetches the specific riwayat directly by ID for reliability (no race condition with list loading)
  useEffect(() => {
    if (!riwayatIdFromUrl) return;
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
        const res = await fetch(`/api/riwayat-cetakan?id=${riwayatIdFromUrl}`, { headers: getAuthHeaders() });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data && !data.error) {
            autoSelectDoneRef.current = riwayatIdFromUrl;
            applyReferensi(data as RiwayatCetakanItem);
          }
        }
      } catch {
        // Fallback: retry once after a short delay
        if (cancelled) return;
        await new Promise(r => setTimeout(r, 800));
        if (cancelled) return;
        try {
          const res = await fetch(`/api/riwayat-cetakan?id=${riwayatIdFromUrl}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            if (data && !data.error) {
              autoSelectDoneRef.current = riwayatIdFromUrl;
              applyReferensi(data as RiwayatCetakanItem);
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

  // Filter customer list (only when user is actively typing)
  const filteredCustomerList = useMemo(() =>
    clientTyping
      ? customerList.filter((c) => {
          const search = clientInput.toLowerCase().trim();
          if (!search) return true;
          return c.name.toLowerCase().includes(search) ||
                 (c.companyName || '').toLowerCase().includes(search) ||
                 (c.phone || '').toLowerCase().includes(search) ||
                 (c.address || '').toLowerCase().includes(search);
        })
      : customerList
  , [clientTyping, customerList, clientInput]);

  const handleClientInputChange = (value: string) => {
    setClientInput(value);
    setClientTyping(true);
    updateClient('nama', value);
    setClientDropdownOpen(true);
  };

  const handleClientSelect = (item: CustomerItem) => {
    setClientInput(item.name);
    setClientTyping(false);
    setInvoice((prev) => ({
      ...prev,
      client: {
        nama: item.name,
        kontak: item.phone || item.email || '',
        alamat: item.address || '',
      },
    }));
    setClientDropdownOpen(false);
  };

  // Pilih barang dari dropdown Master Barang customer → isi deskripsi + Qty
  // (dari master, mis. 10.000) + satuan + harga satuan + harga modal otomatis.
  // Harga TIDAK bisa diedit manual di sini (lockPrices) — hanya di Master Barang.
  const handlePickBarang = (itemIndex: number, barang: BarangOption) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (
        i === itemIndex
          ? {
              ...it,
              deskripsi: barang.name,
              satuan: barang.unit || it.satuan || 'pcs',
              qty: barang.qty > 0 ? barang.qty : it.qty,
              harga: barang.standardPrice || 0,
              modal: barang.hpp ?? 0,
            }
          : it
      )),
    }));
  };

  const updateClient = (field: string, value: string) => {
    setInvoice((prev) => ({
      ...prev,
      client: { ...prev.client, [field]: value },
    }));
  };

  const subtotal = invoice.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (invoice.ppn / 100);
  const total = subtotal + ppnAmount;
  const dpPercent = invoice.dp || 0;
  const dpAmount = total * (dpPercent / 100);
  const sisa = total - dpAmount;

  // Pratinjau langsung muncul begitu ada data inti (referensi dipilih /
  // customer terisi / ada barang) — tanpa tombol "Lihat Pratinjau A5".
  const hasPreviewData = Boolean(
    referensiInput.trim() ||
    invoice.client.nama.trim() ||
    invoice.items.some((it) => it.deskripsi.trim() !== '')
  );

  return (
    <>
      <DocumentEditorLayout
        title="Invoice"
        previewMode="inline-bottom"
        previewMaxWidth={560}
        previewContent={
          hasPreviewData ? (
            <InvoicePreview data={invoice} />
          ) : (
            <div className="flex min-h-[320px] w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <p className="max-w-[280px] text-sm text-slate-400">
                Pratinjau invoice akan muncul di sini setelah Anda memilih referensi (No. HC) atau customer.
              </p>
            </div>
          )
        }
        actions={
          <DocumentActionButtons
            docType="invoice"
            documentLabel="Invoice"
            currentData={invoice}
            onReset={() => resetDocument('invoice')}
            editingId={invoiceEditingId}
            onUpdateSuccess={() => setInvoiceEditingId(null)}
            showPrintActions={false}
            onSaved={onSaved}
          />
        }
      >
        {/* FORM 2 KOLOM (desktop) — KIRI: Detail Dokumen + Informasi Pembayaran +
            Kepada Yth, KANAN: Item + Informasi Tambahan. Kotak Data Perusahaan
            dihapus (data perusahaan diatur di halaman Pengaturan). */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-5 items-start">
        {/* ===== KOLOM KIRI ===== */}
        <div className="space-y-3 lg:space-y-5 min-w-0">
        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">No. Invoice</Label>
              <Input
                value={invoice.nomor}
                readOnly
                className="bg-slate-50 text-slate-500 cursor-not-allowed text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={invoice.tanggal}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggal: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Referensi (No. HC)</Label>
            <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <PopoverAnchor asChild>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(true)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-slate-50 px-3 py-2 text-sm shadow-xs outline-none cursor-pointer hover:bg-slate-100 transition-colors text-left"
                >
                  <span className={referensiInput ? 'text-slate-900' : 'text-slate-400'}>
                    {referensiInput || 'Pilih No. HC...'}
                  </span>
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
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
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${invoice.referensi === r.nomorUrut ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="font-semibold text-xs text-emerald-700">{r.nomorUrut || '-'}</span>
                        <span className="ml-1.5 truncate">{r.printName || ''}</span>
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

        {/* Informasi Pembayaran - moved below Detail Dokumen */}
        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Pembayaran
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tgl. Jatuh Tempo</Label>
              <Input
                type="date"
                value={invoice.tanggalJatuhTempo}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggalJatuhTempo: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cara Pembayaran</Label>
              <div className="flex gap-1.5">
                {(['cash', 'transfer', 'giro'] as const).map((method) => {
                  const labels: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', giro: 'Giro' };
                  const isSelected = invoice.caraPembayaran === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setInvoice((prev) => ({
                        ...prev,
                        caraPembayaran: prev.caraPembayaran === method ? '' : method,
                        tanggalGiro: method === 'giro' && prev.caraPembayaran !== method ? prev.tanggalGiro : (method !== 'giro' ? '' : prev.tanggalGiro),
                      }))}
                      className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                        isSelected
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-offset-1 ring-emerald-400 shadow-sm'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {labels[method]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {invoice.caraPembayaran === 'giro' && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Tgl. Giro</Label>
              <Input
                type="date"
                value={invoice.tanggalGiro}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggalGiro: e.target.value }))}
                className="text-sm"
              />
            </div>
          )}
          {invoice.tanggalJatuhTempo && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs text-amber-700">
                Jatuh tempo: <span className="font-semibold">{new Date(invoice.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Yth :
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Customer</Label>
            <Popover open={clientDropdownOpen} onOpenChange={setClientDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik atau pilih customer..."
                    value={clientInput}
                    onChange={(e) => handleClientInputChange(e.target.value)}
                    onFocus={() => { setClientDropdownOpen(true); setClientTyping(false); }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] pr-9"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onMouseDown={(e) => { e.preventDefault(); setClientTyping(false); setClientDropdownOpen(!clientDropdownOpen); }}
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
                {filteredCustomerList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Master Customer</div>
                    {filteredCustomerList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleClientSelect(c) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${invoice.client.nama === c.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="truncate">{c.name}</span>
                        {c.companyName && <span className="text-slate-400 ml-1.5 text-[11px]">({c.companyName})</span>}
                        {(c.phone || c.address) && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.phone && <span>{c.phone}</span>}
                            {c.phone && c.address && <span> · </span>}
                            {c.address && <span className="truncate">{c.address}</span>}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {filteredCustomerList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada data customer</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nomor Telp</Label>
            <Input
              value={invoice.client.kontak}
              onChange={(e) => updateClient('kontak', e.target.value)}
              placeholder="No. telepon / email"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={invoice.client.alamat}
              onChange={(e) => updateClient('alamat', e.target.value)}
              placeholder="Alamat lengkap"
              className="text-sm"
            />
          </div>
        </div>
        </div>

        {/* ===== KOLOM KANAN ===== */}
        <div className="space-y-3 lg:space-y-5 min-w-0">
        <ItemsFields
          items={invoice.items}
          onChange={(items) => setInvoice((prev) => ({ ...prev, items }))}
          showPrice
          showModal
          barangOptions={barangList}
          lockPrices
          emptyBarangMessage={
            invoice.client.nama.trim()
              ? 'Belum ada barang untuk customer ini — tambahkan di Master Barang'
              : 'Pilih customer terlebih dahulu'
          }
          onPickBarang={handlePickBarang}
        />

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">PPN (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={invoice.ppn || ''}
              onChange={(e) => setInvoice((prev) => ({ ...prev, ppn: e.target.value === '' ? 0 : Number(e.target.value) || 0 }))}
              className="text-sm"
            />
          </div>
          {!dpDisabled && (
            <div className="space-y-1.5 mt-3">
              <Label className="text-xs">DP (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={invoice.dp || ''}
                onChange={(e) => setInvoice((prev) => ({ ...prev, dp: e.target.value === '' ? 0 : Math.min(100, Number(e.target.value) || 0) }))}
                placeholder="0"
                className="text-sm"
              />
            </div>
          )}
          {/* Blok input Profit dihapus (permintaan owner) — nilai profit dari
              referensi tetap tersimpan di data (uangCapek), hanya tidak
              ditampilkan/diedit di form ini. */}
          <div className="mt-3 rounded-lg bg-emerald-50 p-3 space-y-1">
            <p className="text-sm text-emerald-800">
              Total: <span className="font-bold">{formatRupiah(total)}</span>
            </p>
            {(invoice.dp > 0) && (
              <>
                <p className="text-sm text-emerald-800">
                  DP ({invoice.dp}%): <span className="font-bold">{formatRupiah(dpAmount)}</span>
                </p>
                <p className="text-sm text-emerald-800">
                  Sisa Pembayaran: <span className="font-bold">{formatRupiah(sisa)}</span>
                </p>
              </>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <Label className="text-xs">Catatan</Label>
            <Textarea
              value={invoice.catatan}
              onChange={(e) => setInvoice((prev) => ({ ...prev, catatan: e.target.value }))}
              placeholder="Catatan tambahan..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
        </div>
        </div>
      </DocumentEditorLayout>
    </>
  );
}
