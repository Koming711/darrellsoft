'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  Check,
  CreditCard,
  Building2,
  Wallet,
  Shield,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  Smartphone,
} from 'lucide-react';

interface PackageInfo {
  type: string;
  name: string;
  price: number;
  priceFormatted: string;
  period: string;
}

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  pkg: PackageInfo;
  customerData?: { name: string; email: string; phone: string };
  onSuccess?: () => void;
}

function formatRupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

type DialogStep = 'method' | 'paying' | 'result';
type PaymentResult = 'success' | 'pending' | 'error' | null;

const PAYMENT_METHODS = [
  // Transfer Bank
  { id: 'bca_va', label: 'Transfer BCA', sublabel: 'Transfer via ATM / M-Banking BCA', icon: '🏦', category: 'transfer', popular: true },
  { id: 'bni_va', label: 'Transfer BNI', sublabel: 'Transfer via ATM / M-Banking BNI', icon: '🏦', category: 'transfer', popular: false },
  { id: 'mandiri_va', label: 'Transfer Mandiri', sublabel: 'Transfer via ATM / M-Banking Mandiri', icon: '🏦', category: 'transfer', popular: false },
  { id: 'bri_va', label: 'Transfer BRI', sublabel: 'Transfer via ATM / M-Banking BRI', icon: '🏦', category: 'transfer', popular: false },
  // Virtual Account
  { id: 'permata_va', label: 'Virtual Account Permata', sublabel: 'Bayar via VA Bank Permata', icon: '🏦', category: 'va', popular: false },
  { id: 'bsi_va', label: 'Virtual Account BSI', sublabel: 'Bayar via VA Bank BSI', icon: '🏦', category: 'va', popular: false },
  // E-Money
  { id: 'gopay', label: 'GoPay', sublabel: 'Bayar via aplikasi Gojek', icon: '💳', category: 'emoney', popular: true },
  { id: 'shopeepay', label: 'ShopeePay', sublabel: 'Bayar via aplikasi Shopee', icon: '🛒', category: 'emoney', popular: false },
  { id: 'dana', label: 'DANA', sublabel: 'Bayar via aplikasi Dana', icon: '💳', category: 'emoney', popular: false },
  // Debit
  { id: 'debit', label: 'Kartu Debit', sublabel: 'Visa, Mastercard debit online', icon: '💳', category: 'debit', popular: false },
  // Kredit
  { id: 'cc', label: 'Kartu Kredit', sublabel: 'Visa, Mastercard, JCB, AMEX', icon: '💳', category: 'kredit', popular: true },
  // QRIS
  { id: 'qris', label: 'QRIS', sublabel: 'Scan QR dari aplikasi bank manapun', icon: '📱', category: 'qris', popular: true },
];

const CATEGORIES = [
  { id: 'transfer', label: 'Transfer Bank', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'va', label: 'Virtual Account', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'emoney', label: 'E-Money', icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'debit', label: 'Debit', icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: 'kredit', label: 'Kredit', icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: 'qris', label: 'QRIS', icon: <Smartphone className="w-3.5 h-3.5" /> },
];

