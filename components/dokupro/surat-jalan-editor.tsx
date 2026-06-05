'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { useDokuproStore } from '@/lib/store';
import { CompanyFields } from './company-fields';
import { ItemsFields } from './items-fields';
import { SuratJalanPreview } from './surat-jalan-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { DocumentActionButtons } from './document-action-buttons';
import { getAuthHeaders } from '@/lib/auth';
import type { SuratJalanData, InvoiceData } from '@/lib/types';

interface CustomerItem {
  id: string;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface InvoiceHistoryItem {
  id: number;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

export function SuratJalanEditor() {
  const sj = useDokuproStore((s) => s.suratJalan);
  const setSuratJalan = useDokuproStore((s) => s.setSuratJalan);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);

  const searchParams = useSearchParams();
  const invoiceIdFromUrl = searchParams.get('invoiceId');
  const autoSelectDoneRef = useRef<string | null>(null); // track which invoiceId was auto-selected

  // Invoice history dropdown state
  const [invoiceList, setInvoiceList] = useState<InvoiceHistoryItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(sj.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Customer dropdown state
  const [customerList, setCustomerList] = useState<CustomerItem[]>([]);
  const [penerimaInput, setPenerimaInput] = useState(sj.penerima.nama);
  const [penerimaDropdownOpen, setPenerimaDropdownOpen] = useState(false);
  const [penerimaTyping, setPenerimaTyping] = useState(false);

  const fetchInvoiceHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history?docType=invoice', { headers: getAuthHeaders() });
      if (res.ok) {
        const result = await res.json();
        setInvoiceList(result.data || []);
        return result.data || [];
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
  useEffect(() => { fetchInvoiceHistory() }, [fetchInvoiceHistory]);
  useEffect(() => { fetchCustomers() }, [fetchCustomers]);

  // Fetch next Surat Jalan number from server
  const fetchNextNumber = useCallback(() => {
    fetch('/api/history?preview=next-number&docType=surat-jalan', { headers: getAuthHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.nextNumber) setSuratJalan((prev) => ({ ...prev, nomor: data.nextNumber })) })
      .catch(() => {});
  }, [setSuratJalan]);

  useEffect(() => { fetchNextNumber() }, [fetchNextNumber]);

  // Re-fetch next number after a document is saved
  useEffect(() => {
    const handler = () => { fetchNextNumber() };
    window.addEventListener('dokupro:history-updated', handler);
    return () => { window.removeEventListener('dokupro:history-updated', handler) };
  }, [fetchNextNumber]);

  // Sync referensiInput when sj.referensi changes externally
  useEffect(() => { setReferensiInput(sj.referensi) }, [sj.referensi]);
  // Sync penerimaInput when sj.penerima.nama changes externally
  useEffect(() => { setPenerimaInput(sj.penerima.nama) }, [sj.penerima.nama]);

  // Handle invoice selection — defined before auto-select effect to avoid hoisting issues
  const handleInvoiceSelect = (inv: InvoiceHistoryItem) => {
    try {
      const invoiceData: InvoiceData = JSON.parse(inv.dataJson);
      setSuratJalan((prev) => ({
        ...prev,
        referensi: inv.nomor,
        penerima: {
          nama: invoiceData.client?.nama || prev.penerima.nama,
          kontak: invoiceData.client?.kontak || prev.penerima.kontak,
          alamat: invoiceData.client?.alamat || prev.penerima.alamat,
        },
        items: invoiceData.items?.length > 0
          ? invoiceData.items.map((item) => ({
              id: item.id || crypto.randomUUID(),
              deskripsi: item.deskripsi || '',
              qty: item.qty || 0,
              satuan: item.satuan || '',
              harga: item.harga || 0,
            }))
          : prev.items,
        catatan: '',
      }));
    } catch {
      // If parsing fails, just set the referensi
      setSuratJalan((prev) => ({ ...prev, referensi: inv.nomor }));
    }
    setReferensiInput(inv.nomor);
    setDropdownOpen(false);
  };

  // Auto-select invoice when coming from Invoice page with invoiceId
  // Fetches the specific invoice directly by ID for reliability (no race condition with list loading)
  useEffect(() => {
    if (!invoiceIdFromUrl) return;
    if (autoSelectDoneRef.current === invoiceIdFromUrl) return;

    let cancelled = false;

    const fetchAndApply = async () => {
      // First, try to find it in the already-loaded list (fast path)
      const foundInList = invoiceList.find((inv) => String(inv.id) === String(invoiceIdFromUrl));
      if (foundInList) {
        if (!cancelled) {
          autoSelectDoneRef.current = invoiceIdFromUrl;
          handleInvoiceSelect(foundInList);
        }
        return;
      }

      // Not in list yet — fetch directly by ID from the API (reliable path)
      try {
        const res = await fetch(`/api/history/${invoiceIdFromUrl}`, { headers: getAuthHeaders() });
        if (res.ok && !cancelled) {
          const result = await res.json();
          if (result.success && result.data) {
            autoSelectDoneRef.current = invoiceIdFromUrl;
            handleInvoiceSelect(result.data as InvoiceHistoryItem);
          }
        }
      } catch {
        // Fallback: retry once after a short delay
        if (cancelled) return;
        await new Promise(r => setTimeout(r, 800));
        if (cancelled) return;
        try {
          const res = await fetch(`/api/history/${invoiceIdFromUrl}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.data) {
              autoSelectDoneRef.current = invoiceIdFromUrl;
              handleInvoiceSelect(result.data as InvoiceHistoryItem);
            }
          }
        } catch {
          // Give up silently
        }
      }
    };

    fetchAndApply();

    return () => { cancelled = true; };
  }, [invoiceIdFromUrl]);

  // Filter invoice list by input
  const filteredInvoiceList = invoiceList.filter((inv) => {
    const search = referensiInput.toLowerCase().trim();
    if (!search) return true;
    const nomor = (inv.nomor || '').toLowerCase();
    const pihak = (inv.pihakKedua || '').toLowerCase();
    return nomor.includes(search) || pihak.includes(search);
  });

  const handleReferensiInputChange = (value: string) => {
    setReferensiInput(value);
    setSuratJalan((prev) => ({ ...prev, referensi: value }));
    setDropdownOpen(true);
  };

  // Filter customer list (only when user is actively typing)
  const filteredCustomerList = useMemo(() =>
    penerimaTyping
      ? customerList.filter((c) => {
          const search = penerimaInput.toLowerCase().trim();
          if (!search) return true;
          return c.name.toLowerCase().includes(search) ||
                 (c.companyName || '').toLowerCase().includes(search) ||
                 (c.phone || '').toLowerCase().includes(search) ||
                 (c.address || '').toLowerCase().includes(search);
        })
      : customerList
  , [penerimaTyping, customerList, penerimaInput]);

  const handlePenerimaInputChange = (value: string) => {
    setPenerimaInput(value);
    setPenerimaTyping(true);
    updatePenerima('nama', value);
    setPenerimaDropdownOpen(true);
  };

  const handlePenerimaSelect = (item: CustomerItem) => {
    setPenerimaInput(item.name);
    setPenerimaTyping(false);
    setSuratJalan((prev) => ({
      ...prev,
      penerima: {
        nama: item.name,
        kontak: item.phone || item.email || '',
        alamat: item.address || '',
      },
    }));
    setPenerimaDropdownOpen(false);
  };

  const updateCompany = (company: typeof sj.company) => {
    setSuratJalan((prev) => ({ ...prev, company }));
  };

  const updatePenerima = (field: string, value: string) => {
    setSuratJalan((prev) => ({
      ...prev,
      penerima: { ...prev.penerima, [field]: value },
    }));
  };

  return (
    <>
      <DocumentEditorLayout
        title="Surat Jalan"
        previewContent={<SuratJalanPreview data={sj} />}
        actions={
          <DocumentActionButtons
            docType="surat-jalan"
            documentLabel="Surat Jalan"
            currentData={sj}
            onReset={() => resetDocument('surat-jalan')}
          />
        }
      >
        <CompanyFields company={sj.company} onChange={updateCompany} />

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">No. Surat Jalan</Label>
              <Input
                value={sj.nomor}
                readOnly
                className="bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={sj.tanggal}
                onChange={(e) => setSuratJalan((prev) => ({ ...prev, tanggal: e.target.value }))}
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
                    placeholder="Pilih No. Invoice / ketik referensi..."
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
                {filteredInvoiceList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Riwayat Invoice</div>
                    {filteredInvoiceList.map((inv) => (
                      <button
                        key={inv.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleInvoiceSelect(inv) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${sj.referensi === inv.nomor ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="truncate">{inv.nomor || '-'}</span>
                        {inv.pihakKedua && <span className="text-slate-400 ml-1.5 text-[11px]">({inv.pihakKedua})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {filteredInvoiceList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada riwayat invoice</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Yth :
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Customer</Label>
            <Popover open={penerimaDropdownOpen} onOpenChange={setPenerimaDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik atau pilih customer..."
                    value={penerimaInput}
                    onChange={(e) => handlePenerimaInputChange(e.target.value)}
                    onFocus={() => { setPenerimaDropdownOpen(true); setPenerimaTyping(false); }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] pr-9"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onMouseDown={(e) => { e.preventDefault(); setPenerimaTyping(false); setPenerimaDropdownOpen(!penerimaDropdownOpen); }}
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
                        onMouseDown={(e) => { e.preventDefault(); handlePenerimaSelect(c) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${sj.penerima.nama === c.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
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
          <div className="space-y-1.5">
            <Label className="text-xs">Kontak</Label>
            <Input
              value={sj.penerima.kontak}
              onChange={(e) => updatePenerima('kontak', e.target.value)}
              placeholder="No. telepon / email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={sj.penerima.alamat}
              onChange={(e) => updatePenerima('alamat', e.target.value)}
              placeholder="Alamat penerima"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">No. Kendaraan</Label>
            <Input
              value={sj.noKendaraan}
              onChange={(e) => setSuratJalan((prev) => ({ ...prev, noKendaraan: e.target.value }))}
              placeholder="B 1234 XYZ"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pengemudi</Label>
            <Input
              value={sj.pengemudi}
              onChange={(e) => setSuratJalan((prev) => ({ ...prev, pengemudi: e.target.value }))}
              placeholder="Nama pengemudi"
            />
          </div>
        </div>

        <ItemsFields
          items={sj.items}
          onChange={(items) => setSuratJalan((prev) => ({ ...prev, items }))}
          showPrice={false}
        />

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Catatan
          </h3>
          <div className="space-y-1.5">
            <Textarea
              value={sj.catatan}
              onChange={(e) => setSuratJalan((prev) => ({ ...prev, catatan: e.target.value }))}
              placeholder="Catatan tambahan..."
              rows={3}
            />
          </div>
        </div>
      </DocumentEditorLayout>

    </>
  );
}
