'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CreditCard,
  Lock,
  Shield,
  User,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Eye,
  EyeOff,
  AtSign,
  KeyRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ManualPaymentPanel } from '@/components/payment-manual/manual-payment-panel';
import { getAuthUser } from '@/lib/auth';

interface DbPlan {
  id: string;
  planName: string;
  price: number;
  discountPercent: number;
  durationMonths: number;
  maxAccounts: number;
  features: string; // JSON array string
  isActive: boolean;
  sortOrder: number;
}

interface ManualTx {
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

function formatRupiah(value: number): string {
  return 'Rp ' + Math.round(value).toLocaleString('id-ID');
}

const STEPS = ['Pilih Paket', 'Info Pembayaran', 'Konfirmasi & Bayar'];
const ADMIN_WHATSAPP = '6285888082208';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>(searchParams.get('plan') || '');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [isResume, setIsResume] = useState(false);
  const [manualTx, setManualTx] = useState<ManualTx | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Username-already-exists popup state
  const [usernameExistsOpen, setUsernameExistsOpen] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  const plan = plans.find((p) => p.id === selectedPlan) || null;

  // Muat paket dari database (dikelola admin via Pengaturan Paket) + resume dari WhatsApp link
  useEffect(() => {
    fetch('/api/payment-manual/plans')
      .then((r) => r.json())
      .then((data) => {
        const list: DbPlan[] = data.plans || [];
        setPlans(list);
        // Validasi preselect dari URL: hanya plan yang benar-benar ada yang dipakai
        const urlPlan = searchParams.get('plan') || '';
        if (urlPlan && !list.some((p) => p.id === urlPlan)) setSelectedPlan('');
      })
      .catch(() => {})
      .finally(() => {});

    // Deteksi pengguna login (perpanjangan paket — tanpa registrasi akun baru)
    try { setIsLoggedIn(!!getAuthUser()); } catch {}

    const resume = searchParams.get('resume');
    if (resume === '1') {
      try {
        const saved = localStorage.getItem('checkout_pending');
        if (saved) {
          const data = JSON.parse(saved);
          setSelectedPlan(data.plan || '');
          setCustomerName(data.name || '');
          setCustomerEmail(data.email || '');
          setCustomerPhone(data.phone || '');
          setUsername(data.username || '');
          setPassword(data.password || '');
          setConfirmPassword(data.password || '');
          setStep(2);
          setIsResume(true);
          setReady(true);
          return;
        }
      } catch {}
    }
    // Auto-fill dari auth (bukan resume)
    try {
      const auth = localStorage.getItem('auth');
      if (auth) {
        const parsed = JSON.parse(auth);
        if (parsed.name) setCustomerName(parsed.name || '');
      }
    } catch {}
    setReady(true);
  }, [searchParams]);

  const handleNext = async () => {
    setError('');
    if (step === 0 && !selectedPlan) {
      setError('Silakan pilih paket terlebih dahulu');
      return;
    }
    if (step === 1) {
      if (!customerName.trim()) { setError('Nama harus diisi'); return; }
      if (!customerEmail.trim()) { setError('Email harus diisi'); return; }
      if (!customerPhone.trim()) { setError('Nomor HP harus diisi'); return; }
      // Pelanggan yang sudah login (perpanjangan) tidak perlu buat username/password
      if (!isLoggedIn) {
        if (!username.trim()) { setError('Username harus diisi'); return; }
        if (username.trim().length < 3) { setError('Username minimal 3 karakter'); return; }
        if (!password) { setError('Password harus diisi'); return; }
        if (password.length < 6) { setError('Password minimal 6 karakter'); return; }
        if (password !== confirmPassword) { setError('Konfirmasi password tidak cocok'); return; }
      }

      // Cek ketersediaan username ke backend sebelum lanjut ke pembayaran
      // (hanya untuk registrasi baru — pengguna login tidak perlu).
      // Jika sudah dipakai → tampilkan popup (sama seperti halaman daftar akun).
      if (!isLoggedIn) {
        setLoading(true);
        try {
          const checkRes = await fetch(`/api/check-username?username=${encodeURIComponent(username.trim())}`);
          const checkData = await checkRes.json();
          if (!checkData.available) {
            setLoading(false);
            setUsernameExistsOpen(true);
            return;
          }
        } catch {
          // Jika cek gagal (mis. network error), jangan blok — biarkan backend
          // create-transaction yang menangani saat pembayaran (defense in depth).
        }
        setLoading(false);
      }

      // Simpan data ke localStorage untuk resume nanti
      const checkoutData = {
        plan: selectedPlan,
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        username: username.trim(),
        password: password,
      };
      localStorage.setItem('checkout_pending', JSON.stringify(checkoutData));
    }
    setStep(s => Math.min(s + 1, 2));
  };

