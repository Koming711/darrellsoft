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
import type { DocumentType } from '@/lib/types';
import { generatePdfFromElement, sharePdfViaWhatsApp } from '@/lib/generate-pdf';

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

      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          nomor: data.nomor || '-',
          tanggal: data.tanggal || '',
          pihakKedua,
          total: '-',
          dataJson: JSON.stringify(currentData),
        }),
      });

      if (res.ok) {
        toast.success(`${documentLabel} berhasil disimpan — dokumen direset`);
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'));
        onReset();
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
      // Find the preview element
      const previewContainer = document.getElementById('document-preview');
      if (!previewContainer) {
        toast.error('Pratinjau dokumen tidak ditemukan');
        return;
      }

      // Try to find the A5 scaler first, fallback to the inner content div
      const previewEl = previewContainer.querySelector('.a5-preview-scaler > div') as HTMLElement
        || previewContainer.querySelector('.a5-preview-scaler') as HTMLElement
        || previewContainer.querySelector('.a5-preview-container') as HTMLElement;

      if (!previewEl) {
        toast.error('Pratinjau dokumen tidak ditemukan');
        return;
      }

      const fileName = `${docType}-${Date.now()}.pdf`;
      const blob = await generatePdfFromElement(previewEl, { format: 'a5' });
      await sharePdfViaWhatsApp(blob, fileName, documentLabel, waWindowRef);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Gagal membuat PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2 print:hidden">
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
            variant="outline"
            size="sm"
            disabled={saving || dataEmpty}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Ya, Simpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
