'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { InvoicePreview } from './invoice-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { CompanyFields } from './company-fields';
import { ItemsFields } from './items-fields';
import { formatRupiah } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import { fetcher } from '@/lib/fetcher';
import { notifyDataChange } from '@/lib/data-sync';
import {
  Wallet,
  CheckCircle2,
  CircleDot,
  Loader2,
  Search,
  X,
  CalendarClock,
  AlertTriangle,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { toJpeg } from 'html-to-image';
import { cn } from '@/lib/utils';
import type { InvoiceData, CompanyInfo } from '@/lib/types';
import { DEFAULT_COMPANY } from '@/lib/types';

// --- Types ---
interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

// --- Helper ---
function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Parse dataJson for document info ---
function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson);
    const items = parsed.items || [];
    const firstItem = items[0];
    const namaBarang = firstItem?.deskripsi || '';
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0);
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0);
    const ppn = parsed.ppn || 0;
    const dpPercent = parsed.dp || 0;
    const totalHarga = subtotal + (subtotal * ppn / 100);
    // Use saved dpAmount if available, otherwise calculate from percentage
    const dpAmount = parsed.dpAmount !== undefined ? parsed.dpAmount : totalHarga * (dpPercent / 100);
    const sisa = totalHarga - dpAmount;
    const lunas = parsed.lunas === true;
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || '';
    const tanggalPelunasan = parsed.tanggalPelunasan || '';
    return { namaBarang, totalQty, totalHarga, dpPercent, dp: dpAmount, sisa, lunas, tanggalJatuhTempo, tanggalPelunasan };
  } catch {
    return { namaBarang: '', totalQty: 0, totalHarga: 0, dpPercent: 0, dp: 0, sisa: 0, lunas: false, tanggalJatuhTempo: '', tanggalPelunasan: '' };
  }
}

// --- Parse dataJson for InvoiceData ---
function parseInvoiceData(entry: HistoryEntry): InvoiceData {
  try {
    const parsed = JSON.parse(entry.dataJson);
    const company: CompanyInfo = {
      nama: parsed.company?.nama || DEFAULT_COMPANY.nama,
      telepon: parsed.company?.telepon || DEFAULT_COMPANY.telepon,
      alamat: parsed.company?.alamat || DEFAULT_COMPANY.alamat,
      email: parsed.company?.email || DEFAULT_COMPANY.email,
      npwp: parsed.company?.npwp || '',
      website: parsed.company?.website || '',
      ppn: parsed.company?.ppn ?? parsed.ppn ?? 11,
      logo: parsed.company?.logo || '',
      bankName: parsed.company?.bankName || '',
      bankAccount: parsed.company?.bankAccount || '',
      bankHolder: parsed.company?.bankHolder || '',
      bankName2: parsed.company?.bankName2 || '',
      bankAccount2: parsed.company?.bankAccount2 || '',
      bankHolder2: parsed.company?.bankHolder2 || '',
    };
    const client = parsed.client || { nama: '', kontak: '', alamat: '' };
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }));
    return {
      type: 'invoice',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      client,
      items,
      ppn: parsed.ppn ?? 11,
      dp: parsed.dp || 0,
      dpAmount: parsed.dpAmount,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
      lunas: parsed.lunas === true,
      tanggalPelunasan: parsed.tanggalPelunasan || '',
    };
  } catch {
    return {
      type: 'invoice',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      client: { nama: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      dp: 0,
      catatan: '',
      tanggalJatuhTempo: '',
      caraPembayaran: '',
      tanggalGiro: '',
      lunas: false,
      tanggalPelunasan: '',
    };
  }
}