  const handleBack = () => {
    setError('');
    setStep(s => Math.max(s - 1, 0));
  };

  // Buat transaksi pembayaran manual (status awal UNPAID). Akun baru diaktifkan
  // SETELAH admin menyetujui pembayaran — bukan saat tombol ini ditekan.
  const handlePay = useCallback(async () => {
    if (!plan) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/payment-manual/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          ...(isLoggedIn ? {} : { username: username.trim(), password: password }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setUsernameExistsOpen(true);
          setStep(1);
          return;
        }
        setError(data.error || 'Gagal membuat transaksi');
        return;
      }
      setManualTx(data.transaction);
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [plan, customerName, customerEmail, customerPhone, username, password]);

  return (
    <div className="dark-surface min-h-screen bg-[#141414] text-white flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[#141414]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => isResume ? router.push('/') : (step === 0 ? router.push('/') : handleBack())} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Kembali' : 'Kembali'}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#e50914] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">www.darrellsoft.com</span>
          </div>
          <div className="w-20" />
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-4 py-8 md:py-12">
        {!ready ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#e50914] animate-spin" />
          </div>
        ) : (
        <div className="w-full max-w-2xl">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-10">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                  i === step
                    ? 'bg-[#e50914] text-white'
                    : i < step
                      ? 'bg-[#46d369]/20 text-[#46d369]'
                      : 'bg-white/5 text-gray-600'
                }`}>
                  {(i < step || (isResume && i < 2)) ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                  )}
                  <span className="hidden sm:inline">{s}</span>
                </div>
                {i < 2 && (
                  <div className={`w-8 h-px ${(i < step || (isResume && i < 2)) ? 'bg-[#46d369]/40' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* STEP 0: Choose Plan */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl md:text-3xl font-extrabold text-center mb-2">
                  Pilih Paket yang Tepat
                </h2>
                <p className="text-gray-500 text-center text-sm mb-8">
                  Bisa upgrade atau downgrade kapan saja
                </p>

                <div className="space-y-4">
                  {plans.map((p) => (
                    <motion.button
                      key={p.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPlan(p.id)}
                      className={`w-full flex items-center justify-between p-5 rounded-xl border transition-all duration-200 text-left ${
                        selectedPlan === p.id
                          ? 'bg-[#e50914]/10 border-[#e50914]/50 shadow-lg shadow-red-900/10'
                          : 'bg-[#1f1f1f] border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedPlan === p.id ? 'border-[#e50914] bg-[#e50914]' : 'border-gray-600'
                        }`}>
                          {selectedPlan === p.id && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base">{p.planName}</span>
                            {p.discountPercent > 0 && (
                              <span className="text-[10px] bg-[#e50914] text-white px-1.5 py-0.5 rounded font-bold">HEMAT {p.discountPercent}%</span>
                            )}
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">Langganan {p.durationMonths} bulan — {p.maxAccounts} akun</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-lg">
                          {formatRupiah(p.price - Math.round(p.price * (p.discountPercent || 0) / 100))}
                        </span>
                        {p.discountPercent > 0 && (
                          <p className="text-gray-600 text-[11px] line-through">{formatRupiah(p.price)}</p>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-4">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleNext}
                  className="w-full mt-8 py-3.5 bg-[#e50914] hover:bg-[#f40612] text-white font-bold text-base rounded-xl transition-all duration-300"
                >
                  Lanjutkan <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </motion.div>
            )}

            {/* STEP 1: Payment Info */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl md:text-3xl font-extrabold text-center mb-2">
                  Buat Akun & Info Pembayaran
                </h2>
                <p className="text-gray-500 text-center text-sm mb-8">
                  Buat akun login Anda dan isi data untuk proses pembayaran
                </p>

                {/* Order Summary */}
                {plan && (
                  <div className="bg-[#1f1f1f] border border-white/5 rounded-xl p-5 mb-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#e50914]/20 flex items-center justify-center">
                          <CreditCard className="w-5 h-5 text-[#e50914]" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{plan.planName} — Langganan {plan.durationMonths} bulan</p>
                          <p className="text-gray-500 text-xs">{plan.maxAccounts} akun pengguna</p>
                        </div>
                      </div>
                      <span className="font-extrabold text-lg">{formatRupiah(plan.price)}</span>
                    </div>
                  </div>
                )}

                {/* Form */}
                <div className="space-y-4">
                  {/* Akun Login Section — hanya untuk registrasi baru (belum login) */}
                  {!isLoggedIn && (
                  <div className="bg-[#1f1f1f] border border-white/5 rounded-xl p-4 mb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound className="w-4 h-4 text-[#e50914]" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Akun Login</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-semibold text-gray-300 mb-1.5 block">
                          <AtSign className="w-3.5 h-3.5 inline mr-1.5" />Username
                        </Label>
                        <Input
                          ref={usernameRef}
                          type="text"
                          placeholder="Masukkan username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="h-11 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914] focus:ring-[#e50914]/20"
                        />
                        <p className="text-gray-600 text-xs mt-1">Minimal 3 karakter, untuk login ke dashboard</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-300 mb-1.5 block">
                          <Lock className="w-3.5 h-3.5 inline mr-1.5" />Password
                        </Label>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Masukkan password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="h-11 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914] focus:ring-[#e50914]/20 pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-0.5"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-gray-600 text-xs mt-1">Minimal 6 karakter</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-300 mb-1.5 block">
                          <Lock className="w-3.5 h-3.5 inline mr-1.5" />Konfirmasi Password
                        </Label>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Ulangi password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={`h-11 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914] focus:ring-[#e50914]/20 pr-11 ${
                              confirmPassword && confirmPassword !== password ? 'border-red-500/50' : confirmPassword && confirmPassword === password ? 'border-[#46d369]/50' : ''
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-0.5"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {confirmPassword && confirmPassword !== password && (
                          <p className="text-red-400 text-xs mt-1">Password tidak cocok</p>
                        )}
                        {confirmPassword && confirmPassword === password && (
                          <p className="text-[#46d369] text-xs mt-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Password cocok
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Data Pembayaran Section */}
                  <div className="bg-[#1f1f1f] border border-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard className="w-4 h-4 text-[#e50914]" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Data Pembayaran</span>
                    </div>
                    <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold text-gray-300 mb-1.5 block">
                      <User className="w-3.5 h-3.5 inline mr-1.5" />Nama Lengkap
                    </Label>
                    <Input
                      type="text"
                      placeholder="Masukkan nama lengkap"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="h-11 bg-[#1f1f1f] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914] focus:ring-[#e50914]/20"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-300 mb-1.5 block">
                      <Mail className="w-3.5 h-3.5 inline mr-1.5" />Email
                    </Label>
                    <Input
                      type="email"
                      placeholder="nama@email.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="h-11 bg-[#1f1f1f] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914] focus:ring-[#e50914]/20"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-300 mb-1.5 block">
                      <Phone className="w-3.5 h-3.5 inline mr-1.5" />Nomor HP
                    </Label>
                    <Input
                      type="tel"
                      placeholder="08xxxxxxxxxx"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="h-11 bg-[#141414] border-white/10 text-white placeholder:text-gray-600 focus:border-[#e50914] focus:ring-[#e50914]/20"
                    />
                  </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-4">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 mt-8">
                  <Button
                    onClick={handleBack}
                    variant="outline"
                    className="flex-1 py-3.5 bg-[#2a2a2a] border-white/10 text-gray-300 hover:bg-[#3a3a3a] hover:text-white font-semibold rounded-xl"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={loading}
                    className="flex-[2] py-3.5 bg-[#e50914] hover:bg-[#f40612] text-white font-bold text-base rounded-xl transition-all duration-300 disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengecek...</> : <>Lanjutkan <ChevronRight className="w-4 h-4 ml-1" /></>}
                  </Button>
                </div>

                {/* Note */}
                <div className="flex items-center justify-center gap-2 mt-6 text-gray-500 text-xs">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Data Anda aman dan terenkripsi.</span>
                </div>
              </motion.div>
            )}
            {/* STEP 2: Confirm & Pay */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
              >
                {manualTx ? (
                  <>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-center mb-2">
                      Selesaikan Pembayaran
                    </h2>
                    <p className="text-gray-500 text-center text-sm mb-8">
                      Transfer ke rekening di bawah, lalu unggah bukti pembayaran
                    </p>
                    <ManualPaymentPanel transaction={manualTx} customerName={customerName.trim()} />
                  </>
                ) : (
                <>
                <h2 className="text-2xl md:text-3xl font-extrabold text-center mb-2">
                  Konfirmasi & Bayar
                </h2>
                <p className="text-gray-500 text-center text-sm mb-8">
                  Periksa kembali data Anda sebelum membayar
                </p>

                {/* Order Summary */}
                {plan && (
                  <div className="bg-[#1f1f1f] border border-white/5 rounded-xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Paket</span>
                      <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#e50914]/20 flex items-center justify-center">
                          <Zap className="w-5 h-5 text-[#e50914]" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{plan.planName} — Langganan {plan.durationMonths} bulan</p>
                          <p className="text-gray-500 text-xs">{plan.maxAccounts} akun pengguna</p>
                        </div>
                      </div>
                      <span className="font-extrabold text-lg">{formatRupiah(plan.price)}</span>
                    </div>
                  </div>
                )}

                {/* Data Summary */}
                <div className="bg-[#1f1f1f] border border-white/5 rounded-xl p-5 mb-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-[#e50914]" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Detail Akun</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {!isLoggedIn && (
                      <>
                        <span className="text-gray-500">Username</span>
                        <span className="text-right font-medium">{username}</span>
                      </>
                    )}
                    <span className="text-gray-500">Nama</span>
                    <span className="text-right font-medium">{customerName}</span>
                    <span className="text-gray-500">Email</span>
                    <span className="text-right font-medium">{customerEmail}</span>
                    <span className="text-gray-500">No. HP</span>
                    <span className="text-right font-medium">{customerPhone}</span>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 mt-8">
                  {!isResume && (
                  <Button
                    onClick={handleBack}
                    variant="outline"
                    className="flex-1 py-3.5 bg-[#2a2a2a] border-white/10 text-gray-300 hover:bg-[#3a3a3a] hover:text-white font-semibold rounded-xl"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
                  </Button>
                  )}
                  <Button
                    onClick={handlePay}
                    disabled={loading}
                    className={`${isResume ? 'w-full' : 'flex-[2]'} py-3.5 bg-[#e50914] hover:bg-[#f40612] text-white font-bold text-base rounded-xl transition-all duration-300`}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</>
                    ) : (
                      <><Lock className="w-4 h-4 mr-2" /> Bayar Sekarang</>
                    )}
                  </Button>
                </div>

                {/* Security note */}
                <div className="flex items-center justify-center gap-2 mt-6 text-gray-500 text-xs">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Pembayaran aman & terenkripsi. Berbagai metode pembayaran tersedia.</span>
                </div>
                </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}
      </div>

      {/* ===== USERNAME ALREADY EXISTS POPUP DIALOG ===== */}
      {usernameExistsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-[#1f1f1f] rounded-2xl shadow-2xl border border-red-500/30 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">Nama Username Sudah Ada</h3>
              </div>
              <button
                onClick={() => { setUsernameExistsOpen(false); usernameRef.current?.focus(); }}
                className="text-gray-500 hover:text-white transition-colors -mt-1 -mr-1 p-1"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 mb-5">
              <p className="text-sm text-gray-200 leading-relaxed">Nama Username sudah ada. silahkan gunakan username lain.</p>
            </div>
            <button
              onClick={() => { setUsernameExistsOpen(false); usernameRef.current?.focus(); usernameRef.current?.select(); }}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
              autoFocus
            >
              Ok
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="dark-surface min-h-screen bg-[#141414] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#e50914] animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
