'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, MapPin, ShoppingCart, X } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

/**
 * LandingOrderPopup — PERMINTAAN USER (halaman landing):
 * popup "bukti sosial" yang muncul bergantian (slide dari kiri-bawah)
 * seolah-olah ada pelanggan baru yang memesan beberapa menit yang lalu.
 *
 * - 10 popup dengan NAMA & DAERAH berbeda (satu per satu, tidak dobel).
 * - Siklus berulang terus-menerus (10 → kembali ke 1) sampai pengunjung
 *   menutup lewat tombol X — setelah ditutup, popup berhenti seluruhnya
 *   untuk sesi tersebut.
 * - Hanya tampil di halaman landing (/); tidak dipasang di halaman aplikasi.
 */

interface OrderProof {
  name: string;
  daerah: string;
  minutes: number;
}

const ORDER_PROOFS: OrderProof[] = [
  { name: 'Budi Santoso', daerah: 'Jakarta Selatan', minutes: 2 },
  { name: 'Siti Nurhaliza', daerah: 'Bandung', minutes: 5 },
  { name: 'Ahmad Fauzi', daerah: 'Surabaya', minutes: 8 },
  { name: 'Dewi Lestari', daerah: 'Medan', minutes: 3 },
  { name: 'Rizky Pratama', daerah: 'Semarang', minutes: 12 },
  { name: 'Nina Kurniawati', daerah: 'Yogyakarta', minutes: 6 },
  { name: 'Joko Susilo', daerah: 'Makassar', minutes: 4 },
  { name: 'Ayu Wulandari', daerah: 'Denpasar', minutes: 9 },
  { name: 'Hendra Gunawan', daerah: 'Palembang', minutes: 7 },
  { name: 'Fitri Handayani', daerah: 'Bekasi', minutes: 11 },
];

const SHOW_MS = 5000; // durasi popup tampil
const GAP_MS = 8000; // jeda antar popup
const FIRST_DELAY_MS = 3500; // jeda popup pertama setelah halaman terbuka

export function LandingOrderPopup() {
  const { language } = useLanguage();
  const [index, setIndex] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let i = 0;

    const show = () => {
      if (dismissedRef.current) return;
      setIndex(i % ORDER_PROOFS.length);
      timer = setTimeout(hide, SHOW_MS);
    };
    const hide = () => {
      setIndex(null);
      i += 1;
      timer = setTimeout(show, GAP_MS);
    };

    timer = setTimeout(show, FIRST_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    dismissedRef.current = true;
    setDismissed(true);
    setIndex(null);
  };

  if (dismissed) return null;
  const order = index === null ? null : ORDER_PROOFS[index];

  const orderedLabel =
    language === 'en' ? 'just placed an order' : 'baru saja melakukan pemesanan';
  const minutesLabel =
    language === 'en' ? `${order?.minutes} minutes ago` : `${order?.minutes} menit yang lalu`;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-3 z-[95] sm:bottom-4 sm:left-4"
    >
      <AnimatePresence>
        {order && (
          <motion.div
            key={index}
            role="status"
            initial={{ opacity: 0, x: -48, y: 16 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: -48, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="pointer-events-auto relative flex w-[264px] items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-3 shadow-xl shadow-emerald-900/10 dark:border-emerald-900/50 dark:bg-zinc-900 sm:w-[300px]"
          >
            {/* Tombol tutup — berhenti seluruhnya untuk sesi ini */}
            <button
              type="button"
              onClick={dismiss}
              aria-label={language === 'en' ? 'Close notification' : 'Tutup notifikasi'}
              className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Avatar inisial + titik hijau (online) */}
            <div className="relative shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 text-sm font-bold text-white">
                {order.name.charAt(0)}
              </div>
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900"
              />
            </div>

            {/* Isi */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">
                {order.name}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <ShoppingCart className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="truncate">{orderedLabel}</span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{order.daerah}</span>
                <span aria-hidden="true">·</span>
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{minutesLabel}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