export function InvoicePelunasanEditor() {
  // Local invoice state (not using global store to avoid conflicts with regular editor)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pelunasanSaving, setPelunasanSaving] = useState(false);
  const [jpgGenerating, setJpgGenerating] = useState(false);

  // Pelunasan fields
  const [lunasToggle, setLunasToggle] = useState(false);
  const [tanggalPelunasan, setTanggalPelunasan] = useState('');
  const [tanggalJatuhTempo, setTanggalJatuhTempo] = useState('');
  const [caraPembayaran, setCaraPembayaran] = useState('');
  const [tanggalGiro, setTanggalGiro] = useState('');

  // Original DP amount — fixed when invoice is first selected, does NOT change when items are added
  const [originalDpAmount, setOriginalDpAmount] = useState(0);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const res = await fetch('/api/history?docType=invoice', { headers });
      if (res.ok) {
        const json = await res.json();
        setInvoiceHistory(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch invoice history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const handler = () => fetchHistory();
    window.addEventListener('dokupro:history-updated', handler);
    return () => window.removeEventListener('dokupro:history-updated', handler);
  }, [fetchHistory]);

  // Filter pending invoices (with DP and not yet lunas)
  // Business rule: having DP means belum lunas, only explicit lunas flag marks it as paid
  const pendingInvoices = useMemo(() => {
    return invoiceHistory.filter(entry => {
      const info = parseDocInfo(entry);
      return (info.dpPercent > 0 || info.dp > 0) && !info.lunas;
    });
  }, [invoiceHistory]);

  // Filter by search
  const filteredPending = useMemo(() => {
    if (!searchQuery.trim()) return pendingInvoices;
    const q = searchQuery.toLowerCase().trim();
    return pendingInvoices.filter(entry => {
      const info = parseDocInfo(entry);
      return entry.nomor?.toLowerCase().includes(q) || entry.pihakKedua?.toLowerCase().includes(q) || info.namaBarang?.toLowerCase().includes(q);
    });
  }, [pendingInvoices, searchQuery]);

  // Select an invoice
  const selectInvoice = (entry: HistoryEntry) => {
    const parsed = parseInvoiceData(entry);
    const info = parseDocInfo(entry);
    setInvoiceData(parsed);
    setSelectedEntry(entry);
    setLunasToggle(info.lunas);
    setTanggalPelunasan(info.tanggalPelunasan || getTodayStr());
    setTanggalJatuhTempo(info.tanggalJatuhTempo || '');
    setCaraPembayaran(parsed.caraPembayaran || '');
    setTanggalGiro(parsed.tanggalGiro || '');
    // Fix: store original DP amount so it doesn't change when items are added
    setOriginalDpAmount(info.dp);
    setDropdownOpen(false);
  };

  // Clear selection
  const clearSelection = () => {
    setInvoiceData(null);
    setSelectedEntry(null);
    setLunasToggle(false);
    setTanggalPelunasan('');
    setTanggalJatuhTempo('');
    setCaraPembayaran('');
    setTanggalGiro('');
    setOriginalDpAmount(0);
  };

  // Update invoice data locally
  const updateInvoice = (updates: Partial<InvoiceData>) => {
    setInvoiceData(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateCompany = (company: CompanyInfo) => {
    setInvoiceData(prev => prev ? { ...prev, company } : null);
  };

  const updateClient = (field: string, value: string) => {
    setInvoiceData(prev => prev ? { ...prev, client: { ...prev.client, [field]: value } } : null);
  };

  // Build preview data with pelunasan overrides
  const previewData: InvoiceData | null = useMemo(() => {
    if (!invoiceData) {
      // Default preview when no invoice is selected
      return {
        type: 'invoice',
        company: { ...DEFAULT_COMPANY },
        nomor: '-',
        tanggal: getTodayStr(),
        referensi: '',
        client: { nama: '', kontak: '', alamat: '' },
        items: [],
        ppn: 11,
        dp: 0,
        catatan: '',
        tanggalJatuhTempo: '',
        caraPembayaran: '',
        tanggalGiro: '',
        lunas: false,
        tanggalPelunasan: '',
      };
    }
    return {
      ...invoiceData,
      tanggalJatuhTempo,
      caraPembayaran: caraPembayaran as InvoiceData['caraPembayaran'],
      tanggalGiro,
      lunas: lunasToggle,
      tanggalPelunasan: lunasToggle ? tanggalPelunasan : '',
    };
  }, [invoiceData, tanggalJatuhTempo, caraPembayaran, tanggalGiro, lunasToggle, tanggalPelunasan]);

  // Calculate amounts — DP is FIXED at original amount, only subtotal and sisa change
  const subtotal = invoiceData?.items.reduce((sum, item) => sum + item.qty * item.harga, 0) || 0;
  const ppnAmount = subtotal * ((invoiceData?.ppn || 0) / 100);
  const total = subtotal + ppnAmount;
  const dpPercent = invoiceData?.dp || 0;
  // DP amount stays fixed at original value, doesn't recalculate when items change
  const dpAmount = originalDpAmount;
  const sisa = total - dpAmount;

  // Generate JPG from preview and send to WhatsApp
  const handleGenerateJpg = async () => {
    const previewEl = document.querySelector('[data-document-preview]') as HTMLElement;
    if (!previewEl) {
      toast.error('Preview tidak ditemukan');
      return;
    }
    setJpgGenerating(true);
    try {
      const dataUrl = await toJpeg(previewEl, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      // Convert data URL to Blob for sharing
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `Invoice-pel-${invoiceData?.nomor || 'draft'}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // Try Web Share API (mobile) — can share file directly to WhatsApp
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoiceData?.nomor || ''}`,
          text: `Berikut invoice ${invoiceData?.nomor || ''} dari ${invoiceData?.company?.nama || ''}`,
        });
        toast.success('JPG berhasil dikirim ke WhatsApp');
      } else {
        // Fallback (desktop): download JPG + open WhatsApp link
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();

        const phone = invoiceData?.client?.kontak?.replace(/\D/g, '') || '';
        const message = encodeURIComponent(
          `Berikut invoice ${invoiceData?.nomor || ''} dari ${invoiceData?.company?.nama || ''}\n\nJPG invoice sudah didownload, silakan lampirkan ke chat ini.`
        );
        const waUrl = phone
          ? `https://wa.me/${phone}?text=${message}`
          : `https://wa.me/?text=${message}`;
        window.open(waUrl, '_blank');
        toast.success('JPG didownload & WhatsApp terbuka');
      }
    } catch (err) {
      console.error('Failed to generate JPG:', err);
      toast.error('Gagal membuat JPG');
    } finally {
      setJpgGenerating(false);
    }
  };

  // Save pelunasan — update the existing history entry
  const handleSavePelunasan = async () => {
    if (!selectedEntry || !invoiceData) return;
    setPelunasanSaving(true);
    try {
      const parsed = JSON.parse(selectedEntry.dataJson);
      // Update pelunasan fields
      parsed.tanggalJatuhTempo = tanggalJatuhTempo;
      parsed.caraPembayaran = caraPembayaran;
      parsed.tanggalGiro = tanggalGiro;
      if (lunasToggle) {
        parsed.lunas = true;
        parsed.tanggalPelunasan = tanggalPelunasan || getTodayStr();
      } else {
        parsed.lunas = false;
        parsed.tanggalPelunasan = '';
      }
      // Also update any edited fields from the form
      parsed.company = invoiceData.company;
      parsed.client = invoiceData.client;
      parsed.items = invoiceData.items;
      parsed.ppn = invoiceData.ppn;
      parsed.dp = invoiceData.dp;
      // Save fixed DP amount so it doesn't change on restore
      parsed.dpAmount = originalDpAmount;
      parsed.catatan = invoiceData.catatan;
      parsed.nomor = invoiceData.nomor;
      parsed.tanggal = invoiceData.tanggal;
      parsed.referensi = invoiceData.referensi;
      delete parsed.statusPembayaran;

      const newDataJson = JSON.stringify(parsed);
      const res = await fetcher(`/api/history/${selectedEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: newDataJson }),
      });
      if (res.ok) {
        toast.success(lunasToggle ? 'Pelunasan berhasil dicatat!' : 'Invoice berhasil diperbarui');
        clearSelection();
        fetchHistory();
        notifyDataChange('invoice');
      } else {
        toast.error('Gagal menyimpan perubahan');
      }
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setPelunasanSaving(false);
    }
  };

  return (
    <DocumentEditorLayout
      title="Invoice Pelunasan"
      previewContent={<InvoicePreview data={previewData!} showPelunasanLabel dpAmountOverride={originalDpAmount} />}
      actions={
        invoiceData ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              className="border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast.dismiss();
                const origTitle = document.title;
                document.title = ' ';
                setTimeout(() => {
                  window.print();
                  document.title = origTitle;
                }, 100);
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Cetak
            </Button>
            <Button
              size="sm"
              onClick={handleGenerateJpg}
              disabled={jpgGenerating}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {jpgGenerating ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Membuat...</>
              ) : (
                <><ImageIcon className="mr-1.5 h-3.5 w-3.5" /> JPG</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleSavePelunasan}
              disabled={pelunasanSaving}
              className={cn(
                'text-white',
                lunasToggle
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {pelunasanSaving ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Menyimpan...</>
              ) : (
                <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> {lunasToggle ? 'Simpan Pelunasan' : 'Simpan Perubahan'}</>
              )}
            </Button>
          </div>
        ) : undefined
      }
    >
      {/* Invoice Selector */}
      <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-amber-600" />
          Pilih Invoice Belum Lunas
        </h3>
        <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <PopoverAnchor asChild>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={selectedEntry ? `${selectedEntry.nomor} — ${selectedEntry.pihakKedua}` : "Cari no. invoice, customer..."}
                value={selectedEntry ? `${selectedEntry.nomor} — ${selectedEntry.pihakKedua}` : searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (selectedEntry) { clearSelection(); } }}
                onFocus={() => { if (selectedEntry) { clearSelection(); } setDropdownOpen(true); }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-8 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
              {selectedEntry && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); clearSelection(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="p-0 w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {loading ? (
              <div className="px-3 py-4 text-center"><Loader2 className="w-5 h-5 mx-auto text-blue-500 animate-spin" /><p className="text-xs text-slate-400 mt-1">Memuat...</p></div>
            ) : filteredPending.length > 0 ? (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-amber-50 border-b border-amber-100 sticky top-0">
                  Menunggu Pelunasan ({filteredPending.length})
                </div>
                {filteredPending.map((entry) => {
                  const info = parseDocInfo(entry);
                  const isOverdue = info.tanggalJatuhTempo && new Date(info.tanggalJatuhTempo) < new Date(getTodayStr());
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectInvoice(entry); }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-slate-50 last:border-b-0',
                        selectedEntry?.id === entry.id ? 'bg-amber-50' : 'hover:bg-amber-50/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-violet-700 text-xs">{entry.nomor || '-'}</span>
                            {isOverdue && <AlertTriangle className="w-3 h-3 text-red-500" />}
                          </div>
                          <p className="text-slate-600 text-[11px] truncate">{entry.pihakKedua || '-'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-red-600 font-bold text-xs">{formatRupiah(info.sisa)}</p>
                          <p className="text-[9px] text-violet-500">DP {info.dpPercent}%</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-4 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-300 mb-2" />
                <p className="text-xs text-slate-400">Semua invoice sudah lunas</p>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Quick list when no invoice selected */}
        {!selectedEntry && !loading && pendingInvoices.length > 0 && (
          <div className="mt-3 divide-y divide-slate-100 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
            {pendingInvoices.slice(0, 10).map((entry) => {
              const info = parseDocInfo(entry);
              const isOverdue = info.tanggalJatuhTempo && new Date(info.tanggalJatuhTempo) < new Date(getTodayStr());
              return (
                <div
                  key={entry.id}
                  onClick={() => selectInvoice(entry)}
                  className="px-3 py-2.5 hover:bg-amber-50/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-violet-700 text-xs">{entry.nomor || '-'}</span>
                        <CircleDot className="w-2.5 h-2.5 text-red-500" />
                        {isOverdue && <AlertTriangle className="w-3 h-3 text-red-500" />}
                      </div>
                      <p className="text-slate-600 text-[11px] truncate">{entry.pihakKedua || '-'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-red-600 font-bold text-xs">{formatRupiah(info.sisa)}</p>
                      <p className="text-[9px] text-violet-500">DP {info.dpPercent}%</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* When an invoice is selected, show the editor form */}
      {invoiceData ? (
        <>
          <CompanyFields company={invoiceData.company} onChange={updateCompany} />

          <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detail Dokumen
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">No. Invoice</Label>
                <Input
                  value={invoiceData.nomor}
                  readOnly
                  className="bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tanggal</Label>
                <Input
                  type="date"
                  value={invoiceData.tanggal}
                  onChange={(e) => updateInvoice({ tanggal: e.target.value })}
                />
              </div>
            </div>
            {invoiceData.referensi && (
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs">Referensi</Label>
                <Input value={invoiceData.referensi} readOnly className="bg-slate-50 text-slate-500 cursor-not-allowed" />
              </div>
            )}
          </div>

          {/* Informasi Pembayaran - Pelunasan specific */}
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50/30 p-3 sm:p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Informasi Pelunasan
            </h3>

            {/* Amount Summary */}
            <div className="rounded-lg bg-white p-3 space-y-1.5 mb-3 border border-amber-100">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">{formatRupiah(subtotal)}</span>
              </div>
              {invoiceData?.ppn > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">PPN ({invoiceData.ppn}%)</span>
                  <span className="font-medium text-slate-700">{formatRupiah(ppnAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Total</span>
                <span className="font-bold text-emerald-700">{formatRupiah(total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">DP Awal{dpPercent > 0 ? ` (${dpPercent}%)` : ''}</span>
                <span className="font-medium text-violet-700">- {formatRupiah(dpAmount)}</span>
              </div>
              <div className="flex justify-between text-sm pt-1.5 border-t border-dashed border-amber-200">
                <span className="font-semibold text-slate-700">Sisa Pembayaran</span>
                <span className={cn('font-bold', lunasToggle ? 'text-green-600' : 'text-red-600')}>
                  {formatRupiah(sisa)}
                </span>
              </div>
            </div>

            {/* Tanggal Jatuh Tempo */}
            <div className="space-y-1.5 mb-3">
              <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Tanggal Jatuh Tempo
              </Label>
              <Input
                type="date"
                value={tanggalJatuhTempo}
                onChange={(e) => setTanggalJatuhTempo(e.target.value)}
              />
            </div>

            {/* Cara Pembayaran */}
            <div className="space-y-1.5 mb-3">
              <Label className="text-xs">Cara Pembayaran</Label>
              <div className="flex gap-1.5">
                {(['cash', 'transfer', 'giro'] as const).map((method) => {
                  const labels: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', giro: 'Giro' };
                  const isSelected = caraPembayaran === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setCaraPembayaran(prev => prev === method ? '' : method);
                        if (method !== 'giro') setTanggalGiro('');
                      }}
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

            {/* Tanggal Giro */}
            {caraPembayaran === 'giro' && (
              <div className="space-y-1.5 mb-3">
                <Label className="text-xs">Tgl. Giro</Label>
                <Input
                  type="date"
                  value={tanggalGiro}
                  onChange={(e) => setTanggalGiro(e.target.value)}
                />
              </div>
            )}

            {/* Lunas Toggle */}
            <div className="rounded-xl border-2 border-amber-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {lunasToggle ? (
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-amber-600" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Tandai Lunas</p>
                    <p className="text-[11px] text-slate-500">
                      {lunasToggle ? 'Sisa sudah dibayar' : 'Sisa belum dibayar'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={lunasToggle}
                  onCheckedChange={(checked) => {
                    setLunasToggle(checked);
                    if (checked && !tanggalPelunasan) setTanggalPelunasan(getTodayStr());
                  }}
                />
              </div>

              {lunasToggle && (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-xs font-medium text-slate-600">Tanggal Pelunasan</Label>
                    <Input
                      type="date"
                      value={tanggalPelunasan}
                      onChange={(e) => setTanggalPelunasan(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div className="rounded-lg bg-green-50 p-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-green-800">Sudah Lunas</p>
                      <p className="text-[10px] text-green-600">
                        Sisa {formatRupiah(sisa)} telah dibayar{tanggalPelunasan ? ` pada ${new Date(tanggalPelunasan).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Client info */}
          <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kepada Yth :
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Customer</Label>
              <Input
                value={invoiceData.client.nama}
                onChange={(e) => updateClient('nama', e.target.value)}
                placeholder="Nama customer"
              />
            </div>
            <div className="space-y-1.5 mt-2">
              <Label className="text-xs">Nomor Telp</Label>
              <Input
                value={invoiceData.client.kontak}
                onChange={(e) => updateClient('kontak', e.target.value)}
                placeholder="No. telepon / email"
              />
            </div>
            <div className="space-y-1.5 mt-2">
              <Label className="text-xs">Alamat</Label>
              <Input
                value={invoiceData.client.alamat}
                onChange={(e) => updateClient('alamat', e.target.value)}
                placeholder="Alamat lengkap"
              />
            </div>
          </div>

          {/* Items */}
          <ItemsFields
            items={invoiceData.items}
            onChange={(items) => updateInvoice({ items })}
            showPrice
          />

          {/* Additional info */}
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
                value={invoiceData.ppn || ''}
                onChange={(e) => updateInvoice({ ppn: e.target.value === '' ? 0 : Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5 mt-3">
              <Label className="text-xs">DP (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={invoiceData.dp || ''}
                readOnly
                className="bg-slate-50 text-slate-500 cursor-not-allowed"
                placeholder="0"
              />
            </div>
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 space-y-1">
              <p className="text-sm text-emerald-800">
                Subtotal: <span className="font-bold">{formatRupiah(subtotal)}</span>
              </p>
              {invoiceData.ppn > 0 && (
                <p className="text-sm text-emerald-800">
                  PPN ({invoiceData.ppn}%): <span className="font-bold">{formatRupiah(ppnAmount)}</span>
                </p>
              )}
              <p className="text-sm text-emerald-800">
                Total: <span className="font-bold">{formatRupiah(total)}</span>
              </p>
              {dpAmount > 0 && (
                <>
                  <p className="text-sm text-emerald-800">
                    DP Awal: <span className="font-bold">{formatRupiah(dpAmount)}</span>
                  </p>
                  <p className="text-sm text-emerald-800">
                    Sisa Pembayaran: <span className="font-bold">{formatRupiah(sisa)}</span>
                  </p>
                </>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Catatan</Label>
              <Textarea
                value={invoiceData.catatan}
                onChange={(e) => updateInvoice({ catatan: e.target.value })}
                placeholder="Catatan tambahan..."
                rows={3}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/30 p-6 text-center">
          <Wallet className="w-12 h-12 mx-auto text-amber-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Pilih Invoice yang Belum Lunas</p>
          <p className="text-xs text-slate-400 mt-1">Gunakan kolom pencarian di atas untuk memilih invoice yang akan dilunasi</p>
        </div>
      )}
    </DocumentEditorLayout>
  );
}
