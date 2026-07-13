'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, Loader2, Phone, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBlob: Blob | null;
  fileName: string;
  documentLabel: string;
}

export function WhatsAppSendDialog({
  open,
  onOpenChange,
  pdfBlob,
  fileName,
  documentLabel,
}: WhatsAppSendDialogProps) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = useCallback(async () => {
    if (!pdfBlob || !phone.trim()) return;

    setSending(true);
    setResult(null);

    try {
      // Convert blob to base64
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      const response = await fetch('/api/whatsapp/send-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          pdfBase64: base64,
          fileName,
          documentLabel,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({ success: true, message: `${documentLabel} berhasil dikirim ke WhatsApp!` });
      } else {
        setResult({
          success: false,
          message: data.error || 'Gagal mengirim dokumen ke WhatsApp.',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Terjadi kesalahan koneksi. Coba lagi.',
      });
    } finally {
      setSending(false);
    }
  }, [pdfBlob, phone, fileName, documentLabel]);

  const handleClose = useCallback(() => {
    if (!sending) {
      setResult(null);
      setPhone('');
      onOpenChange(false);
    }
  }, [sending, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <DialogTitle>Kirim ke WhatsApp</DialogTitle>
              <DialogDescription>
                Kirim {documentLabel} langsung ke nomor WhatsApp
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {result?.success ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700">{result.message}</p>
          </div>
        ) : (
          <>
            {/* File preview */}
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <FileText className="h-8 w-8 text-red-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-black truncate">{fileName}</p>
                <p className="text-xs text-gray-500">
                  {pdfBlob ? `${(pdfBlob.size / 1024).toFixed(1)} KB` : '—'}
                </p>
              </div>
            </div>

            {/* Phone number input */}
            <div className="space-y-2">
              <Label htmlFor="wa-phone" className="text-sm font-medium">
                Nomor WhatsApp
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 bg-gray-100 rounded-md px-2.5 py-2 border">
                  +62
                </span>
                <Input
                  id="wa-phone"
                  type="tel"
                  placeholder="8123456789"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/[^\d]/g, ''));
                    setResult(null);
                  }}
                  className="flex-1"
                  disabled={sending}
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500">
                Contoh: 81234567890 (tanpa 0 di depan)
              </p>
            </div>

            {/* Error message */}
            {result && !result.success && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{result.message}</p>
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {result?.success ? (
            <Button onClick={handleClose} className="w-full bg-green-600 hover:bg-green-700">
              Selesai
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={sending}
                className="flex-1"
              >
                Batal
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !phone.trim() || phone.length < 8}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" />
                    Kirim
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
