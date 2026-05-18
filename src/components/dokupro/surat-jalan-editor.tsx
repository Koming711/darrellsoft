'use client';

import { useEffect, useState, useCallback } from 'react';
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

  // Invoice history dropdown state
  const [invoiceList, setInvoiceList] = useState<InvoiceHistoryItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(sj.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

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

  useEffect(() => { loadCompanyFromAPI() }, [loadCompanyFromAPI]);
  useEffect(() => { fetchInvoiceHistory() }, [fetchInvoiceHistory]);

  // Sync referensiInput when sj.referensi changes externally
  useEffect(() => { setReferensiInput(sj.referensi) }, [sj.referensi]);

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
      setSuratJalan({
        ...sj,
        referensi: inv.nomor,
        penerima: {
          nama: invoiceData.client?.nama || sj.penerima.nama,
          kontak: invoiceData.client?.kontak || sj.penerima.kontak,
          alamat: invoiceData.client?.alamat || sj.penerima.alamat,
        },
        items: invoiceData.items?.length > 0
          ? invoiceData.items.map((item) => ({
              id: item.id || crypto.randomUUID(),
              deskripsi: item.deskripsi || '',
              qty: item.qty || 0,
              satuan: item.satuan || '',
              harga: item.harga || 0,
            }))
          : sj.items,
        catatan: '',
      });
    } catch {
      // If parsing fails, just set the referensi
      setSuratJalan({ ...sj, referensi: inv.nomor });
    }
    setReferensiInput(inv.nomor);
    setDropdownOpen(false);
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

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">No. Surat Jalan</Label>
              <Input
                value={sj.nomor}
                onChange={(e) => setSuratJalan({ ...sj, nomor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
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

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Diterima Oleh
          </h3>
          <div className="space-y-2">
            <Label className="text-xs">Nama</Label>
            <Input
              value={sj.penerima.nama}
              onChange={(e) => updatePenerima('nama', e.target.value)}
              placeholder="Nama penerima"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Kontak</Label>
            <Input
              value={sj.penerima.kontak}
              onChange={(e) => updatePenerima('kontak', e.target.value)}
              placeholder="No. telepon / email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={sj.penerima.alamat}
              onChange={(e) => updatePenerima('alamat', e.target.value)}
              placeholder="Alamat penerima"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-2">
            <Label className="text-xs">No. Kendaraan</Label>
            <Input
              value={sj.noKendaraan}
              onChange={(e) => setSuratJalan({ ...sj, noKendaraan: e.target.value })}
              placeholder="B 1234 XYZ"
            />
          </div>
          <div className="space-y-2">
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

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Catatan
          </h3>
          <Textarea
            value={sj.catatan}
            onChange={(e) => setSuratJalan({ ...sj, catatan: e.target.value })}
            placeholder="Catatan tambahan..."
            rows={3}
          />
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
