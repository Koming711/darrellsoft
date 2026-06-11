'use client';

import { useState, useCallback, Suspense } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PaymentDialog from '@/components/payment-dialog';

const PLANS: Record<string, {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  priceFormatted: string;
  period: string;
  features: string[];
  maxAccounts: number;
}> = {
  'bulanan-ekonomis': {
    id: 'bulanan-ekonomis',
    name: 'Ekonomis',
    subtitle: 'Bulanan Ekonomis',
    price: 78000,
    priceFormatted: 'Rp 78.000',
    period: '/bulan (1 akun)',
    features: ['Hitung ongkos cetak', 'Master harga kertas', 'Hitung finishing', 'Potong kertas', '1 akun pengguna'],
    maxAccounts: 1,
  },
  bulanan: {
    id: 'bulanan',
    name: 'Basic',
    subtitle: 'Langganan Bulanan',
    price: 128000,
    priceFormatted: 'Rp 128.000',
    period: '/bulan (2 akun)',
    features: ['Hitung ongkos cetak', 'Master harga kertas', 'Hitung finishing', 'Potong kertas', 'Riwayat cetakan', '2 akun (1 Owner + 1 User) dalam 1 grup'],
    maxAccounts: 2,
  },
  tahunan: {
    id: 'tahunan',
    name: 'Premium',
    subtitle: 'Langganan Tahunan',
    price: 888000,
    priceFormatted: 'Rp 888.000',
    period: '/tahun (hemat 42%)',
    features: ['Semua fitur Basic', 'Multi perangkat', 'Master customer', 'Export laporan', 'Priority support', '2 akun (1 Owner + 1 User) dalam 1 grup'],
    maxAccounts: 2,
  },
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime',
    subtitle: 'Sekali Bayar',
    price: 3888000,
    priceFormatted: 'Rp 3.888.000',
    period: 'sekali bayar',
    features: ['Semua fitur Premium', 'Update gratis selamanya', 'Unlimited pengguna', 'Custom branding', 'Dedicated support', '2 akun (1 Owner + 1 User) dalam 1 grup'],
    maxAccounts: 2,
  },
};

