'use client';

// Panel pembayaran manual di step "Konfirmasi & Bayar" checkout:
// ringkasan transaksi, metode (Transfer Bank / QRIS), info rekening dari
// pengaturan admin, petunjuk, tombol SUDAH BAYAR → form upload bukti.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Landmark, QrCode, Copy, Check, Clock, Hash, User, Mail, Package,
  CalendarClock, AlertCircle, CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProofUploadForm, formatRupiahClient, statusLabel, statusColor } from './proof-upload-form';

interface ManualTransaction {
  id: string;
  transactionNumber: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  durationMonths: number;
  amount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  expiresAt: string;
}

interface PaymentSettings {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrisProviderName: string;
  qrisImageUrl: string;
  paymentInstructions: string;
  paymentDeadlineHours: number;
  bankTransferEnabled: boolean;
  qrisEnabled: boolean;
}

export function ManualPaymentPanel({
  transaction,
  customerName = '',
  onPaidFlowDone,
}: {
  transaction: ManualTransaction;
  customerName?: string;
  onPaidFlowDone?: () => void;
}) {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [method, setMethod] = useState<'bank_transfer' | 'qris_manual'>('bank_transfer');
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/payment-manual/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSettings(data.settings);
          if (data.settings.qrisEnabled && !data.settings.bankTransferEnabled) setMethod('qris_manual');
        }
      })
      .catch(() => setError('Gagal memuat informasi rekening. Muat ulang halaman.'));
  }, []);

  const copyAccount = async () => {
    if (!settings?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(settings.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const deadline = transaction.expiresAt ? new Date(transaction.expiresAt) : null;

  return (
    <div className="space-y-4">
      {/* Status transaksi */}
      <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-[#e50914]" />
            <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Nomor Transaksi</span>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusColor(transaction.paymentStatus)}`}>
            {statusLabel(transaction.paymentStatus)}
          </span>
        </div>
        <p className="font-mono font-bold text-lg text-white tracking-wide">{transaction.transactionNumber}</p>
        <p className="text-gray-500 text-xs mt-1">
          Simpan nomor ini sebagai referensi pembayaran Anda.
        </p>
      </div>

      {/* Ringkasan tagihan */}
      <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5 space-y-2.5 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-[#e50914]" />
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Detail Pembayaran</span>
        </div>
        <div className="flex justify-between"><span className="text-gray-500">Nama Pelanggan</span><span className="text-white font-medium">{transaction.customerName}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Email Akun</span><span className="text-white font-medium break-all text-right">{transaction.customerEmail}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Paket</span><span className="text-white font-medium">{transaction.planName}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Durasi</span><span className="text-white font-medium">{transaction.durationMonths} bulan</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Harga Paket</span><span className="text-white">{formatRupiahClient(transaction.amount)}</span></div>
        {transaction.discountAmount > 0 && (
          <div className="flex justify-between"><span className="text-gray-500">Diskon</span><span className="text-emerald-400 font-medium">- {formatRupiahClient(transaction.discountAmount)}</span></div>
        )}
        <div className="border-t border-white/10 pt-2.5 flex justify-between items-center">
          <span className="text-gray-300 font-semibold">Total Pembayaran</span>
          <span className="text-xl font-extrabold text-[#e50914]">{formatRupiahClient(transaction.totalAmount)}</span>
        </div>
        {deadline && (
          <div className="flex justify-between pt-1">
            <span className="text-gray-500 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Batas Waktu</span>
            <span className="text-amber-400 font-medium text-xs">{deadline.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </div>

      {/* Pilih metode */}
      {settings && settings.bankTransferEnabled && settings.qrisEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMethod('bank_transfer')}
            className={`p-4 rounded-xl border text-left transition-all ${method === 'bank_transfer' ? 'bg-[#e50914]/10 border-[#e50914]/50' : 'bg-[#1f1f1f] border-white/10 hover:border-white/25'}`}
          >
            <Landmark className={`w-5 h-5 mb-1.5 ${method === 'bank_transfer' ? 'text-[#e50914]' : 'text-gray-500'}`} />
            <p className={`text-sm font-bold ${method === 'bank_transfer' ? 'text-white' : 'text-gray-400'}`}>Transfer Bank</p>
          </button>
          <button
            onClick={() => setMethod('qris_manual')}
            className={`p-4 rounded-xl border text-left transition-all ${method === 'qris_manual' ? 'bg-[#e50914]/10 border-[#e50914]/50' : 'bg-[#1f1f1f] border-white/10 hover:border-white/25'}`}
          >
            <QrCode className={`w-5 h-5 mb-1.5 ${method === 'qris_manual' ? 'text-[#e50914]' : 'text-gray-500'}`} />
            <p className={`text-sm font-bold ${method === 'qris_manual' ? 'text-white' : 'text-gray-400'}`}>QRIS Manual</p>
          </button>
        </div>
      )}

      {/* Info rekening / QRIS */}
      {settings && method === 'bank_transfer' && settings.bankTransferEnabled && (
        <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#e50914]" />
            <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Transfer Bank</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-500">Nama Bank</span><span className="text-white font-bold">{settings.bankName}</span>
            <span className="text-gray-500">Nomor Rekening</span>
            <span className="text-right">
              <span className="font-mono font-bold text-white text-base">{settings.accountNumber}</span>
              <button onClick={copyAccount} className="ml-2 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors align-middle">
                {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin</>}
              </button>
            </span>
            <span className="text-gray-500">Nama Pemilik</span><span className="text-white font-medium">{settings.accountName}</span>
            <span className="text-gray-500">Total Transfer</span><span className="text-[#e50914] font-extrabold">{formatRupiahClient(transaction.totalAmount)}</span>
            <span className="text-gray-500">Referensi</span><span className="text-gray-300 font-mono text-xs">{transaction.transactionNumber}</span>
          </div>
        </div>
      )}

      {settings && method === 'qris_manual' && settings.qrisEnabled && (
        <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5 space-y-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <QrCode className="w-4 h-4 text-[#e50914]" />
            <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{settings.qrisProviderName || 'QRIS'}</span>
          </div>
          {settings.qrisImageUrl ? (
            <img src={settings.qrisImageUrl} alt="QRIS" className="mx-auto max-w-[220px] rounded-xl border border-white/10 bg-white p-2" />
          ) : (
            <p className="text-gray-500 text-xs">Gambar QRIS belum diatur oleh admin.</p>
          )}
          <p className="text-white font-extrabold">{formatRupiahClient(transaction.totalAmount)}</p>
        </div>
      )}

      {/* Petunjuk */}
      {settings?.paymentInstructions && (
        <div className="bg-[#e50914]/10 border border-[#e50914]/25 rounded-xl p-4">
          <p className="text-xs text-gray-200 leading-relaxed">{settings.paymentInstructions}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* SUDAH BAYAR → form konfirmasi */}
      {!showConfirmForm ? (
        <Button
          onClick={() => setShowConfirmForm(true)}
          className="w-full py-4 bg-[#e50914] hover:bg-[#f40612] text-white font-bold text-base rounded-xl transition-all"
        >
          <Check className="w-5 h-5 mr-2" /> SUDAH BAYAR
        </Button>
      ) : (
        <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
          <h4 className="font-bold text-white mb-4 text-sm">Konfirmasi Pembayaran</h4>
          <ProofUploadForm
            transactionNumber={transaction.transactionNumber}
            totalAmount={transaction.totalAmount}
            defaultSenderName={customerName || transaction.customerName}
            onCancel={() => setShowConfirmForm(false)}
          />
        </div>
      )}

      {transaction.paymentStatus === 'WAITING_VERIFICATION' && !showConfirmForm && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4 text-center">
          <Clock className="w-8 h-8 text-sky-300 mx-auto mb-2" />
          <p className="text-sky-200 text-sm font-medium">Bukti pembayaran diterima — menunggu verifikasi admin Darrellsoft.</p>
          <Link href="/riwayat-langganan" className="inline-block mt-2 text-xs text-sky-300 underline hover:text-sky-200">
            Lihat Riwayat Pembayaran
          </Link>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-gray-600 text-[11px] pt-1">
        <User className="w-3 h-3" /> <Mail className="w-3 h-3" /> <Package className="w-3 h-3" />
        <span>Akun Anda diaktifkan otomatis setelah pembayaran diverifikasi admin.</span>
      </div>
    </div>
  );
}
