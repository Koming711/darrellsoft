'use client';

// Halaman Paket Berlangganan — menampilkan paket dari database (dikelola admin).
// CTA "Pilih Paket" → checkout dengan transaksi pembayaran manual.

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Check, Zap, Loader2, Star, Landmark, QrCode, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupiahClient } from '@/components/payment-manual/proof-upload-form';

interface DbPlan {
  id: string;
  planName: string;
  price: number;
  discountPercent: number;
  durationMonths: number;
  maxAccounts: number;
  features: string;
  isActive: boolean;
  sortOrder: number;
}

function PaketContent() {
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<{ bank: boolean; qris: boolean }>({ bank: true, qris: true });

  useEffect(() => {
    fetch('/api/payment-manual/plans')
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch('/api/payment-manual/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setMethods({ bank: !!data.settings.bankTransferEnabled, qris: !!data.settings.qrisEnabled });
        }
      })
      .catch(() => {});
  }, []);

  const preselect = searchParams.get('plan') || '';

  return (
    <div className="dark-surface min-h-screen bg-[#141414] text-white flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[#141414]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4" /> Kembali
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#e50914] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">www.darrellsoft.com</span>
          </div>
          <div className="w-20" />
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center px-4 py-10 md:py-14">
        <h1 className="text-2xl md:text-4xl font-extrabold text-center">Paket Berlangganan</h1>
        <p className="text-gray-500 text-center text-sm mt-2 max-w-md">
          Pilih paket aplikasi Darrellsoft. Pembayaran via transfer bank atau QRIS, diverifikasi admin.
        </p>

        {/* Metode pembayaran aktif */}
        <div className="flex items-center gap-3 mt-4 mb-8">
          {methods.bank && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <Landmark className="w-3 h-3" /> Transfer Bank
            </span>
          )}
          {methods.qris && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <QrCode className="w-3 h-3" /> QRIS Manual
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#e50914] animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-16">Belum ada paket tersedia.</div>
        ) : (
          <div className="w-full max-w-2xl space-y-4 pb-10">
            {plans.map((p, i) => {
              const discount = Math.round(p.price * (p.discountPercent || 0) / 100);
              const total = p.price - discount;
              let features: string[] = [];
              try { features = JSON.parse(p.features || '[]'); } catch {}
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`relative rounded-2xl border p-5 transition-all ${
                    preselect === p.id
                      ? 'bg-[#e50914]/10 border-[#e50914]/50'
                      : 'bg-[#1f1f1f] border-white/10 hover:border-white/25'
                  }`}
                >
                  {p.discountPercent > 0 && (
                    <span className="absolute -top-2.5 right-4 text-[10px] bg-[#e50914] text-white px-2 py-0.5 rounded font-bold">
                      HEMAT {p.discountPercent}%
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-extrabold text-lg flex items-center gap-2">
                        {p.planName}
                        {p.discountPercent >= 40 && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                      </h3>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Durasi {p.durationMonths} bulan · {p.maxAccounts} akun pengguna
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {features.map((f, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-gray-300">
                            <Check className="w-3.5 h-3.5 text-[#46d369] shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="text-right shrink-0">
                      {p.discountPercent > 0 && (
                        <p className="text-gray-600 text-xs line-through">{formatRupiahClient(p.price)}</p>
                      )}
                      <p className="text-2xl font-extrabold">{formatRupiahClient(total)}</p>
                      <p className="text-gray-500 text-[11px]">/ {p.durationMonths} bulan</p>
                    </div>
                  </div>
                  <Link href={`/checkout?plan=${p.id}`} className="block mt-4">
                    <Button className="w-full py-3 bg-[#e50914] hover:bg-[#f40612] text-white font-bold rounded-xl transition-all">
                      Pilih Paket
                    </Button>
                  </Link>
                </motion.div>
              );
            })}

            <div className="flex items-center justify-center gap-2 text-gray-600 text-[11px] pt-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Paket diaktifkan setelah pembayaran diverifikasi admin Darrellsoft.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaketPage() {
  return (
    <Suspense
      fallback={
        <div className="dark-surface min-h-screen bg-[#141414] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#e50914] animate-spin" />
        </div>
      }
    >
      <PaketContent />
    </Suspense>
  );
}
