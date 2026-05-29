'use client';

import { useEffect, useCallback, useState } from 'react';
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

export function HistoryTable({ docType, documentLabel, onLoad }: HistoryTableProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Listen for save events from DocumentActionButtons
  useEffect(() => {
    const handler = () => fetchHistory();
    window.addEventListener('dokupro:history-updated', handler);
    return () => window.removeEventListener('dokupro:history-updated', handler);
  }, [fetchHistory]);

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
                    <TableCell className="py-2.5 text-xs font-medium text-gray-900">{entry.nomor}</TableCell>
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
