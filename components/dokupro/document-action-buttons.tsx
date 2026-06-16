'use client';

import { useState } from 'react';
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
import { Save, RotateCcw, Printer, AlertTriangle, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthHeaders } from '@/lib/auth';
import type { DocumentType } from '@/lib/types';
import { captureElementAsJpg } from '@/lib/capture-jpg';
import { shareJpgToWhatsApp } from '@/lib/share-jpg';

interface DocumentActionButtonsProps {
  docType: DocumentType;
  documentLabel: string;
  currentData: Record<string, unknown>;
  onReset: () => void;
  editingId?: string | null;
  onUpdateSuccess?: () => void;
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
  editingId,
  onUpdateSuccess,
}: DocumentActionButtonsProps) {
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const dataEmpty = isDataEmpty(currentData);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = currentData as {
        nomor: string;
        tanggal: string;
        client?: { nama: string };
        penerima?: { nama: string };
        pemasok?: { nama: string };
        dp?: number;
      };

      const pihakKedua = data.client?.nama || data.penerima?.nama || data.pemasok?.nama || '-';

      // For invoice with DP: save dpAmount into dataJson before saving
      let dataToSave = { ...currentData };
      if (docType === 'invoice' && (data.dp || 0) > 0) {
        const invData = currentData as unknown as InvoiceData;
        const subtotal = invData.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
        const ppnAmount = subtotal * (invData.ppn / 100);
        const total = subtotal + ppnAmount;
        const dpAmount = total * (invData.dp / 100);
        (dataToSave as Record<string, unknown>).dpAmount = dpAmount;
        (dataToSave as Record<string, unknown>).originalTotal = total;
      }

      // If editingId exists, update the existing record instead of creating new
      if (editingId) {
        const res = await fetch(`/api/history/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            nomor: data.nomor || '-',
            tanggal: data.tanggal || '',
            pihakKedua,
            total: '-',
            dataJson: JSON.stringify(dataToSave),
          }),
        });

        if (res.ok) {
          toast.success(`${documentLabel} berhasil diperbarui`);
          window.dispatchEvent(new CustomEvent('dokupro:history-updated'));
          if (onUpdateSuccess) onUpdateSuccess();
        } else {
          toast.error('Gagal memperbarui');
        }
      } else {
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
          const savedData = await res.json();

          // If this is an invoice with DP, also create an invoice-pelunasan entry
          if (docType === 'invoice' && (data.dp || 0) > 0) {
            try {
              const invData = currentData as unknown as InvoiceData;
              const subtotal = invData.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
              const ppnAmount = subtotal * (invData.ppn / 100);
              const total = subtotal + ppnAmount;
              const dpAmount = total * (invData.dp / 100);

              // Derive PEL nomor from INV nomor (same number, different prefix)
              const invNomor = savedData.nomor || data.nomor;
              const pelNomor = invNomor.replace(/^INV/, 'PEL');

              const pelunasanData: Record<string, unknown> = {
                ...dataToSave,
                type: 'invoice-pelunasan',
                referensiInvoiceId: savedData.id,
                referensiInvoiceNomor: invNomor,
                dpAmount,
                originalTotal: total,
                lunas: false,
                tanggalPelunasan: '',
                // Pelunasan invoice keeps same items, same dp — but its preview will show PELUNASAN label
              };

              await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                  docType: 'invoice-pelunasan',
                  customNomor: pelNomor,
                  tanggal: data.tanggal || '',
                  pihakKedua,
                  total: '-',
                  dataJson: JSON.stringify(pelunasanData),
                }),
              });
            } catch {
              // Pelunasan creation failed — not critical, the DP invoice is already saved
              console.error('Failed to create pelunasan invoice entry');
            }
          }

          toast.success(`${documentLabel} berhasil disimpan — dokumen direset`);
          window.dispatchEvent(new CustomEvent('dokupro:history-updated'));
          onReset();
        } else if (res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          toast('Data tidak berubah, riwayat tidak duplikat.', { description: 'Ubah minimal 1 data untuk menyimpan riwayat baru.' });
        } else {
          toast.error('Gagal menyimpan');
        }
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

  const handleJpgWhatsApp = async () => {
    setGeneratingPdf(true);
    try {
      const nomor = (currentData as { nomor?: string }).nomor || 'draft';
      const fileName = `${nomor.replace(/\//g, '-')}.jpg`;
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement;
      if (!previewEl) {
        toast.error('Pratinjau tidak ditemukan');
        return;
      }

      // Use robust capture utility (waits for fonts/images, inlines images, cacheBust)
      const blob = await captureElementAsJpg(previewEl);

      if (!blob || !(blob instanceof Blob)) {
        toast.error('Gagal membuat JPG - blob tidak valid');
        return;
      }

      // Extract the contact phone from the document data (client/penerima/pemasok)
      const d = currentData as {
        client?: { kontak?: string };
        penerima?: { kontak?: string };
        pemasok?: { kontak?: string };
      };
      const phone = d.client?.kontak || d.penerima?.kontak || d.pemasok?.kontak || '';

      // No-API sharing: Web Share API first (auto-attaches file),
      // then fallback to download + WhatsApp Web.
      const result = await shareJpgToWhatsApp({
        blob,
        fileName,
        documentLabel,
        phone,
      });

      if (result.status === 'shared') {
        toast.success(`${documentLabel} dibagikan ke WhatsApp`);
      } else if (result.status === 'cancelled') {
        // User cancelled — silent
      } else if (result.status === 'downloaded') {
        toast.success('JPG diunduh. Lampirkan file ke WhatsApp manual.', {
          description: 'WhatsApp Web telah dibuka dengan pesan siap dikirim.',
        });
      } else {
        toast.error(result.error || 'Gagal membagikan JPG');
      }
    } catch (err) {
      console.error('JPG generation error:', err);
      toast.error('Gagal membuat JPG. Coba lagi atau gunakan Cetak.');
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
          onClick={handleJpgWhatsApp}
          disabled={generatingPdf || dataEmpty}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generatingPdf ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              JPG...
            </>
          ) : (
            <>
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              JPG
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
              {saving ? (editingId ? 'Memperbarui...' : 'Menyimpan...') : (editingId ? 'Update' : 'Simpan')}
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
                {editingId
                  ? 'Harap di cek!! Pastikan semua data yang Anda masukkan sudah benar sebelum memperbarui riwayat.'
                  : 'Harap di cek!! Pastikan semua data yang Anda masukkan sudah benar sebelum menyimpan ke riwayat.'
                }
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
                {editingId ? 'Ya, Update' : 'Ya, Simpan'}
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
          onClick={handleJpgWhatsApp}
          disabled={generatingPdf || dataEmpty}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 h-9"
        >
          {generatingPdf ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              JPG...
            </>
          ) : (
            <>
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              JPG
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
              {saving ? (editingId ? 'Memperbarui...' : 'Menyimpan...') : (editingId ? 'Update' : 'Simpan')}
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
                {editingId
                  ? 'Harap di cek!! Pastikan semua data yang Anda masukkan sudah benar sebelum memperbarui riwayat.'
                  : 'Harap di cek!! Pastikan semua data yang Anda masukkan sudah benar sebelum menyimpan ke riwayat.'
                }
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
                {editingId ? 'Ya, Update' : 'Ya, Simpan'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

    </div>
  );
}
