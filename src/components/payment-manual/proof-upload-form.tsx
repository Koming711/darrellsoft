'use client';

// Formulir konfirmasi pembayaran manual — upload bukti transfer.
// Dipakai di checkout (SUDAH BAYAR) dan di riwayat-langganan (unggah ulang setelah ditolak).

import { useState, useRef } from 'react';
import { Loader2, Upload, Send, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const MAX_PROOF_MB = 2;
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export function formatRupiahClient(value: number): string {
  return 'Rp ' + Math.round(value).toLocaleString('id-ID');
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'UNPAID': return 'Menunggu Pembayaran';
    case 'WAITING_VERIFICATION': return 'Menunggu Verifikasi';
    case 'PAID': return 'Disetujui (Lunas)';
    case 'REJECTED': return 'Ditolak';
    case 'EXPIRED': return 'Kedaluwarsa';
    case 'CANCELLED': return 'Dibatalkan';
    default: return status;
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'UNPAID': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'WAITING_VERIFICATION': return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'PAID': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'REJECTED': return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'EXPIRED': return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    case 'CANCELLED': return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    default: return 'bg-white/10 text-gray-300 border-white/20';
  }
}

interface ProofUploadFormProps {
  transactionNumber: string;
  totalAmount: number;
  defaultSenderName?: string;
  onSubmitted?: (message: string) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export function ProofUploadForm({
  transactionNumber,
  totalAmount,
  defaultSenderName = '',
  onSubmitted,
  onCancel,
  compact = false,
}: ProofUploadFormProps) {
  const [senderName, setSenderName] = useState(defaultSenderName);
  const [senderBank, setSenderBank] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferAmount, setTransferAmount] = useState<string>(String(totalAmount));
  const [customerNote, setCustomerNote] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    setError('');
    if (!f) { setProof(null); return; }
    if (!ALLOWED.includes(f.type)) {
      setError('Format file harus JPG, JPEG, PNG, atau PDF');
      return;
    }
    if (f.size > MAX_PROOF_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_PROOF_MB}MB`);
      return;
    }
    setProof(f);
  };

  const handleSubmit = async () => {
    setError('');
    if (!senderName.trim()) { setError('Nama pengirim wajib diisi'); return; }
    if (!senderBank.trim()) { setError('Bank asal wajib diisi'); return; }
    if (!transferAmount || Number(transferAmount) <= 0) { setError('Nominal transfer tidak valid'); return; }
    if (Math.abs(Number(transferAmount) - totalAmount) > 1) {
      setError(`Nominal transfer harus sama dengan total pembayaran (${formatRupiahClient(totalAmount)})`);
      return;
    }
    if (!proof) { setError('Bukti transfer wajib diunggah'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('transactionNumber', transactionNumber);
      fd.append('senderName', senderName.trim());
      fd.append('senderBank', senderBank.trim());
      fd.append('transferAmount', String(Number(transferAmount)));
      fd.append('transferDate', transferDate);
      fd.append('customerNote', customerNote.trim());
      fd.append('proof', proof);

      const res = await fetch('/api/payment-manual/confirm', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengirim konfirmasi');
        return;
      }
      setSuccess(data.message || 'Bukti pembayaran berhasil dikirim. Pembayaran Anda sedang diperiksa oleh admin Darrellsoft.');
      onSubmitted?.(data.message || 'Bukti pembayaran berhasil dikirim.');
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <p className="text-emerald-300 font-semibold text-sm leading-relaxed">{success}</p>
        <p className="text-gray-400 text-xs mt-2">Status pembayaran: <span className="font-bold text-sky-300">MENUNGGU VERIFIKASI</span></p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        <div>
          <Label className="text-xs font-semibold text-gray-300 mb-1 block">Nomor Transaksi</Label>
          <Input readOnly value={transactionNumber} className="h-10 bg-[#141414] border-white/10 text-gray-400 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-300 mb-1 block">Nama Pengirim *</Label>
          <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sesuai nama rekening pengirim"
            className="h-10 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914]" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-300 mb-1 block">Bank Asal *</Label>
          <Input value={senderBank} onChange={(e) => setSenderBank(e.target.value)} placeholder="Contoh: BCA, Mandiri, BRI"
            className="h-10 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914]" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-300 mb-1 block">Tanggal Transfer *</Label>
          <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)}
            className="h-10 bg-[#141414] border-white/10 text-white focus:border-[#e50914]" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-300 mb-1 block">
            Nominal Transfer * <span className="text-gray-500 font-normal">(harus {formatRupiahClient(totalAmount)})</span>
          </Label>
          <Input type="number" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} min={0}
            className="h-10 bg-[#141414] border-white/10 text-white focus:border-[#e50914]" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-300 mb-1 block">
            Upload Bukti Transfer * <span className="text-gray-500 font-normal">(JPG/PNG/PDF, maks {MAX_PROOF_MB}MB)</span>
          </Label>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-10 rounded-md border border-dashed border-white/20 bg-[#141414] hover:border-[#e50914]/60 text-xs text-gray-300 flex items-center justify-center gap-2 transition-colors"
          >
            {proof ? (
              <>
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate max-w-[180px]">{proof.name}</span>
              </>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Pilih file bukti</>
            )}
          </button>
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold text-gray-300 mb-1 block">Catatan Tambahan</Label>
        <Input value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder="Opsional"
          className="h-10 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914]" />
      </div>

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}
            className="flex-1 bg-[#2a2a2a] border-white/10 text-gray-300 hover:bg-[#3a3a3a] hover:text-white font-semibold rounded-xl">
            Batal
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={loading}
          className={`${onCancel ? 'flex-[2]' : 'w-full'} py-3 bg-[#e50914] hover:bg-[#f40612] text-white font-bold rounded-xl transition-all`}>
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengirim...</>
          ) : (
            <><Send className="w-4 h-4 mr-2" /> KIRIM KONFIRMASI</>
          )}
        </Button>
      </div>
    </div>
  );
}