/* ─── komponen utama ─── */
export default function PaymentDialog({ open, onClose, pkg, customerData, onSuccess }: PaymentDialogProps) {
  const [step, setStep] = useState<DialogStep>('method');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaymentResult>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [snapToken, setSnapToken] = useState('');
  const [isMockMode, setIsMockMode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Reset saat popup dibuka
  useEffect(() => {
    if (open) {
      setStep('method');
      setSelectedMethod('');
      setLoading(false);
      setResult(null);
      setResultMessage('');
      setOrderId('');
      setSnapToken('');
      setIsMockMode(false);
      setCountdown(0);
    }
  }, [open]);

  // Countdown timer untuk mock mode
  useEffect(() => {
    if (!isMockMode || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [isMockMode, countdown]);

  // Handle callback dari Midtrans Snap setelah redirect kembali
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const savedOrderId = sessionStorage.getItem('lastPaymentOrderId');
    if (paymentStatus && savedOrderId) {
      if (paymentStatus === 'finish') {
        checkPaymentResult(savedOrderId);
      } else if (paymentStatus === 'pending') {
        setStep('result'); setResult('pending');
        setResultMessage('Menunggu pembayaran Anda. Silakan selesaikan pembayaran untuk mengaktifkan langganan.');
      } else if (paymentStatus === 'error') {
        setStep('result'); setResult('error');
        setResultMessage('Pembayaran dibatalkan atau gagal. Silakan coba lagi.');
      }
      window.history.replaceState({}, '', window.location.pathname);
      sessionStorage.removeItem('lastPaymentOrderId');
    }
  }, [open]);

  const handlePay = useCallback(async () => {
    if (!selectedMethod) return;

    const name = customerData?.name || '';
    const email = customerData?.email || '';
    const phone = customerData?.phone || '';

    setLoading(true);
    setResultMessage('');
    try {
      // Buat transaksi ke Midtrans via API kita
      const res = await fetch('/api/midtrans/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageName: pkg.name,
          packageType: pkg.type,
          price: pkg.price,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Gagal membuat transaksi');

      setOrderId(data.orderId);
      setSnapToken(data.token);
      sessionStorage.setItem('lastPaymentOrderId', data.orderId);

      // ─── MOCK MODE: simulasi pembayaran ───
      if (data.mock) {
        setIsMockMode(true);
        setStep('paying');
        setCountdown(3);
        // Simulasi delay 3 detik lalu auto success
        setTimeout(() => {
          setStep('result');
          setResult('success');
          setResultMessage('Pembayaran berhasil! Langganan Anda telah aktif. (Mode Testing/Sandbox)');
          setLoading(false);
        }, 3000);
        return;
      }

      // ─── REAL MODE: panggil Midtrans Snap ───
      setStep('paying');

      // Load Midtrans Snap script dinamis
      await new Promise<void>((resolve, reject) => {
        const win = window as unknown as Record<string, unknown>;
        if (win.snap) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
        script.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '');
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Gagal memuat payment gateway'));
        document.body.appendChild(script);
      });

      // Buka Midtrans Snap popup
      const snap = (window as unknown as Record<string, Record<string, (token: string, callbacks?: Record<string, () => void>) => void>>).snap;
      if (snap && snap.pay) {
        snap.pay(data.token, {
          onSuccess: () => {
            setStep('result'); setResult('success');
            setResultMessage('Pembayaran berhasil! Langganan Anda telah aktif.');
            setLoading(false);
          },
          onPending: () => {
            setStep('result'); setResult('pending');
            setResultMessage('Menunggu pembayaran Anda. Silakan selesaikan pembayaran untuk mengaktifkan langganan.');
            setLoading(false);
          },
          onError: () => {
            setStep('result'); setResult('error');
            setResultMessage('Pembayaran gagal. Silakan coba lagi dengan metode pembayaran lain.');
            setLoading(false);
          },
          onClose: () => {
            setStep('method');
            setLoading(false);
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setResultMessage(message);
      setStep('result');
      setResult('error');
      setLoading(false);
    }
  }, [selectedMethod, pkg, customerData]);

  const checkPaymentResult = async (oid: string) => {
    try {
      const res = await fetch(`/api/midtrans/check-status?order_id=${oid}`);
      const data = await res.json();
      if (data.success) {
        const s = data.data.transactionStatus;
        if (s === 'success') {
          setStep('result'); setResult('success');
          setResultMessage('Pembayaran berhasil! Langganan Anda telah aktif.');
        } else if (s === 'pending') {
          setStep('result'); setResult('pending');
          setResultMessage('Menunggu pembayaran Anda.');
        } else {
          setStep('result'); setResult('error');
          setResultMessage('Pembayaran gagal atau expired.');
        }
      }
    } catch {
      setStep('result'); setResult('error');
      setResultMessage('Gagal mengecek status pembayaran.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            onClick={step === 'result' ? onClose : undefined}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg z-[101]"
          >
            <div className="bg-[#141414] rounded-2xl overflow-hidden shadow-2xl shadow-black/50 max-h-[90vh] flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <h2 className="text-white text-lg font-bold">Metode Pembayaran</h2>
                </div>
                {step !== 'paying' && (
                  <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <AnimatePresence mode="wait">

                  {/* STEP: Pilih Metode Pembayaran */}
                  {step === 'method' && (
                    <motion.div key="method" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                      <p className="text-gray-400 text-sm mb-5">Pilih metode pembayaran yang Anda inginkan</p>

                      {/* Total */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-red-500/5 border border-orange-500/20 mb-5">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Total Pembayaran</p>
                            <p className="text-xs text-gray-400 mt-0.5">{pkg.name} — {pkg.period}</p>
                          </div>
                          <span className="text-xl font-black text-white">{pkg.priceFormatted}</span>
                        </div>
                      </div>

                      {/* Transfer Bank */}
                      {CATEGORIES.map(cat => {
                        const methods = PAYMENT_METHODS.filter(m => m.category === cat.id);
                        if (methods.length === 0) return null;
                        return (
                          <div key={cat.id} className="mb-4">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                              {cat.icon} {cat.label}
                            </h4>
                            <div className="space-y-2">
                              {methods.map(m => (
                                <PaymentMethodCard
                                  key={m.id}
                                  method={m}
                                  selected={selectedMethod === m.id}
                                  onClick={() => setSelectedMethod(m.id)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}

                  {/* STEP: Paying */}
                  {step === 'paying' && (
                    <motion.div key="paying" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.25 }}
                      className="flex flex-col items-center justify-center py-12"
                    >
                      {isMockMode ? (
                        <>
                          <div className="w-20 h-20 rounded-full bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center mb-4">
                            <span className="text-3xl font-black text-orange-500">{countdown > 0 ? countdown : ''}</span>
                          </div>
                          <h3 className="text-white text-xl font-bold mb-2">Memproses Pembayaran</h3>
                          <p className="text-gray-400 text-sm text-center max-w-xs mb-3">
                            Simulasi pembayaran sedang berjalan...
                          </p>
                          <div className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                            <span className="text-[11px] text-amber-400 font-semibold">MODE TESTING</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-4 animate-pulse">
                            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                          </div>
                          <h3 className="text-white text-xl font-bold mb-2">Memproses Pembayaran</h3>
                          <p className="text-gray-400 text-sm text-center max-w-xs">
                            Jendela pembayaran Midtrans sedang terbuka. Silakan selesaikan pembayaran Anda di popup yang muncul.
                          </p>
                          <p className="text-gray-500 text-xs mt-4">Menutup popup akan kembali ke pilihan metode</p>
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* STEP: Result */}
                  {step === 'result' && (
                    <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.25 }}
                      className="flex flex-col items-center justify-center py-8"
                    >
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
                        className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 ${
                          result === 'success' ? 'bg-emerald-500/20' : result === 'pending' ? 'bg-amber-500/20' : 'bg-red-500/20'
                        }`}
                      >
                        {result === 'success' && <CheckCircle2 className="w-10 h-10 text-emerald-500" />}
                        {result === 'pending' && <Clock className="w-10 h-10 text-amber-500" />}
                        {result === 'error' && <XCircle className="w-10 h-10 text-red-500" />}
                      </motion.div>
                      <h3 className="text-white text-xl font-bold mb-2">
                        {result === 'success' && 'Pembayaran Berhasil!'}
                        {result === 'pending' && 'Menunggu Pembayaran'}
                        {result === 'error' && 'Pembayaran Gagal'}
                      </h3>
                      <p className="text-gray-400 text-sm text-center max-w-xs mb-2">{resultMessage}</p>
                      {result === 'pending' && (
                        <p className="text-gray-500 text-xs text-center max-w-xs mb-4">
                          Anda akan menerima konfirmasi setelah pembayaran berhasil diverifikasi. Ini mungkin memakan waktu beberapa menit.
                        </p>
                      )}
                      {orderId && (
                        <div className="w-full p-3 rounded-lg bg-white/5 border border-white/10 mb-4">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">ID Pesanan</span>
                          <p className="text-sm text-gray-300 font-mono mt-0.5">{orderId}</p>
                        </div>
                      )}
                      <div className="w-full p-3 rounded-lg bg-white/5 border border-white/10 mb-6">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-xs text-gray-500">Paket</p>
                            <p className="text-sm text-white font-medium">{pkg.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Jumlah</p>
                            <p className="text-sm text-white font-bold">{pkg.priceFormatted}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Footer */}
              {step !== 'paying' && (
                <div className="px-6 py-4 border-t border-white/10">
                  {step === 'result' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Pembayaran aman & terenkripsi via Midtrans</span>
                      </div>
                      <button onClick={() => onSuccess ? onSuccess() : onClose()} className="w-full py-3 rounded-xl bg-white text-[#141414] font-bold text-sm hover:bg-gray-200 transition-colors">
                        {result === 'success' ? 'Mulai Gunakan' : 'Tutup'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={handlePay}
                        disabled={!selectedMethod || loading}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                          selectedMethod && !loading
                            ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700 shadow-lg shadow-orange-500/20'
                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            Bayar dengan {selectedMethod ? PAYMENT_METHODS.find(m => m.id === selectedMethod)?.label : 'Pilih Metode'}
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      <div className="flex items-center justify-center gap-2 text-gray-500 text-[11px]">
                        <Shield className="w-3 h-3" />
                        <span>Diproses secara aman melalui Midtrans</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Sub-components ─── */

interface PaymentMethodItem {
  id: string; label: string; sublabel: string; icon: string; category: string; popular: boolean;
}

function PaymentMethodCard({ method, selected, onClick }: { method: PaymentMethodItem; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left ${
        selected
          ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
          : 'border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20'
      }`}
    >
      <span className="text-2xl">{method.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200'}`}>{method.label}</span>
          {method.popular && (
            <span className="bg-orange-500/20 text-orange-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">Populer</span>
          )}
        </div>
        <span className="text-xs text-gray-500">{method.sublabel}</span>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
        selected ? 'border-orange-500 bg-orange-500' : 'border-gray-600'
      }`}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
    </motion.button>
  );
}
