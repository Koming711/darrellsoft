'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, MapPin, ShoppingCart, X } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

/**
 * LandingOrderPopup — PERMINTAAN USER (halaman landing):
 * popup "bukti sosial" yang muncul bergantian (slide dari kiri-bawah)
 * seolah-olah ada pelanggan baru yang memesan beberapa waktu yang lalu.
 *
 * - 50 popup dengan NAMA & DAERAH berbeda-beda (satu per satu, tidak dobel).
 * - Popup pertama muncul 6 DETIK setelah halaman terbuka.
 * - Waktu dipesan BERTINGKAT NAIK mulai dari 8 MENIT dan terus meningkat
 *   TANPA BATAS (menit → jam → hari, otomatis diformat rapi).
 * - Siklus berulang terus-menerus (50 → kembali ke 1) sampai pengunjung
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
  // 1-10 — menit (8 sampai 50, bertingkat)
  { name: 'Budi Santoso', daerah: 'Jakarta Selatan', minutes: 8 },
  { name: 'Siti Nurhaliza', daerah: 'Bandung', minutes: 12 },
  { name: 'Ahmad Fauzi', daerah: 'Surabaya', minutes: 16 },
  { name: 'Dewi Lestari', daerah: 'Medan', minutes: 20 },
  { name: 'Rizky Pratama', daerah: 'Semarang', minutes: 25 },
  { name: 'Nina Kurniawati', daerah: 'Yogyakarta', minutes: 30 },
  { name: 'Joko Susilo', daerah: 'Makassar', minutes: 35 },
  { name: 'Ayu Wulandari', daerah: 'Denpasar', minutes: 40 },
  { name: 'Hendra Gunawan', daerah: 'Palembang', minutes: 45 },
  { name: 'Fitri Handayani', daerah: 'Bekasi', minutes: 50 },
  // 11-17 — menit lanjutan (60-120)
  { name: 'Andi Wijaya', daerah: 'Tangerang', minutes: 60 },
  { name: 'Rina Marlina', daerah: 'Depok', minutes: 70 },
  { name: 'Bambang Setiawan', daerah: 'Bogor', minutes: 80 },
  { name: 'Sri Wahyuni', daerah: 'Malang', minutes: 90 },
  { name: 'Agus Salim', daerah: 'Batam', minutes: 100 },
  { name: 'Maya Anggraini', daerah: 'Pekanbaru', minutes: 110 },
  { name: 'Doni Hermawan', daerah: 'Balikpapan', minutes: 120 },
  // 18-30 — jam (3-15 jam, bertingkat)
  { name: 'Lina Kartika', daerah: 'Pontianak', minutes: 180 },
  { name: 'Eko Prasetyo', daerah: 'Manado', minutes: 240 },
  { name: 'Yuni Astuti', daerah: 'Samarinda', minutes: 300 },
  { name: 'Fajar Nugroho', daerah: 'Cirebon', minutes: 360 },
  { name: 'Ratna Sari', daerah: 'Solo', minutes: 420 },
  { name: 'Taufik Hidayat', daerah: 'Padang', minutes: 480 },
  { name: 'Mega Puspita', daerah: 'Serang', minutes: 540 },
  { name: 'Ilham Ramadhan', daerah: 'Cilacap', minutes: 600 },
  { name: 'Wulan Sari', daerah: 'Tasikmalaya', minutes: 660 },
  { name: 'Gunawan Wibowo', daerah: 'Sukabumi', minutes: 720 },
  { name: 'Putri Amelia', daerah: 'Kediri', minutes: 780 },
  { name: 'Rudi Hartono', daerah: 'Jember', minutes: 840 },
  { name: 'Sari Puspita', daerah: 'Madiun', minutes: 900 },
  // 31-34 — jam lanjutan sampai 1 hari
  { name: 'Dimas Aditya', daerah: 'Banda Aceh', minutes: 960 },
  { name: 'Kartika Dewi', daerah: 'Banjarmasin', minutes: 1080 },
  { name: 'Yusuf Maulana', daerah: 'Palu', minutes: 1200 },
  { name: 'Indah Permata', daerah: 'Ambon', minutes: 1440 },
  // 35-50 — hari (2-40 hari, tanpa batas atas di konsep; siklus kembali ke 8 menit)
  { name: 'Hasan Basri', daerah: 'Jayapura', minutes: 2880 },
  { name: 'Diah Rahayu', daerah: 'Mataram', minutes: 4320 },
  { name: 'Arif Budiman', daerah: 'Kendari', minutes: 5760 },
  { name: 'Nia Ramadhani', daerah: 'Gorontalo', minutes: 7200 },
  { name: 'Bayu Setiawan', daerah: 'Kupang', minutes: 8640 },
  { name: 'Melati Putri', daerah: 'Sorong', minutes: 10080 },
  { name: 'Wahyu Kurnia', daerah: 'Ternate', minutes: 12960 },
  { name: 'Ayu Lestari', daerah: 'Banten', minutes: 14400 },
  { name: 'Rangga Mahendra', daerah: 'Lampung', minutes: 17280 },
  { name: 'Sinta Bella', daerah: 'Bengkulu', minutes: 20160 },
  { name: 'Aldi Saputra', daerah: 'Jambi', minutes: 25920 },
  { name: 'Gita Savitri', daerah: 'Kuningan', minutes: 28800 },
  { name: 'Rio Fernandes', daerah: 'Baubau', minutes: 36000 },
  { name: 'Tia Amelia', daerah: 'Mojokerto', minutes: 43200 },
  { name: 'Fauzan Aziz', daerah: 'Banyuwangi', minutes: 50400 },
  { name: 'Nadya Zahra', daerah: 'Subang', minutes: 57600 },
];

/** Format waktu lalu: menit → jam → hari (otomatis, sesuai durasi). */
function formatAgo(minutes: number, lang: 'id' | 'en'): string {
  if (minutes < 60) {
    return lang === 'en' ? `${minutes} minutes ago` : `${minutes} menit yang lalu`;
  }
  if (minutes < 1440) {
    const h = minutes / 60;
    const label = Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ',');
    const unit = h === 1 ? 'hour' : 'hours';
    return lang === 'en' ? `${label} ${unit} ago` : `${label} jam lalu`;
  }
  const d = Math.round(minutes / 1440);
  const unit = d === 1 ? 'day' : 'days';
  return lang === 'en' ? `${d} ${unit} ago` : `${d} hari lalu`;
}

