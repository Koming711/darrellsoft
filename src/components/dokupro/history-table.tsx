'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RotateCcw, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import type { DocumentType } from '@/lib/types';

export interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

interface HistoryTableProps {
  docType: DocumentType;
  documentLabel: string;
  onLoad: (data: unknown) => void;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  'surat-jalan': 'Surat Jalan',
  'purchase-order': 'Purchase Order',
  spk: 'SPK',
};

// Calculate uang capek for each invoice by matching referensi with riwayat cetakan profitAmount
function calculateUangCapek(invoices: HistoryEntry[], cetakanRecords: { printName: string; profitAmount: number }[]): Map<string, number> {
  const result = new Map<string, number>();

  // Build cetakan lookup by printName
  const cetakanByPrintName = new Map<string, number>();
  for (const c of cetakanRecords) {
    if (c.printName) {
      cetakanByPrintName.set(c.printName, (cetakanByPrintName.get(c.printName) || 0) + c.profitAmount);
    }
  }

  // Calculate uang capek per invoice
  for (const inv of invoices) {
    try {
      const parsed = JSON.parse(inv.dataJson);
      const referensi = parsed.referensi || '';
      const uangCapek = referensi ? (cetakanByPrintName.get(referensi) || 0) : 0;
      result.set(inv.id, uangCapek);
    } catch {
      result.set(inv.id, 0);
    }
  }

  return result;
}

