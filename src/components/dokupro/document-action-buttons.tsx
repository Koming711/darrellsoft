'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
import { Save, RotateCcw, Printer, AlertTriangle, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthHeaders } from '@/lib/auth';
import type { DocumentType, InvoiceData, PurchaseOrderData, SuratJalanData } from '@/lib/types';
import {
  generateInvoicePdf,
  generatePurchaseOrderPdf,
  generateSuratJalanPdf,
  generatePdfFromElement,
  sharePdfViaWhatsApp,
} from '@/lib/generate-pdf';

interface DocumentActionButtonsProps {
  docType: DocumentType;
  documentLabel: string;
  currentData: Record<string, unknown>;
  onReset: () => void;
}

function isDataEmpty(data: Record<string, unknown>): boolean {
  const d = data as {
    client?: { nama: string };
    penerima?: { nama: string };
    pemasok?: { nama: string };
    items?: { deskripsi: string }[];
  };
  const pihakKedua = d.client?.nama || d.penerima?.nama || d.pemasok?.nama;
  const hasItem = d.items?.some((item) => item.deskripsi.trim() !== '');
  return !pihakKedua?.trim() || !hasItem;
}

export function DocumentActionButtons({
  docType,
  documentLabel,
  currentData,
  onReset,
}: DocumentActionButtonsProps) {
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const dataEmpty = isDataEmpty(currentData);
  const waWindowRef = useRef<Window | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = currentData as {
        nomor: string;
        tanggal: string;
        client?: { nama: string };
        penerima?: { nama: string };
        pemasok?: { nama: string };
      };

      const pihakKedua = data.client?.nama || data.penerima?.nama || data.pemasok?.nama || '-';

      // For invoice: include calculated dpAmount and originalTotal so DP stays fixed after save
      let dataToSave = currentData;
      if (docType === 'invoice') {
        const inv = currentData as Record<string, unknown>;
        const items = (inv.items as Array<{ qty: number; harga: number }>) || [];
        const sub = items.reduce((s, it) => s + it.qty * it.harga, 0);
        const ppn = (inv.ppn as number) || 0;
        const tot = sub + (sub * ppn / 100);
        const updates: Record<string, unknown> = {};
        // Save originalTotal so DP can always be calculated from the original amount
        if (inv.originalTotal === undefined) {
          updates.originalTotal = tot;
        }
        // Calculate dpAmount from originalTotal (not current total which may include pelunasan items)
        if (inv.dpAmount === undefined && inv.dp && Number(inv.dp) > 0) {
          // Use the originalTotal that's about to be saved (updates.originalTotal) if it was just calculated,
          // otherwise use the existing inv.originalTotal, or fall back to tot
          const baseTotal = (updates.originalTotal as number) ?? (inv.originalTotal as number) ?? tot;
          updates.dpAmount = baseTotal * (Number(inv.dp) / 100);
        }
        if (Object.keys(updates).length > 0) {
          dataToSave = { ...currentData, ...updates };
        }
      }

      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          docType,
          nomor: data.nomor || '-',
          tanggal: data.tanggal || '',
          pihakKedua,
          total: '-',
          dataJson: JSON.stringify(dataToSave),
        }),
      });

      if (res.ok) {
        toast.success(`${documentLabel} berhasil disimpan — dokumen direset`);
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'));
        onReset();
      } else if (res.status === 409) {
        const errData = await res.json().catch(() => ({}));
        toast('Data tidak berubah, riwayat tidak duplikat.', { description: 'Ubah minimal 1 data untuk menyimpan riwayat baru.' });
      } else {
        toast.error('Gagal menyimpan');
      }
    } catch {
      toast.error('Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    onReset();
    toast.success(`Dokumen ${documentLabel.toLowerCase()} direset`);
  };

  const handlePdfWhatsApp = async () => {
    setGeneratingPdf(true);
    try {
      const fileName = `${docType}-${Date.now()}.pdf`;
      let blob: Blob;

      if (docType === 'invoice') {
        // For invoice: capture the preview DOM element to match print output exactly
        const previewEl = document.querySelector('[data-document-preview]') as HTMLElement;
        if (previewEl) {
          blob = await generatePdfFromElement(previewEl);
        } else {
          // Fallback to programmatic PDF if element not found
          blob = await generateInvoicePdf(currentData as unknown as InvoiceData);
        }
      } else if (docType === 'purchase-order') {
        // Try DOM element capture first for A5-fitted output matching print
        const previewEl = document.querySelector('[data-document-preview]') as HTMLElement;
        if (previewEl) {
          blob = await generatePdfFromElement(previewEl);
        } else {
          blob = await generatePurchaseOrderPdf(currentData as unknown as PurchaseOrderData);
        }
      } else if (docType === 'surat-jalan') {
        // Try DOM element capture first for A5-fitted output matching print
        const previewEl = document.querySelector('[data-document-preview]') as HTMLElement;
        if (previewEl) {
          blob = await generatePdfFromElement(previewEl);
        } else {
          blob = await generateSuratJalanPdf(currentData as unknown as SuratJalanData);
        }
      } else {
        toast.error('Tipe dokumen tidak didukung untuk PDF');
        return;
      }

      if (!blob || !(blob instanceof Blob)) {
        toast.error('Gagal membuat PDF - blob tidak valid');
        return;
      }

      await sharePdfViaWhatsApp(blob, fileName, documentLabel, waWindowRef);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Gagal membuat PDF. Coba lagi atau gunakan Cetak.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="print:hidden">
      {/* Desktop: single row */}
      <div className="hidden sm:flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-700"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset
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
          <Printer className="mr-1.5 h-3.5 w-3.5" />
          Cetak
        </Button>
        <Button
          size="sm"
          onClick={handlePdfWhatsApp}
          disabled={generatingPdf || dataEmpty}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generatingPdf ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              PDF...
            </>
          ) : (
            <>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </>
          )}
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={saving || dataEmpty}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <AlertDialogTitle className="text-left">Data sudah benar?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-left pl-[52px]">
                Harap di cek!! Pastikan semua data yang Anda masukkan sudah benar sebelum menyimpan ke riwayat.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="mt-0">Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false);
                  handleSave();
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Ya, Simpan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Mobile: 2x2 grid */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="border-gray-200 text-gray-600 hover:bg-gray-50 h-9"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset
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
          className="bg-emerald-600 hover:bg-emerald-700 h-9"
        >
          <Printer className="mr-1.5 h-3.5 w-3.5" />
          Cetak
        </Button>
        <Button
          size="sm"
          onClick={handlePdfWhatsApp}
          disabled={generatingPdf || dataEmpty}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 h-9"
        >
          {generatingPdf ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              PDF...
            </>
          ) : (
            <>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </>
          )}
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={saving || dataEmpty}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 h-9"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <AlertDialogTitle className="text-left">Data sudah benar?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-left pl-[52px]">
                Harap di cek!! Pastikan semua data yang Anda masukkan sudah benar sebelum menyimpan ke riwayat.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="mt-0">Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false);
                  handleSave();
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Ya, Simpan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