const SHOW_MS = 5000; // durasi popup tampil
const GAP_MS = 8000; // jeda antar popup
const FIRST_DELAY_MS = 6000; // PERMINTAAN USER: popup pertama muncul 6 detik
// setelah halaman terbuka. 50 popup, waktu dipesan BERTINGKAT NAIK mulai
// dari 8 menit dan terus meningkat TANPA BATAS (menit → jam → hari).

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
  const minutesLabel = order ? formatAgo(order.minutes, language) : '';

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
            className="pointer-events-auto relative flex w-[300px] items-start gap-3.5 rounded-2xl border border-emerald-100 bg-white p-4 shadow-xl shadow-emerald-900/10 dark:border-emerald-900/50 dark:bg-zinc-900 sm:w-[344px]"
          >
            {/* Tombol tutup — berhenti seluruhnya untuk sesi ini */}
            <button
              type="button"
              onClick={dismiss}
              aria-label={language === 'en' ? 'Close notification' : 'Tutup notifikasi'}
              className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Avatar inisial + titik hijau (online) */}
            <div className="relative shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 text-base font-bold text-white">
                {order.name.charAt(0)}
              </div>
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900"
              />
            </div>

            {/* Isi */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-gray-900 dark:text-gray-100">
                {order.name}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-600 dark:text-gray-300">
                <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="truncate">{orderedLabel}</span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{order.daerah}</span>
                <span aria-hidden="true">·</span>
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{minutesLabel}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
