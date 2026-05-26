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
import { HistoryTable } from './history-table';
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
  const autoSelectRef = useRef(false);

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
      }
    } catch {
      // silently fail
    }
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

  // Sync referensiInput when sj.referensi changes externally
  useEffect(() => { setReferensiInput(sj.referensi) }, [sj.referensi]);
  // Sync penerimaInput when sj.penerima.nama changes externally
  useEffect(() => { setPenerimaInput(sj.penerima.nama) }, [sj.penerima.nama]);

  // Auto-select invoice when coming from Invoice page with invoiceId
  useEffect(() => {
    if (invoiceIdFromUrl && invoiceList.length > 0 && !autoSelectRef.current) {
      const found = invoiceList.find((inv) => String(inv.id) === String(invoiceIdFromUrl));
      if (found) {
        autoSelectRef.current = true;
        // Reset surat jalan first to clear stale data
        resetDocument('surat-jalan');
        setTimeout(() => {
          handleInvoiceSelect(found);
        }, 0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceIdFromUrl, invoiceList]);

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
    setSuratJalan({ ...sj, referensi: value });
    setDropdownOpen(true);
  };

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
    setSuratJalan({
      ...sj,
      penerima: {
        nama: item.name,
        kontak: item.phone || item.email || '',
        alamat: item.address || '',
      },
    });
    setPenerimaDropdownOpen(false);
  };

  const updateCompany = (company: typeof sj.company) => {
    setSuratJalan({ ...sj, company });
  };

  const updatePenerima = (field: string, value: string) => {
    setSuratJalan({
      ...sj,
      penerima: { ...sj.penerima, [field]: value },
    });
  };

  const handleLoad = (data: unknown) => {
    setSuratJalan(data as SuratJalanData);
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

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
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
                onChange={(e) => setSuratJalan({ ...sj, tanggal: e.target.value })}
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

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
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

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">No. Kendaraan</Label>
            <Input
              value={sj.noKendaraan}
              onChange={(e) => setSuratJalan({ ...sj, noKendaraan: e.target.value })}
              placeholder="B 1234 XYZ"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pengemudi</Label>
            <Input
              value={sj.pengemudi}
              onChange={(e) => setSuratJalan({ ...sj, pengemudi: e.target.value })}
              placeholder="Nama pengemudi"
            />
          </div>
        </div>

        <ItemsFields
          items={sj.items}
          onChange={(items) => setSuratJalan({ ...sj, items })}
          showPrice={false}
        />

        <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Catatan
          </h3>
          <div className="space-y-1.5">
            <Textarea
              value={sj.catatan}
              onChange={(e) => setSuratJalan({ ...sj, catatan: e.target.value })}
              placeholder="Catatan tambahan..."
              rows={3}
            />
          </div>
        </div>
      </DocumentEditorLayout>

      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <HistoryTable
          docType="surat-jalan"
          documentLabel="Surat Jalan"
          onLoad={handleLoad}
        />
      </div>
    </>
  );
}