const STEPS = ['Pilih Paket', 'Info Pembayaran', 'Konfirmasi & Bayar'];
const ADMIN_WHATSAPP = '6285888082208';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Lazy initialization from localStorage (avoids setState in effect)
  const [initialData] = useState(() => {
    if (typeof window === 'undefined') return { plan: searchParams.get('plan') || '', isResume: false, name: '', email: '', phone: '', username: '', password: '' };
    const resume = searchParams.get('resume');
    if (resume === '1') {
      try {
        const saved = localStorage.getItem('checkout_pending');
        if (saved) {
          const data = JSON.parse(saved);
          return { plan: data.plan || '', isResume: true, name: data.name || '', email: data.email || '', phone: data.phone || '', username: data.username || '', password: data.password || '' };
        }
      } catch {}
    }
    // Auto-fill dari auth
    let name = '';
    try {
      const auth = localStorage.getItem('auth');
      if (auth) { const parsed = JSON.parse(auth); if (parsed.name) name = parsed.name; }
    } catch {}
    return { plan: searchParams.get('plan') || '', isResume: false, name, email: '', phone: '', username: '', password: '' };
  });

  const [step, setStep] = useState(initialData.isResume ? 2 : 0);
  const [selectedPlan, setSelectedPlan] = useState<string>(initialData.plan);
  const [customerName, setCustomerName] = useState(initialData.name);
  const [customerEmail, setCustomerEmail] = useState(initialData.email);
  const [customerPhone, setCustomerPhone] = useState(initialData.phone);
  const [username, setUsername] = useState(initialData.username);
  const [password, setPassword] = useState(initialData.password);
  const [confirmPassword, setConfirmPassword] = useState(initialData.password);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(true);
  const [isResume, setIsResume] = useState(initialData.isResume);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [autoLoggedIn, setAutoLoggedIn] = useState(false);

  const plan = PLANS[selectedPlan];

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
      if (!username.trim()) { setError('Username harus diisi'); return; }
      if (username.trim().length < 3) { setError('Username minimal 3 karakter'); return; }
      if (!password) { setError('Password harus diisi'); return; }
      if (password.length < 6) { setError('Password minimal 6 karakter'); return; }
      if (password !== confirmPassword) { setError('Konfirmasi password tidak cocok'); return; }
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

  const handlePay = useCallback(() => {
    // Just open the PaymentDialog - it handles transaction creation internally
    setShowPaymentPopup(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
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
                  {Object.entries(PLANS).map(([key, p]) => (
                    <motion.button
                      key={key}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPlan(key)}
                      className={`w-full flex items-center justify-between p-5 rounded-xl border transition-all duration-200 text-left ${
                        selectedPlan === key
                          ? 'bg-[#e50914]/10 border-[#e50914]/50 shadow-lg shadow-red-900/10'
                          : 'bg-[#1f1f1f] border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedPlan === key ? 'border-[#e50914] bg-[#e50914]' : 'border-gray-600'
                        }`}>
                          {selectedPlan === key && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base">{p.name}</span>
                            {key === 'tahunan' && (
                              <span className="text-[10px] bg-[#e50914] text-white px-1.5 py-0.5 rounded font-bold">HEMAT 42%</span>
                            )}
                            {p.maxAccounts >= 2 && (
                              <span className="text-[10px] bg-[#46d369]/20 text-[#46d369] px-1.5 py-0.5 rounded font-bold">{p.maxAccounts} AKUN</span>
                            )}
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">{p.subtitle} — {p.period}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-lg">{p.priceFormatted}</span>
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
                          <p className="font-bold text-sm">{plan.name} — {plan.subtitle}</p>
                          <p className="text-gray-500 text-xs">{plan.period}</p>
                        </div>
                      </div>
                      <span className="font-extrabold text-lg">{plan.priceFormatted}</span>
                    </div>
                  </div>
                )}

                {/* Form */}
                <div className="space-y-4">
                  {/* Akun Login Section */}
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
                      {/* Info for multi-account plans */}
                      {plan && plan.maxAccounts >= 2 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="p-3 rounded-lg bg-[#46d369]/10 border border-[#46d369]/20">
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-3.5 h-3.5 text-[#46d369]" />
                              <span className="text-xs font-semibold text-[#46d369]">Paket {plan.maxAccounts} Akun</span>
                            </div>
                            <p className="text-[#46d369]/80 text-[11px]">Akun owner akan dibuat setelah pembayaran. Anda bisa menambahkan akun kedua nanti dari dashboard.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

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
                    className="flex-[2] py-3.5 bg-[#e50914] hover:bg-[#f40612] text-white font-bold text-base rounded-xl transition-all duration-300"
                  >
                    Lanjutkan <ChevronRight className="w-4 h-4 ml-1" />
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
                          <p className="font-bold text-sm">{plan.name} — {plan.subtitle}</p>
                          <p className="text-gray-500 text-xs">{plan.period}</p>
                        </div>
                      </div>
                      <span className="font-extrabold text-lg">{plan.priceFormatted}</span>
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
                    <span className="text-gray-500">Username (Owner)</span>
                    <span className="text-right font-medium">{username}</span>
                    <span className="text-gray-500">Nama</span>
                    <span className="text-right font-medium">{customerName}</span>
                    <span className="text-gray-500">Email</span>
                    <span className="text-right font-medium">{customerEmail}</span>
                    <span className="text-gray-500">No. HP</span>
                    <span className="text-right font-medium">{customerPhone}</span>
                  </div>
                  {plan && plan.maxAccounts >= 2 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-3.5 h-3.5 text-[#46d369]" />
                        <span className="text-xs font-semibold text-[#46d369] uppercase tracking-wider">Akun Kedua</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-gray-500">Status</span>
                        <span className="text-right font-medium text-[#46d369]">Dibuat nanti oleh owner</span>
                      </div>
                    </div>
                  )}
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}
      </div>
      {/* Payment Dialog */}
      {plan && showPaymentPopup && (
        <PaymentDialog
          open={showPaymentPopup}
          onClose={() => setShowPaymentPopup(false)}
          onSuccess={() => {
            setShowPaymentPopup(false);
            // Always redirect to beranda (pembukaan) after payment
            window.location.href = '/pembukaan';
          }}
          onAutoLogin={() => {}}
          pkg={{
            type: plan.id,
            name: plan.name,
            price: plan.price,
            priceFormatted: plan.priceFormatted,
            period: plan.period,
          }}
          customerData={{
            name: customerName.trim(),
            email: customerEmail.trim(),
            phone: customerPhone.trim(),
            username: username.trim(),
            password: password,
          }}
        />
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#141414] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#e50914] animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
