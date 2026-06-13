'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { DocumentActionButtons } from './document-action-buttons';
import { formatRupiah } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export function InvoiceEditor() {
  const invoice = useDokuproStore((s) => s.invoice);
  const setInvoice = useDokuproStore((s) => s.setInvoice);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);
  const router = useRouter();

  const searchParams = useSearchParams();
  const riwayatIdFromUrl = searchParams.get('riwayatId');
  const autoSelectDoneRef = useRef<string | null>(null); // track which riwayatId was auto-selected
  const [savingSj, setSavingSj] = useState(false);

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

  // Fetch next Invoice number from server
  const fetchNextNumber = useCallback(() => {
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

  // Sync referensiInput when invoice.referensi changes externally
  useEffect(() => { setReferensiInput(invoice.referensi) }, [invoice.referensi]);
  // Sync clientInput when invoice.client.nama changes externally
  useEffect(() => { setClientInput(invoice.client.nama) }, [invoice.client.nama]);

  // Filter riwayat list by input
  const filteredRiwayatList = riwayatList.filter((r) => {
    const search = referensiInput.toLowerCase().trim();
    if (!search) return true;
    const noHc = (r.nomorUrut || '').toLowerCase();
    const printName = (r.printName || '').toLowerCase();
    const name = (r.customerName || '').toLowerCase();
    return noHc.includes(search) || printName.includes(search) || name.includes(search);
  });

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

  const updateCompany = (company: typeof invoice.company) => {
    setInvoice((prev) => ({ ...prev, company }));
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
  // Use saved dpAmount if available (preserves original DP when items change), otherwise calculate from percentage
  const dpAmount = invoice.dpAmount !== undefined ? invoice.dpAmount : total * (dpPercent / 100);
  const sisa = total - dpAmount;

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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          docType: 'invoice',
          nomor: invoice.nomor || '-',
          tanggal: invoice.tanggal || '',
          pihakKedua: invoice.client?.nama || '-',
          total: '-',
          dataJson: JSON.stringify({ ...invoice, dpAmount: invoice.dpAmount !== undefined ? invoice.dpAmount : dpAmount }),
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
                className="bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={invoice.tanggal}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggal: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Referensi (No. HC)</Label>
            <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pilih No. HC / ketik referensi..."
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
          onChange={(items) => setInvoice((prev) => ({ ...prev, items }))}
          showPrice
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
            />
          </div>
          <div className="space-y-1.5 mt-3">
            <Label className="text-xs">DP (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={invoice.dp || ''}
              onChange={(e) => setInvoice((prev) => ({ ...prev, dp: e.target.value === '' ? 0 : Math.min(100, Number(e.target.value) || 0) }))}
              placeholder="0"
            />
          </div>
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
            />
          </div>
        </div>
      </DocumentEditorLayout>
    </>
  );
}