export function HistoryTable({ docType, documentLabel, onLoad }: HistoryTableProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cetakanList, setCetakanList] = useState<{ printName: string; profitAmount: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/history?docType=${docType}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        setHistory(json.data || []);
      }
    } catch {
      // ignore
    }
  }, [docType]);

  // Fetch riwayat cetakan for uang capek calculation (only when docType is invoice)
  const fetchCetakan = useCallback(async () => {
    if (docType !== 'invoice') return;
    try {
      const res = await fetch('/api/riwayat-cetakan', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const mapped = (Array.isArray(data) ? data : []).map((r: { printName: string; profitAmount: number }) => ({
          printName: r.printName || '',
          profitAmount: r.profitAmount || 0,
        }));
        setCetakanList(mapped);
      }
    } catch {
      // ignore
    }
  }, [docType]);

  useEffect(() => {
    fetchHistory();
    fetchCetakan();
  }, [fetchHistory, fetchCetakan]);

  // Listen for save events from DocumentActionButtons
  useEffect(() => {
    const handler = () => { fetchHistory(); fetchCetakan(); };
    window.addEventListener('dokupro:history-updated', handler);
    return () => window.removeEventListener('dokupro:history-updated', handler);
  }, [fetchHistory, fetchCetakan]);

  // Calculate uang capek per invoice
  const uangCapekMap = useMemo(() => {
    if (docType !== 'invoice') return new Map<string, number>();
    return calculateUangCapek(history, cetakanList);
  }, [docType, history, cetakanList]);

  const handleLoad = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        const parsed = JSON.parse(json.data.dataJson);
        onLoad(parsed);
        toast.success(`${documentLabel} berhasil dimuat dari riwayat`);
      }
    } catch {
      toast.error('Gagal memuat');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus');
        fetchHistory();
      }
    } catch {
      toast.error('Gagal menghapus');
    }
  };

  // Parse dataJson to extract info from items
  const parseDataInfo = (entry: HistoryEntry) => {
    try {
      const parsed = JSON.parse(entry.dataJson);
      const items = parsed.items || [];
      const firstItem = items[0];
      const namaBarang = firstItem?.deskripsi || '';
      const hargaSatuan = firstItem?.harga || 0;
      const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0);
      const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0);
      const ppn = parsed.ppn || 0;
      const totalHarga = subtotal + (subtotal * ppn / 100);
      return { namaBarang, hargaSatuan, totalQty, totalHarga };
    } catch {
      return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0 };
    }
  };

  const showPriceColumns = docType === 'invoice' || docType === 'purchase-order';

  return (
    <div className="mt-8 print:hidden">
      {/* History Header */}
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-gray-900">
          Riwayat {DOC_TYPE_LABELS[docType] || documentLabel}
        </h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
          {history.length}
        </span>
      </div>

      {/* History Table */}
      {history.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">
            Belum ada riwayat {documentLabel.toLowerCase()}.
          </p>
          <p className="mt-1 text-xs text-gray-300">
            Klik &quot;Simpan&quot; untuk menyimpan dokumen saat ini.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                <TableHead className="text-[11px] font-semibold text-gray-500">No. Dokumen</TableHead>
                <TableHead className="text-[11px] font-semibold text-gray-500">Tanggal</TableHead>
                <TableHead className="text-[11px] font-semibold text-gray-500">Nama Customer</TableHead>
                {showPriceColumns && (
                  <TableHead className="text-[11px] font-semibold text-gray-500">Nama Barang</TableHead>
                )}
                {showPriceColumns && (
                  <TableHead className="text-right text-[11px] font-semibold text-gray-500">Qty</TableHead>
                )}
                {showPriceColumns && (
                  <TableHead className="text-right text-[11px] font-semibold text-gray-500">Harga Satuan</TableHead>
                )}
                {docType === 'invoice' && (
                  <TableHead className="text-right text-[11px] font-semibold text-gray-500">Uang Capek</TableHead>
                )}
                {showPriceColumns && (
                  <TableHead className="text-right text-[11px] font-semibold text-gray-500">Total Harga</TableHead>
                )}
                <TableHead className="text-right text-[11px] font-semibold text-gray-500">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry, i) => {
                const info = showPriceColumns ? parseDataInfo(entry) : null;
                return (
                  <TableRow key={entry.id} className="group">
                    <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                    <TableCell className="py-2.5 text-xs">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide ${
                        entry.docType === 'invoice' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        entry.docType === 'surat-jalan' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        entry.docType === 'purchase-order' ? 'bg-violet-50 text-violet-700 border border-violet-200' :
                        'bg-slate-50 text-slate-700 border border-slate-200'
                      }`}>
                        {entry.nomor}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-gray-500">
                      {entry.tanggal ? formatTanggal(entry.tanggal) : '-'}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-gray-600 max-w-[120px] truncate">
                      {entry.pihakKedua}
                    </TableCell>
                    {showPriceColumns && (
                      <TableCell className="py-2.5 text-xs text-gray-700 max-w-[160px] truncate" title={info?.namaBarang || ''}>
                        {info?.namaBarang ? info.namaBarang.split('\n')[0] : '-'}
                      </TableCell>
                    )}
                    {showPriceColumns && (
                      <TableCell className="py-2.5 text-xs text-right text-gray-700">
                        {info && info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}
                      </TableCell>
                    )}
                    {showPriceColumns && (
                      <TableCell className="py-2.5 text-xs text-right text-gray-700">
                        {info && info.hargaSatuan > 0 ? formatRupiah(info.hargaSatuan) : '-'}
                      </TableCell>
                    )}
                    {docType === 'invoice' && (() => {
                      const uc = uangCapekMap.get(entry.id) ?? 0;
                      return (
                        <TableCell className={`py-2.5 text-xs text-right font-semibold whitespace-nowrap ${uc > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
                          {uc > 0 ? formatRupiah(uc) : '-'}
                        </TableCell>
                      );
                    })()}
                    {showPriceColumns && (
                      <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700">
                        {info && info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}
                      </TableCell>
                    )}
                    <TableCell className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleLoad(entry.id)}
                          disabled={loading}
                          title="Muat dokumen ini"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                              title="Hapus"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus Riwayat?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Dokumen <strong>{entry.nomor}</strong> akan dihapus dari riwayat. Tindakan ini tidak dapat dibatalkan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(entry.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Hapus
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
