'use client';

import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Boxes,
  Calculator,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Cloud,
  CreditCard,
  Crown,
  Download,
  FileText,
  Globe,
  HandCoins,
  Lightbulb,
  MessageCircle,
  Monitor,
  Printer,
  Quote,
  Receipt,
  Scissors,
  Shield,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Truck,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/language-context';
import { releaseVersionLabel } from '@/lib/changelog';


/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */
function FadeIn({
  children,
  delay = 0,
  className = '',
  direction = 'up',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const dirMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  };
  const { x, y } = dirMap[direction];

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={isInView ? { opacity: 0, x, y } : false}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function CountUp({ end, suffix = '', prefix = '', duration = 2000 }: { end: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.span
      ref={ref}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {isInView ? (
        <Counter end={end} suffix={suffix} prefix={prefix} duration={duration} />
      ) : (
        <span>{prefix}{end.toLocaleString('id-ID')}{suffix}</span>
      )}
    </motion.span>
  );
}

function Counter({ end, suffix, prefix, duration }: { end: number; suffix: string; prefix: string; duration: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useInView(ref, { once: true });

  if (!started.current) {
    started.current = true;
    const startTime = Date.now();
    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return <span ref={ref}>{prefix}{count.toLocaleString('id-ID')}{suffix}</span>;
}

/* ------------------------------------------------------------------ */
/*  Section Wrapper                                                    */
/* ------------------------------------------------------------------ */
function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`w-full py-20 md:py-28 px-4 md:px-8 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Eyebrow Badge (pola badge kecil di atas heading section)           */
/* ------------------------------------------------------------------ */
function EyebrowBadge({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] border mb-5 ${
        dark
          ? 'bg-white/5 text-teal-300 border-white/10'
          : 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/60'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-400" aria-hidden="true" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature Card                                                       */
/* ------------------------------------------------------------------ */
function FeatureCard({
  icon: Icon,
  title,
  desc,
  delay = 0,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <Card className="card-tap group relative overflow-hidden rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111] shadow-sm hover:shadow-xl hover:shadow-emerald-600/10 hover:-translate-y-1 transition-all duration-300 h-full">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardContent className="relative p-6 pt-8 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-600/25 group-hover:scale-110 transition-transform duration-300">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h3>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">{desc}</p>
        </CardContent>
      </Card>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing Card                                                       */
/* ------------------------------------------------------------------ */
function PricingCard({
  title,
  price,
  period,
  description,
  descriptionExtra,
  features,
  popular = false,
  delay = 0,
  onSelect,
  popularLabel,
  buttonLabel,
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  descriptionExtra?: string;
  features: React.ReactNode[];
  popular?: boolean;
  delay?: number;
  onSelect: () => void;
  popularLabel?: string;
  buttonLabel?: string;
}) {
  const card = (
    <Card
      onClick={onSelect}
      className={
        popular
          ? 'shadow-sm dark-surface relative overflow-hidden h-full flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-1 rounded-[14px] border-0 bg-[#0a1122]'
          : 'dark-surface relative overflow-hidden h-full flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-1 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] shadow-lg shadow-black/20'
      }
    >
      {popular && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-32 bg-teal-400/20 blur-3xl rounded-full pointer-events-none" />
      )}
      <CardHeader className="relative p-5 pb-3 text-center">
        {popular && (
          <div className="flex justify-center mb-3">
            <Badge className="bg-gradient-to-r from-emerald-600 to-teal-400 text-white border-0 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/40">
              <Star className="w-3 h-3 mr-1 fill-white" /> {popularLabel}
            </Badge>
          </div>
        )}
        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <p className="text-gray-400 text-xs mt-0.5">{description}{descriptionExtra && <><br />{descriptionExtra}</>}</p>
        <div className="mt-3">
          <span className="text-2xl md:text-[32px] font-extrabold tracking-tight bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">
            {price}
          </span>
          <p className="text-gray-400 text-xs mt-1">{period}</p>
        </div>
      </CardHeader>
      <CardContent className="relative p-5 pt-0 flex-1">
        <Separator className="mb-4 bg-white/10" />
        <ul className="space-y-2.5">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
              <CircleCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="relative p-5 pt-0">
        <Button
          className={`ripple-btn w-full py-2.5 text-xs font-semibold rounded-xl transition-all duration-300 ${
            popular
              ? 'cta-glow bg-gradient-to-r from-emerald-600 to-teal-400 hover:from-emerald-500 hover:to-teal-300 text-white shadow-lg shadow-emerald-600/30 hover:shadow-xl hover:shadow-emerald-500/40'
              : 'bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/20'
          }`}
        >
          {buttonLabel} <ArrowRight className="ml-1.5 w-3 h-3" />
        </Button>
      </CardFooter>
    </Card>
  );

  return (
    <FadeIn delay={delay}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="h-full"
      >
        {popular ? (
          <div className="relative h-full rounded-2xl p-[1.5px] bg-gradient-to-b from-emerald-500 via-teal-400 to-emerald-600 shadow-2xl shadow-emerald-600/30">
            {card}
          </div>
        ) : (
          card
        )}
      </motion.div>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Testimonial Card                                                   */
/* ------------------------------------------------------------------ */
function TestimonialCard({
  name,
  role,
  quote,
  avatar,
  delay = 0,
}: {
  name: string;
  role: string;
  quote: string;
  avatar: string;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <Card className="card-tap group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111] shadow-sm hover:shadow-xl hover:shadow-emerald-600/10 hover:-translate-y-1 transition-all duration-300 h-full overflow-hidden">
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <Quote className="w-8 h-8 text-emerald-100 dark:text-emerald-900/50 fill-emerald-100 dark:fill-emerald-900/50 -mt-1" />
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">&ldquo;{quote}&rdquo;</p>
          <div className="flex items-center gap-3 mt-auto pt-4 border-t border-gray-100 dark:border-white/5">
            <div className="p-[2px] rounded-full bg-gradient-to-br from-emerald-600 to-teal-400 shrink-0 shadow-sm shadow-emerald-600/30">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-sm font-extrabold bg-gradient-to-br from-emerald-600 to-teal-400 bg-clip-text text-transparent">
                {avatar}
              </div>
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{name}</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs">{role}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
const WHATSAPP_NUMBER = '6285888082208'
const WHATSAPP_TEXT = 'Halo Darrell Soft, saya tertarik untuk berlangganan!'
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`

/* ------------------------------------------------------------------ */
/*  Landing page translations (id + en)                                */
/* ------------------------------------------------------------------ */
const LANDING_T = {
  id: {
    nav_fitur: 'Fitur',
    nav_kenapa: 'Kenapa Langganan',
    nav_harga: 'Harga',
    nav_testimoni: 'Testimoni',
    nav_login: 'Login Masuk',

    hero_badge: 'Aplikasi Akuntansi untuk Bisnis Cetak',
    hero_h1_1: 'Buat Invoice, Surat Jalan,',
    hero_h1_2: 'Purchase Order & Stock Bahan,',
    hero_h1_3: 'Laba Rugi — Semua Satu Aplikasi!',
    hero_p1_bold1: 'Akuntansi bisnis cetak kini semudah mengetik...!!',
    hero_p1_bold2: 'Pakai Darrell Soft aja!',
    hero_p1_text: 'Dulu order, stok, dan keuangan dicatat pakai buku tulis dan kalkulator.',
    hero_p1_emphasis: 'sekarang siapapun bisa',
    hero_p1_end: 'mengelola bisnis percetakan dengan sistem akuntansi yang rapi!',
    hero_p2: 'Invoice & surat jalan otomatis, purchase order, stock bahan baku, piutang & hutang dagang, hitung harga kertas, laporan laba rugi, sampai laporan penjualan POS — semua tercatat rapi dalam satu aplikasi.',
    hero_trust1: 'Tanpa ikatan kontrak',
    hero_trust2: 'Bisa batal kapan saja tanpa syarat',
    hero_trust3: 'Bisa langganan 1 bulan saja',
    hero_trust4: 'Tanpa denda',
    hero_cta1: 'Langganan Sekarang — Gratis 3 Hari!',
    hero_cta2: 'Lihat Paket Harga',
    hero_p3: 'Mulai gratis, tanpa kartu kredit. Berhenti kapan saja, tanpa denda.',

    hero_inv_title: 'INVOICE',
    hero_inv_no: '#INV-2026-0042',
    hero_inv_status: 'LUNAS',
    hero_inv_item1: 'Dus Kue 12×16',
    hero_inv_qty1: '500 pcs',
    hero_inv_price1: 'Rp 3.500.000',
    hero_inv_item2: 'Paperbowl 750ml',
    hero_inv_qty2: '1.000 pcs',
    hero_inv_price2: 'Rp 2.800.000',
    hero_inv_item3: 'Stiker Label',
    hero_inv_qty3: '200 pcs',
    hero_inv_price3: 'Rp 450.000',
    hero_inv_total: 'Total',
    hero_inv_total_val: 'Rp 6.750.000',
    hero_inv_chip1: 'Surat Jalan',
    hero_inv_chip2: 'Stock Bahan',
    hero_inv_chip3: 'Piutang',
    hero_alt_printing: 'Mesin Cetak Kemasan',
    hero_badge_hitung_cepat: 'Invoice Jadi',
    hero_badge_hitung_cepat_val: '< 1 Menit',
    hero_badge_profit_naik: 'Laba Rugi',
    hero_badge_profit_naik_val: 'Real-Time',

    stats_1_label: 'Pengguna Aktif',
    stats_2_label: 'Tingkat Kepuasan',
    stats_3_label: 'Transaksi Tercatat',
    stats_4_label: 'Support Online',

    urg_badge: 'Penawaran Terbatas',
    urg_h2_1: 'Jangan Biarkan Bisnis Cetakmu',
    urg_h2_2: 'Berantakan',
    urg_h2_3: 'Karena Pencatatan Manual!',
    urg_p: 'Berlangganan Darrell Soft lebih murah daripada satu piutang lupa tertagih atau stok bahan salah catat!',
    urg_card1_title: 'Pencatatan Rapi',
    urg_card1_desc: 'Invoice, surat jalan, dan purchase order tersusun otomatis dengan nomor urut. Tidak ada lagi nota hilang atau dobel catat.',
    urg_card2_title: 'Arus Kas Terpantau',
    urg_card2_desc: 'Piutang & hutang dagang terlihat jelas setiap hari. Tahu siapa yang harus ditagih dan kapan tagihan supplier jatuh tempo.',
    urg_card3_title: 'Laporan Instan',
    urg_card3_desc: 'Laba rugi dan laporan penjualan POS tampil dalam hitungan detik. Keputusan bisnis jauh lebih cepat!',
    urg_cta1: 'Ya, Saya Mau Coba Gratis!',
    urg_cta2: 'Tanya Admin Dulu',
    urg_p_below: 'Cuma 3 detik daftar, langsung bisa pakai.',

    fitur_badge: 'Fitur Unggulan',
    fitur_h2_1: '12 Fitur Akuntansi',
    fitur_h2_2: 'dalam Satu Aplikasi',
    fitur_p: 'Dari buat invoice sampai laporan keuangan — semua yang dibutuhkan bisnis percetakan, dalam satu aplikasi yang powerful.',
    fitur_card1_title: 'Buat Invoice',
    fitur_card1_desc: 'Buat invoice profesional dalam hitungan detik. Nomor otomatis, data customer tersimpan, siap cetak dan kirim.',
    fitur_card2_title: 'Surat Jalan',
    fitur_card2_desc: 'Surat jalan otomatis mengikuti invoice. Barang berangkat, pengiriman tercatat rapi tanpa perlu catat manual.',
    fitur_card3_title: 'Purchase Order',
    fitur_card3_desc: 'Catat pesanan pembelian ke supplier dengan rapi. Qty, harga, dan barang datang selalu terkontrol.',
    fitur_card4_title: 'Stock Bahan Baku',
    fitur_card4_desc: 'Stok kertas & bahan masuk-keluar menyesuaikan otomatis di tiap transaksi. Anti stok kosong mendadak.',
    fitur_card5_title: 'Piutang Dagang',
    fitur_card5_desc: 'Pantau tagihan customer yang belum dibayar. Tahu siapa yang belum lunas — tidak ada piutang terlupa.',
    fitur_card6_title: 'Hutang Dagang',
    fitur_card6_desc: 'Catat hutang ke supplier beserta jatuh temponya. Bayar tepat waktu, langganan supplier tetap aman.',
    fitur_card7_title: 'Hitung Harga Kertas',
    fitur_card7_desc: 'Ketik ukuran & jenis kertas, harga modal langsung jadi. Dasar harga jual yang akurat dan menguntungkan.',
    fitur_card8_title: 'Laporan Laba Rugi',
    fitur_card8_desc: 'Laba rugi dihitung otomatis dari semua transaksi. Tahu untung atau rugi tanpa rekap manual di Excel.',
    fitur_card9_title: 'Laporan Penjualan POS',
    fitur_card9_desc: 'Terhubung dengan kasir POS. Penjualan harian, produk terlaris, dan omzet langsung tersaji lengkap.',
    fitur_card10_title: 'Hitung Potong Kertas',
    fitur_card10_desc: 'Masukkan ukuran potong & jumlah pesanan, kebutuhan lembar kertas beserta biayanya langsung jadi. Nggak ada lagi salah hitung potongan.',
    fitur_card11_title: 'Hitung Cetakan',
    fitur_card11_desc: 'Hitung biaya cetak tiap pesanan dengan rincian lengkap. Oplah besar atau kecil, harga per pcs langsung keluar otomatis.',
    fitur_card12_title: 'Hitung Finishing',
    fitur_card12_desc: 'Laminasi, jilid, lipat, dan lainnya tinggal pilih. Biaya finishing tiap pesanan terhitung otomatis, rapi dan akurat.',

    keunggulan_badge: 'Kenapa Darrell Soft?',
    keunggulan_h2_1: 'Cepat, Akurat,',
    keunggulan_h2_2: 'dan Fleksibel!',
    keunggulan_p: 'Bisa diakses via Desktop maupun HP, kapan saja dan di mana saja.',
    adv1_title: 'Akses via Desktop',
    adv1_desc: 'Tampilan penuh yang nyaman untuk penggunaan di kantor atau toko. Semua fitur akuntansi tersedia.',
    adv2_title: 'Akses via HP',
    adv2_desc: 'Mobile-friendly! Cek invoice, stock, dan laba rugi langsung dari smartphone, di mana saja kamu berada.',
    adv3_title: 'Kecepatan Tinggi',
    adv3_desc: 'Semua perhitungan instan. Buat invoice sampai laporan laba rugi selesai dalam hitungan detik.',
    adv4_title: 'Data Aman',
    adv4_desc: 'Data bisnismu tersimpan dengan aman. Backup otomatis dan enkripsi untuk keamanan maksimal.',
    adv5_title: 'Install di Windows & Mac',
    adv5_desc: 'Bisa diinstall langsung di komputer Windows dan MacBook. Tampil seperti aplikasi desktop asli.',
    adv6_title: 'Install di Android & iOS',
    adv6_desc: 'Install langsung di HP Android dan iPhone. Gampang digunakan, tidak usah buka browser lagi.',

    kenapa_badge: 'Kenapa Harus Berlangganan?',
    kenapa_h2_1: 'Data Aman di',
    kenapa_h2_2: 'Cloud,',
    kenapa_h2_3: 'Bisa Buka di',
    kenapa_h2_4: 'Mana Saja',
    kenapa_p: 'Darrell Soft berbasis cloud — data bisnismu tersimpan aman dan bisa diakses kapan saja, di mana saja, selama ada internet.',

    cloud1_title: 'Data Aman di Cloud, Tidak Hilang!',
    cloud1_b1_pre: 'HP hilang/laptop rusak?',
    cloud1_b1_bold: 'Data tetap aman',
    cloud1_b1_post: 'di cloud server terenkripsi',
    cloud1_b2_pre: 'Login dari perangkat mana saja,',
    cloud1_b2_bold: 'data langsung ada lengkap dan utuh',

    cloud2_title: 'Bisa Buka di Mana Saja — Dalam & Luar Negeri!',
    cloud2_b1_pre: 'Jakarta, Surabaya, atau luar negeri —',
    cloud2_b1_bold: 'selama ada internet, bisnis tetap jalan',
    cloud2_b2_pre: 'HP saat di perjalanan,',
    cloud2_b2_bold: 'laptop saat di kantor',
    cloud2_b2_post: '— semua bisa!',

    cloud3_title: 'HP & Laptop, Semua Bisa!',
    cloud3_b1_bold: 'Satu akun, semua perangkat',
    cloud3_b1_post: 'tersinkronisasi real-time',
    cloud3_b2_pre: 'Update di HP,',
    cloud3_b2_bold: 'langsung muncul di laptop',
    cloud3_b2_post: '— dan sebaliknya',

    cloud4_title: 'Kenapa Bayar? Investasi Kecil, Hasil Besar!',
    cloud4_b1_pre: 'Cuma',
    cloud4_b1_bold: 'Rp 128.000/bulan',
    cloud4_b1_post: '— lebih murah dari sekali salah hitung!',
    cloud4_b2_bold: 'Tidak perlu bayar server, IT, atau maintenance',
    cloud4_b2_post: '— semua kami tangani',

    golden_badge: 'Kesempatan Emas',
    golden_h3_1: 'UMKM Makanan Sudah Banyak...',
    golden_h3_2: 'Tapi Bos Percetakan Masih Sedikit!',
    golden_fakta: 'Fakta',
    golden_fakta_p_pre: 'UMKM makanan sudah',
    golden_fakta_p_bold1: 'jutaan',
    golden_fakta_p_mid: ', tapi setiap UMKM butuh',
    golden_fakta_p_bold2: 'box, kemasan, stiker, brosur',
    golden_fakta_p_post: ' — semua produk cetak!',
    golden_artinya: 'Artinya',
    golden_artinya_p_pre: 'Peluang bos percetakan masih',
    golden_artinya_p_bold1: 'sangat besar',
    golden_artinya_p_mid: '. Orang takut karena tidak bisa atur keuangan —',
    golden_artinya_p_bold2: 'Darrell Soft hilangkan rintangan itu!',
    golden_stat1_val: '64 Juta+',
    golden_stat1_label: 'UMKM di Indonesia',
    golden_stat2_val: 'Sedikit',
    golden_stat2_label: 'Pengusaha Percetakan',
    golden_stat3_val: 'Peluang Besar!',
    golden_stat3_label: 'Jadilah Bos Cetakan',
    golden_cta1: 'Jadilah Bos Percetakan!',
    golden_cta2: 'Konsultasi Gratis',
    golden_quote: 'UMKM harus naik kelas! Dari yang cuma jualan, jadi pengusaha yang punya sistem.',

    cara_badge: 'Cara Kerja',
    cara_h2_1: 'Semudah',
    cara_step1_title: 'Buat Invoice & Surat Jalan',
    cara_step1_desc: 'Order masuk? Buat invoice dalam hitungan detik — surat jalan otomatis siap mengantar barang.',
    cara_step2_title: 'Transaksi Tercatat Otomatis',
    cara_step2_desc: 'Stock bahan baku, piutang, dan hutang dagang menyesuaikan sendiri dari setiap transaksi.',
    cara_step3_title: 'Lihat Laporan & Untung',
    cara_step3_desc: 'Laba rugi dan laporan penjualan POS tampil real-time. Keputusan bisnis makin tepat.',

    harga_badge: 'Harga',
    harga_h2_1: 'Pilih Paket',
    harga_h2_2: 'Terbaik',
    harga_h2_3: 'Kamu',
    harga_p: 'Mulai dari gratis, atau berlangganan untuk fitur lengkap.',
    price_popular_badge: 'Hemat Banget!',
    price_btn: 'Pilih Paket',

    price_economis_title: 'Bulanan Ekonomis',
    price_economis_desc: '1 akun, hemat untuk pemula',
    price_economis_period: 'per bulan',
    price_economis_f1: '1 akun pengguna',
    price_economis_f2: 'Buat invoice & surat jalan',
    price_economis_f3: 'Hitung harga kertas otomatis',
    price_economis_f4: 'Stock bahan baku',
    price_economis_f5: 'Akses Desktop & Mobile',
    price_economis_f6_bold: 'Boleh langganan 1 bulan saja',
    price_economis_f7: 'Tidak ada biaya denda sama sekali',

    price_bulanan_title: 'Langganan Bulanan',
    price_bulanan_desc: 'Langganan bulanan, sangat fleksibel',
    price_bulanan_period: 'per bulan',
    price_bulanan_f1: '2 akun untuk team',
    price_bulanan_f2: 'Semua fitur akuntansi lengkap',
    price_bulanan_f3: 'Piutang & hutang dagang',
    price_bulanan_f4: 'Laporan laba rugi',
    price_bulanan_f5: 'Akses Desktop & Mobile',
    price_bulanan_f6_bold: 'Boleh langganan 1 bulan saja',
    price_bulanan_f7: 'Tidak ada biaya denda sama sekali',

    price_tahunan_title: 'Langganan Tahunan',
    price_tahunan_desc: 'Hanya Rp 74.000/bulan',
    price_tahunan_desc_extra: '— hemat 37%!',
    price_tahunan_period: 'per tahun',
    price_tahunan_f1: '3 akun untuk group',
    price_tahunan_f2: 'Semua fitur akuntansi lengkap',
    price_tahunan_f3: 'Laporan penjualan POS',
    price_tahunan_f4: 'Purchase order & stock bahan',
    price_tahunan_f5: 'Akses Desktop & Mobile',
    price_tahunan_f6: 'Priority Support 24/7',
    price_tahunan_f7: 'Laporan laba rugi lengkap',
    price_tahunan_f8: 'Backup data otomatis',

    price_guarantee: 'Tanpa Ikatan Apapun! Bisa batal kapan saja tanpa denda.',

    testimoni_badge: 'Testimoni',
    testimoni_h2_1: 'Dipercaya',
    testimoni_h2_2: 'Ribuan Pengusaha',
    testimoni_h2_3: 'Percetakan',
    testi1_name: 'Maman',
    testi1_role: 'Pemilik Tunas Makmur',
    testi1_quote: 'Dulu buat invoice dan tagih piutang manual, sering ada yang lupa. Sekarang semua otomatis dan rapi. Laba rugi tinggal buka aplikasi!',
    testi2_name: 'Jimmy',
    testi2_role: 'Owner SiPrint',
    testi2_quote: 'Aplikasinya super mudah dipakai. Saya yang nggak paham akuntansi pun bisa langsung pakai. Harga paketnya juga sangat terjangkau.',
    testi3_name: 'Lina Listiawati',
    testi3_role: 'Owner Rajabowl',
    testi3_quote: 'Support-nya responsif banget! Setiap ada pertanyaan langsung dijawab. Darrell Soft memang solusi tepat untuk percetakan.',
    testi4_name: 'Gunawan',
    testi4_role: 'Pemilik One Printing',
    testi4_quote: 'Bayar 1 bulan aja gpp, bulan berikutnya tidak usah, tidak ada denda. Seperti langganan Netflix. Fleksibel banget!',

    cta_h2_1: 'Jangan Tunggu Lagi!',
    cta_h2_2: 'Mulai',
    cta_h2_3: 'Langganan',
    cta_h2_4: 'Sekarang',
    cta_p: 'Kompetitormu sudah pakai Darrell Soft. Mereka buat invoice dalam hitungan detik dan tahu laba ruginya tiap hari — sementara kamu masih catat manual?',
    cta_trust1: 'Gratis 3 hari trial',
    cta_trust2: 'Tanpa kartu kredit',
    cta_trust3: 'Bisa batal kapan saja',
    cta_card_h3: 'Cuma Rp 128.000/bulan — Lebih Murah dari Satu Piutang Lupa Tertagih!',
    cta_card_p_pre: 'Bayangkan:',
    cta_card_p_bold1: 'satu piutang lupa tertagih atau stok salah catat saja bisa rugi ratusan ribu hingga jutaan rupiah',
    cta_card_p_mid: '. Dengan Darrell Soft, semua transaksi tercatat rapi cuma Rp 128.000/bulan. ',
    cta_card_p_bold2: 'Investasi kecil, untung besar!',
    cta_card_check1_bold: 'Tanpa kontrak',
    cta_card_check1_post: ' — bebas berhenti kapan saja',
    cta_card_check2_bold: 'Tanpa denda',
    cta_card_check2_post: ' — tidak ada biaya tersembunyi',
    cta_card_check3_bold: 'Coba gratis 3 hari',
    cta_card_check3_post: ' — buktikan dulu!',
    cta_card_btn1: 'Langganan Sekarang — Gratis!',
    cta_card_btn2: 'Tanya Admin Dulu',
    cta_card_p_bottom: 'Sudah dipercaya 7.000+ pengusaha percetakan di Indonesia',
    cta_reassure: 'Masih ragu? Chat admin kami, konsultasi gratis tanpa kewajiban berlangganan.',

    faq_badge: 'FAQ',
    faq_h2_1: 'Pertanyaan yang',
    faq_h2_2: 'Sering Ditanyakan',
    faq1_q: 'Apakah bisa dicoba dulu sebelum berlangganan?',
    faq1_a: 'Tentu! Kami menyediakan masa trial gratis agar kamu bisa merasakan semua fitur Darrell Soft — invoice, stock bahan, laba rugi, dan lainnya — sebelum memutuskan berlangganan.',
    faq2_q: 'Bagaimana cara berlangganan?',
    faq2_a: 'Sangat mudah! Cukup DM kami, pilih paket yang sesuai, dan lakukan pembayaran. Akun kamu akan langsung aktif.',
    faq3_q: 'Apakah data saya aman?',
    faq3_a: 'Ya! Data kamu dilindungi dengan enkripsi dan backup otomatis. Privasi dan keamanan data adalah prioritas utama kami.',
    faq4_q: 'Bisa berhenti berlangganan kapan saja?',
    faq4_a: 'Tentu! Tidak ada ikatan kontrak. Kamu bisa berhenti kapan saja tanpa denda atau biaya tambahan.',

    footer_brand_desc: 'Aplikasi akuntansi untuk bisnis cetakan: buat invoice & surat jalan, kelola purchase order dan stock bahan baku, pantau piutang & hutang dagang, sampai laporan laba rugi dan penjualan POS.',
    footer_nav_title: 'Navigasi',
    footer_nav_fitur: 'Fitur',
    footer_nav_harga: 'Harga',
    footer_nav_testimoni: 'Testimoni',
    footer_nav_faq: 'FAQ',
    footer_contact_title: 'Hubungi Kami',
    footer_bottom_rights: 'All rights reserved.',
    footer_encrypted: 'Data Terenkripsi',
    footer_secure: 'Koneksi Aman',
  },
  en: {
    nav_fitur: 'Features',
    nav_kenapa: 'Why Subscribe',
    nav_harga: 'Pricing',
    nav_testimoni: 'Testimonials',
    nav_login: 'Login',

    hero_badge: 'Accounting App for Printing Businesses',
    hero_h1_1: 'Create Invoices, Delivery Notes,',
    hero_h1_2: 'Purchase Orders & Material Stock,',
    hero_h1_3: 'P&L Reports — All in One App!',
    hero_p1_bold1: 'Printing business accounting is now as easy as typing...!!',
    hero_p1_bold2: 'Just use Darrell Soft!',
    hero_p1_text: 'In the past, orders, stock, and finances were recorded in notebooks and calculators.',
    hero_p1_emphasis: 'now anyone can',
    hero_p1_end: 'run a printing business with a tidy accounting system!',
    hero_p2: 'Automatic invoices & delivery notes, purchase orders, raw material stock, receivables & payables, paper price calculation, profit & loss reports, down to POS sales reports — all neatly recorded in one app.',
    hero_trust1: 'No contract binding',
    hero_trust2: 'Cancel anytime, no conditions',
    hero_trust3: 'Subscribe for just 1 month',
    hero_trust4: 'No penalty',
    hero_cta1: 'Subscribe Now — Free 3 Days!',
    hero_cta2: 'View Pricing Plans',
    hero_p3: 'Start free, no credit card. Stop anytime, no penalty.',

    hero_inv_title: 'INVOICE',
    hero_inv_no: '#INV-2026-0042',
    hero_inv_status: 'PAID',
    hero_inv_item1: 'Cake Box 12×16',
    hero_inv_qty1: '500 pcs',
    hero_inv_price1: 'Rp 3,500,000',
    hero_inv_item2: 'Paperbowl 750ml',
    hero_inv_qty2: '1,000 pcs',
    hero_inv_price2: 'Rp 2,800,000',
    hero_inv_item3: 'Sticker Label',
    hero_inv_qty3: '200 pcs',
    hero_inv_price3: 'Rp 450,000',
    hero_inv_total: 'Total',
    hero_inv_total_val: 'Rp 6,750,000',
    hero_inv_chip1: 'Delivery Note',
    hero_inv_chip2: 'Stock',
    hero_inv_chip3: 'Receivables',
    hero_alt_printing: 'Packaging Printing Machine',
    hero_badge_hitung_cepat: 'Invoice Ready',
    hero_badge_hitung_cepat_val: '< 1 Minute',
    hero_badge_profit_naik: 'Profit & Loss',
    hero_badge_profit_naik_val: 'Real-Time',

    stats_1_label: 'Active Users',
    stats_2_label: 'Satisfaction Rate',
    stats_3_label: 'Recorded Transactions',
    stats_4_label: 'Online Support',

    urg_badge: 'Limited Offer',
    urg_h2_1: "Don't Let Your Printing Business",
    urg_h2_2: 'Fall Apart',
    urg_h2_3: 'Due to Manual Bookkeeping!',
    urg_p: 'Subscribing to Darrell Soft is cheaper than one forgotten receivable or misrecorded stock!',
    urg_card1_title: 'Neat Records',
    urg_card1_desc: 'Invoices, delivery notes, and purchase orders are arranged automatically with sequential numbers. No more lost notes or double entries.',
    urg_card2_title: 'Cash Flow Visible',
    urg_card2_desc: 'Receivables & payables are clear every day. Know who to collect from and when supplier bills are due.',
    urg_card3_title: 'Instant Reports',
    urg_card3_desc: 'Profit & loss and POS sales reports appear in seconds. Make business decisions much faster!',
    urg_cta1: 'Yes, I Want to Try Free!',
    urg_cta2: 'Ask Admin First',
    urg_p_below: 'Just 3 seconds to register, ready to use right away.',

    fitur_badge: 'Key Features',
    fitur_h2_1: '12 Accounting Features',
    fitur_h2_2: 'in One App',
    fitur_p: 'From creating invoices to financial reports — everything a printing business needs, in one powerful app.',
    fitur_card1_title: 'Create Invoices',
    fitur_card1_desc: 'Create professional invoices in seconds. Automatic numbering, customer data saved, ready to print and send.',
    fitur_card2_title: 'Delivery Notes',
    fitur_card2_desc: 'Delivery notes automatically follow the invoice. Goods leave, shipments are neatly recorded without manual notes.',
    fitur_card3_title: 'Purchase Order',
    fitur_card3_desc: 'Record purchase orders to suppliers neatly. Qty, price, and incoming goods are always under control.',
    fitur_card4_title: 'Raw Material Stock',
    fitur_card4_desc: 'Paper & material stock adjusts automatically with every transaction. No more sudden stock-outs.',
    fitur_card5_title: 'Accounts Receivable',
    fitur_card5_desc: "Track customer invoices that haven't been paid. Know who hasn't settled — no more forgotten receivables.",
    fitur_card6_title: 'Accounts Payable',
    fitur_card6_desc: 'Record supplier debts with their due dates. Pay on time and keep supplier relationships safe.',
    fitur_card7_title: 'Paper Price Calculation',
    fitur_card7_desc: 'Type the size & paper type, the base cost appears instantly. The foundation of accurate, profitable selling prices.',
    fitur_card8_title: 'Profit & Loss Report',
    fitur_card8_desc: "Profit & loss is calculated automatically from all transactions. Know if you're profitable without manual spreadsheets.",
    fitur_card9_title: 'POS Sales Report',
    fitur_card9_desc: 'Connected with the POS cashier. Daily sales, best-selling products, and revenue presented completely.',
    fitur_card10_title: 'Paper Cutting Calculation',
    fitur_card10_desc: "Enter the cut size & order quantity, sheet requirements and costs appear instantly. No more miscalculated cuts.",
    fitur_card11_title: 'Printing Cost Calculation',
    fitur_card11_desc: 'Calculate printing costs per order with complete details. Large or small quantities, the price per piece comes out automatically.',
    fitur_card12_title: 'Finishing Calculation',
    fitur_card12_desc: 'Lamination, binding, folding and more — just pick what you need. Finishing costs per order are calculated automatically and accurately.',

    keunggulan_badge: 'Why Darrell Soft?',
    keunggulan_h2_1: 'Fast, Accurate,',
    keunggulan_h2_2: 'and Flexible!',
    keunggulan_p: 'Accessible via Desktop or Mobile, anytime and anywhere.',
    adv1_title: 'Desktop Access',
    adv1_desc: 'Full view comfortable for office or shop use. All accounting features available.',
    adv2_title: 'Mobile Access',
    adv2_desc: 'Mobile-friendly! Check invoices, stock, and profit & loss directly from your smartphone, wherever you are.',
    adv3_title: 'High Speed',
    adv3_desc: 'All calculations are instant. From creating invoices to profit & loss reports, done in seconds.',
    adv4_title: 'Secure Data',
    adv4_desc: 'Your business data is stored safely. Automatic backup and encryption for maximum security.',
    adv5_title: 'Install on Windows & Mac',
    adv5_desc: 'Can be installed directly on Windows computers and MacBooks. Looks like a native desktop app.',
    adv6_title: 'Install on Android & iOS',
    adv6_desc: 'Install directly on Android phones and iPhones. Easy to use, no need to open a browser.',

    kenapa_badge: 'Why Subscribe?',
    kenapa_h2_1: 'Data Safe in the',
    kenapa_h2_2: 'Cloud,',
    kenapa_h2_3: 'Access from',
    kenapa_h2_4: 'Anywhere',
    kenapa_p: 'Darrell Soft is cloud-based — your business data is stored securely and accessible anytime, anywhere, as long as there is internet.',

    cloud1_title: 'Data Safe in Cloud, Never Lost!',
    cloud1_b1_pre: 'Phone lost/laptop broken?',
    cloud1_b1_bold: 'Data stays safe',
    cloud1_b1_post: 'in encrypted cloud server',
    cloud1_b2_pre: 'Login from any device,',
    cloud1_b2_bold: 'data is right there complete and intact',

    cloud2_title: 'Open from Anywhere — Domestic & Abroad!',
    cloud2_b1_pre: 'Jakarta, Surabaya, or abroad —',
    cloud2_b1_bold: 'as long as there is internet, business keeps running',
    cloud2_b2_pre: 'Phone while traveling,',
    cloud2_b2_bold: 'laptop at the office',
    cloud2_b2_post: '— all works!',

    cloud3_title: 'Phone & Laptop, All Work!',
    cloud3_b1_bold: 'One account, all devices',
    cloud3_b1_post: 'synced in real-time',
    cloud3_b2_pre: 'Update on phone,',
    cloud3_b2_bold: 'instantly appears on laptop',
    cloud3_b2_post: '— and vice versa',

    cloud4_title: 'Why Pay? Small Investment, Big Results!',
    cloud4_b1_pre: 'Only',
    cloud4_b1_bold: 'Rp 128,000/month',
    cloud4_b1_post: '— cheaper than one wrong calculation!',
    cloud4_b2_bold: 'No need to pay for server, IT, or maintenance',
    cloud4_b2_post: '— we handle everything',

    golden_badge: 'Golden Opportunity',
    golden_h3_1: 'Food SMEs Are Many Already...',
    golden_h3_2: 'But Printing Bosses Are Still Few!',
    golden_fakta: 'The Fact',
    golden_fakta_p_pre: 'Food SMEs already',
    golden_fakta_p_bold1: 'in the millions',
    golden_fakta_p_mid: ', but every SME needs',
    golden_fakta_p_bold2: 'boxes, packaging, stickers, brochures',
    golden_fakta_p_post: ' — all printed products!',
    golden_artinya: 'Meaning',
    golden_artinya_p_pre: 'The opportunity for printing bosses is still',
    golden_artinya_p_bold1: 'very huge',
    golden_artinya_p_mid: ". People are afraid because they can't manage finances —",
    golden_artinya_p_bold2: 'Darrell Soft removes that barrier!',
    golden_stat1_val: '64 Million+',
    golden_stat1_label: 'SMEs in Indonesia',
    golden_stat2_val: 'Few',
    golden_stat2_label: 'Printing Entrepreneurs',
    golden_stat3_val: 'Big Opportunity!',
    golden_stat3_label: 'Become a Printing Boss',
    golden_cta1: 'Become a Printing Boss!',
    golden_cta2: 'Free Consultation',
    golden_quote: 'SMEs must level up! From just selling, to becoming entrepreneurs with systems.',

    cara_badge: 'How It Works',
    cara_h2_1: 'As Easy as',
    cara_step1_title: 'Create Invoice & Delivery Note',
    cara_step1_desc: 'Order came in? Create an invoice in seconds — the delivery note is automatically ready.',
    cara_step2_title: 'Transactions Auto-Recorded',
    cara_step2_desc: 'Raw material stock, receivables, and payables adjust themselves with every transaction.',
    cara_step3_title: 'See Reports & Profit',
    cara_step3_desc: 'Profit & loss and POS sales reports appear in real-time. Sharper business decisions.',

    harga_badge: 'Pricing',
    harga_h2_1: 'Choose Your',
    harga_h2_2: 'Best',
    harga_h2_3: 'Plan',
    harga_p: 'Start for free, or subscribe for full features.',
    price_popular_badge: 'Best Value!',
    price_btn: 'Choose Plan',

    price_economis_title: 'Monthly Economy',
    price_economis_desc: '1 account, economical for beginners',
    price_economis_period: 'per month',
    price_economis_f1: '1 user account',
    price_economis_f2: 'Create invoices & delivery notes',
    price_economis_f3: 'Automatic paper price calculation',
    price_economis_f4: 'Raw material stock',
    price_economis_f5: 'Desktop & Mobile Access',
    price_economis_f6_bold: 'Can subscribe for just 1 month',
    price_economis_f7: 'No penalty fees whatsoever',

    price_bulanan_title: 'Monthly Subscription',
    price_bulanan_desc: 'Monthly subscription, very flexible',
    price_bulanan_period: 'per month',
    price_bulanan_f1: '2 accounts for a team',
    price_bulanan_f2: 'All complete accounting features',
    price_bulanan_f3: 'Receivables & payables',
    price_bulanan_f4: 'Profit & loss report',
    price_bulanan_f5: 'Desktop & Mobile Access',
    price_bulanan_f6_bold: 'Can subscribe for just 1 month',
    price_bulanan_f7: 'No penalty fees whatsoever',

    price_tahunan_title: 'Annual Subscription',
    price_tahunan_desc: 'Only Rp 74,000/month',
    price_tahunan_desc_extra: '— save 37%!',
    price_tahunan_period: 'per year',
    price_tahunan_f1: '3 accounts for a group',
    price_tahunan_f2: 'All complete accounting features',
    price_tahunan_f3: 'POS sales reports',
    price_tahunan_f4: 'Purchase orders & material stock',
    price_tahunan_f5: 'Desktop & Mobile Access',
    price_tahunan_f6: 'Priority 24/7 Support',
    price_tahunan_f7: 'Complete profit & loss reports',
    price_tahunan_f8: 'Automatic data backup',

    price_guarantee: 'No Binding Commitment! Cancel anytime without penalty.',

    testimoni_badge: 'Testimonials',
    testimoni_h2_1: 'Trusted by',
    testimoni_h2_2: 'Thousands of',
    testimoni_h2_3: 'Printing Entrepreneurs',
    testi1_name: 'Maman',
    testi1_role: 'Owner of Tunas Makmur',
    testi1_quote: 'I used to create invoices and collect receivables manually, some were forgotten. Now everything is automatic and neat. Profit & loss is just one tap away!',
    testi2_name: 'Jimmy',
    testi2_role: 'Owner of SiPrint',
    testi2_quote: "The app is super easy to use. Even I, who don't understand accounting, can use it right away. The package price is also very affordable.",
    testi3_name: 'Lina Listiawati',
    testi3_role: 'Owner of Rajabowl',
    testi3_quote: 'The support is very responsive! Every question is answered immediately. Darrell Soft is indeed the right solution for printing.',
    testi4_name: 'Gunawan',
    testi4_role: 'Owner of One Printing',
    testi4_quote: 'Pay for just 1 month, no need for the next, no penalty. Like a Netflix subscription. Super flexible!',

    cta_h2_1: "Don't Wait Anymore!",
    cta_h2_2: 'Start',
    cta_h2_3: 'Subscribing',
    cta_h2_4: 'Now',
    cta_p: 'Your competitors are already using Darrell Soft. They create invoices in seconds and know their profit & loss every day — while you still write everything manually?',
    cta_trust1: 'Free 3-day trial',
    cta_trust2: 'No credit card',
    cta_trust3: 'Cancel anytime',
    cta_card_h3: 'Only Rp 128,000/month — Cheaper Than One Forgotten Receivable!',
    cta_card_p_pre: 'Imagine:',
    cta_card_p_bold1: 'one forgotten receivable or misrecorded stock can cost you hundreds of thousands to millions of rupiah',
    cta_card_p_mid: '. With Darrell Soft, all transactions are neatly recorded for only Rp 128,000/month. ',
    cta_card_p_bold2: 'Small investment, big profit!',
    cta_card_check1_bold: 'No contract',
    cta_card_check1_post: ' — free to stop anytime',
    cta_card_check2_bold: 'No penalty',
    cta_card_check2_post: ' — no hidden fees',
    cta_card_check3_bold: 'Try free for 3 days',
    cta_card_check3_post: ' — prove it first!',
    cta_card_btn1: 'Subscribe Now — Free!',
    cta_card_btn2: 'Ask Admin First',
    cta_card_p_bottom: 'Trusted by 7,000+ printing entrepreneurs in Indonesia',
    cta_reassure: 'Still unsure? Chat our admin, free consultation with no obligation to subscribe.',

    faq_badge: 'FAQ',
    faq_h2_1: 'Frequently',
    faq_h2_2: 'Asked Questions',
    faq1_q: 'Can I try it first before subscribing?',
    faq1_a: 'Of course! We provide a free trial period so you can experience all Darrell Soft features — invoices, material stock, profit & loss, and more — before deciding to subscribe.',
    faq2_q: 'How do I subscribe?',
    faq2_a: 'Very easy! Just DM us, choose the suitable plan, and make the payment. Your account will be activated immediately.',
    faq3_q: 'Is my data safe?',
    faq3_a: 'Yes! Your data is protected with encryption and automatic backup. Privacy and data security are our top priorities.',
    faq4_q: 'Can I stop subscribing anytime?',
    faq4_a: 'Of course! No contract binding. You can stop anytime without penalty or additional fees.',

    footer_brand_desc: 'Accounting app for printing businesses: create invoices & delivery notes, manage purchase orders and raw material stock, track receivables & payables, down to profit & loss and POS sales reports.',
    footer_nav_title: 'Navigation',
    footer_nav_fitur: 'Features',
    footer_nav_harga: 'Pricing',
    footer_nav_testimoni: 'Testimonials',
    footer_nav_faq: 'FAQ',
    footer_contact_title: 'Contact Us',
    footer_bottom_rights: 'All rights reserved.',
    footer_encrypted: 'Encrypted Data',
    footer_secure: 'Secure Connection',
  },
} as const


export default function Home() {
  const { language } = useLanguage()
  const t = LANDING_T[language]

  const router = useRouter();

  // Auto-login: user yang sudah punya sesi (pernah login) langsung dibawa ke
  // Beranda — landing page tidak ditampilkan. Pemeriksaan sinkron dari
  // localStorage + cookie, jadi bekerja juga saat offline.
  // FIX: cukup SALAH SATU penanda sesi (localStorage ATAU cookie) — dulu
  // mewajibkan keduanya sehingga user bisa terjebak di landing ketika browser
  // menghapus cookie tetapi localStorage masih ada (atau sebaliknya). Server
  // mengautentikasi dari cookie ATAU header (x-user-id), jadi salah satunya
  // saja sudah cukup untuk dianggap login.
  // Overlay menutupi landing selama pemeriksaan agar tidak ada kedipan.
  const [authChecking, setAuthChecking] = useState(true);
  useEffect(() => {
    try {
      let hasAuth = false;
      try {
        hasAuth = !!JSON.parse(localStorage.getItem('auth') || 'null')?.id;
      } catch {}
      const hasCookie = /(?:^|;\s*)userId=/.test(document.cookie);
      if (hasAuth || hasCookie) {
        router.replace('/pembukaan');
        return;
      }
    } catch {}
    setAuthChecking(false);
  }, [router]);

  // FAQ accordion: item yang terbuka (null = semua tertutup). Item pertama
  // terbuka secara default — mengikuti perilaku produksi.
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const goToLogin = (tab?: string) => {
    router.push(tab ? `/login?tab=${tab}` : '/login');
  };

  const openPayment = (pkgType: string) => {
    router.push(`/checkout?plan=${pkgType}`);
  };

  // Hero visual panel: mock invoice akuntansi + mesin cetak dengan badge
  // mengambang. Di mobile tampil inline setelah H1; di desktop di kolom kanan.
  const heroImagePanel = (
    <div className="relative">
      <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-emerald-600/10 border border-emerald-50 dark:border-white/10 p-3 sm:p-4 -ml-3 sm:-ml-4 md:ml-0 bg-gradient-to-br from-emerald-50/50 to-white dark:from-slate-900/50 dark:to-slate-950">
        {/* Mock Invoice */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="relative rounded-xl bg-white dark:bg-slate-900 shadow-md border border-gray-100 dark:border-white/10 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-gray-100 tracking-tight leading-none">{t.hero_inv_title}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{t.hero_inv_no}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/60 dark:border-emerald-900/60 px-2 py-1 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
              <CircleCheck className="w-3 h-3" /> {t.hero_inv_status}
            </span>
          </div>

          <div className="my-3 h-px bg-gray-100 dark:bg-white/10" />

          <ul className="space-y-2">
            {[
              { name: t.hero_inv_item1, qty: t.hero_inv_qty1, price: t.hero_inv_price1 },
              { name: t.hero_inv_item2, qty: t.hero_inv_qty2, price: t.hero_inv_price2 },
              { name: t.hero_inv_item3, qty: t.hero_inv_qty3, price: t.hero_inv_price3 },
            ].map((row, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{row.name}</span>
                <span className="text-gray-400 shrink-0">{row.qty}</span>
                <span className="font-bold text-gray-900 dark:text-gray-100 shrink-0">{row.price}</span>
              </li>
            ))}
          </ul>

          <div className="my-3 h-px bg-gray-100 dark:bg-white/10" />

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">{t.hero_inv_total}</span>
            <span className="text-sm sm:text-base font-extrabold bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.hero_inv_total_val}</span>
          </div>

          {/* Chips fitur terkait invoice */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[t.hero_inv_chip1, t.hero_inv_chip2, t.hero_inv_chip3].map((chip, i) => (
              <span key={i} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100/70 dark:border-emerald-900/50 px-1 py-1.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300 text-center leading-tight">
                <CircleCheck className="w-3 h-3 shrink-0" /> {chip}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Mesin cetak — di bawah mock invoice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="mt-2.5 sm:mt-3 relative rounded-xl overflow-hidden shadow-md border border-gray-100 dark:border-white/10 bg-white dark:bg-slate-800"
        >
          <img
            src="/hero-printing.png"
            alt={t.hero_alt_printing}
            className="w-full h-32 sm:h-44 md:h-48 object-cover transition-transform duration-500 hover:scale-105"
          />
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          {/* Badge Invoice Jadi — di kanan atas gambar mesin cetak */}
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute top-2 right-2 md:top-3 md:right-3 bg-white/95 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow-xl p-1.5 md:p-2.5 border border-white/40 dark:border-white/10 z-10"
          >
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-7 h-7 md:w-9 md:h-9 rounded-md bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[9px] md:text-[11px] text-gray-600 dark:text-gray-300 leading-none">{t.hero_badge_hitung_cepat}</p>
                <p className="text-xs md:text-base font-bold text-emerald-700 dark:text-emerald-400 leading-tight">{t.hero_badge_hitung_cepat_val}</p>
              </div>
            </div>
          </motion.div>
          {/* Badge Laba Rugi — di kiri bawah gambar mesin cetak */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute bottom-2 left-2 md:bottom-3 md:left-3 bg-white/95 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow-xl p-1.5 md:p-2.5 border border-white/40 dark:border-white/10 z-10"
          >
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-7 h-7 md:w-9 md:h-9 rounded-md bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[9px] md:text-[11px] text-gray-600 dark:text-gray-300 leading-none">{t.hero_badge_profit_naik}</p>
                <p className="text-xs md:text-base font-bold text-emerald-600 dark:text-emerald-400 leading-tight">{t.hero_badge_profit_naik_val}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-black dark:via-black dark:to-black">
      {/* Overlay: sembunyikan landing saat masih memeriksa sesi (mencegah
          landing berkedip sebelum redirect otomatis ke Beranda) */}
      {authChecking && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[300] bg-white dark:bg-black"
        />
      )}

      {/* =================== NAVBAR =================== */}
      <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
            <img src="/logo-ds.png" alt="Logo" className="w-8 h-8 md:w-9 md:h-9 rounded-xl object-contain shadow-none shrink-0" />
            <span className="hidden min-[360px]:inline text-[15px] md:text-[22px] tracking-tight text-emerald-900 dark:text-emerald-300 whitespace-nowrap" style={{ fontWeight: 900 }}>
              darrellsoft.com
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#fitur" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t.nav_fitur}</a>
            <a href="#kenapa-langganan" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t.nav_kenapa}</a>
            <a href="#harga" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t.nav_harga}</a>
            <a href="#testimoni" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t.nav_testimoni}</a>
            <div className="flex items-center gap-0.5">
              <LanguageToggle />
              <ThemeToggle className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10" />
            </div>
            <Button onClick={() => goToLogin()} className="ripple-btn bg-gradient-to-r from-emerald-600 to-teal-400 hover:from-emerald-700 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 transition-all duration-300">
              {t.nav_login} <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          {/* Mobile: Masuk button + theme toggle + language toggle instead of hamburger */}
          <div className="md:hidden flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5">
              <LanguageToggle compact />
              <ThemeToggle className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10" />
            </div>
            <Button onClick={() => goToLogin()} className="ripple-btn bg-gradient-to-r from-emerald-600 to-teal-400 hover:from-emerald-700 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 transition-all duration-300 text-xs px-2.5 py-1.5 h-8 whitespace-nowrap">
              {t.nav_login} <ChevronRight className="ml-1 w-3 h-3" />
            </Button>
          </div>
        </div>

      </nav>

      {/* =================== HERO =================== */}
      <section className="relative w-full overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-emerald-100/30 dark:bg-emerald-900/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-100/20 dark:bg-emerald-900/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-16 md:pb-24">
          {/* Section title — centered, close to the Darrellsoft navbar banner */}
          <FadeIn direction="down" delay={0.05}>
            <div className="flex justify-center mb-5 md:mb-8 px-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 dark:border-emerald-900/60 bg-white/80 dark:bg-white/5 backdrop-blur px-4 py-2 text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-300 shadow-sm shadow-emerald-600/5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 animate-pulse" aria-hidden="true" />
                {t.hero_badge}
              </span>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
            {/* Left - Text */}
            <FadeIn direction="right">
              <div className="flex flex-col gap-6">
                <h1 className="text-gray-900 dark:text-gray-100 leading-[1.1] tracking-tight text-[33.67px] md:text-[43.67px] lg:text-[55.67px]" style={{ fontWeight: 900 }}>
                  <span style={{ fontWeight: 900 }}>{t.hero_h1_1}{' '}</span>
                  <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent" style={{ fontWeight: 900 }}>{t.hero_h1_2}</span>{' '}
                  <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent" style={{ fontWeight: 900 }}>{t.hero_h1_3}</span>
                </h1>

                {/* Mobile: show images right after H1 (below the "Hampers" text) */}
                <div className="md:hidden">{heroImagePanel}</div>

                <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{t.hero_p1_bold1}</span><br />
                  <span className="font-bold text-gray-900 dark:text-gray-100">{t.hero_p1_bold2}</span>.<br />
                  {t.hero_p1_text}
                  {' '}<span className="font-semibold text-emerald-700 dark:text-emerald-400">{t.hero_p1_emphasis}</span>{' '}{t.hero_p1_end}
                </p>

                <p className="text-base text-gray-500 dark:text-gray-500 leading-relaxed">
                  {t.hero_p2}
                </p>

                {/* Trust signals */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                  <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 px-3.5 py-2.5">
                    <Shield className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.hero_trust1}</span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 px-3.5 py-2.5">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.hero_trust2}</span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 px-3.5 py-2.5">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.hero_trust3}</span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 px-3.5 py-2.5">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.hero_trust4}</span>
                  </div>
                </div>

                {/* Hero CTA — Primary */}
                <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
                  <Button
                    onClick={() => goToLogin('register')}
                    className="ripple-btn cta-glow rounded-xl bg-gradient-to-r from-emerald-600 to-teal-400 hover:from-emerald-500 hover:to-teal-300 hover:brightness-105 active:scale-[0.98] text-white shadow-lg shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/30 transition-all duration-300 text-sm font-bold py-3 px-5"
                  >
                    {t.hero_cta1} <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('harga')?.scrollIntoView({ behavior: 'smooth' })}
                    className="ripple-btn rounded-xl border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-500 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-900/30 font-bold transition-all duration-300 active:scale-[0.98] text-sm py-3 px-5"
                  >
                    {t.hero_cta2}
                  </Button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.hero_p3}</p>
              </div>
            </FadeIn>

            {/* Right - Hero image grid (food boxes) — desktop only (mobile shows it inline after H1) */}
            <FadeIn direction="left" delay={0.2} className="md:pt-[171px] hidden md:block">
              {heroImagePanel}
            </FadeIn>
          </div>
        </div>
      </section>

      {/* =================== STATS BAR =================== */}
      <section className="w-full bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-950 py-10 md:py-14 border-y border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-white/10">
            {[
              { value: 7168, suffix: '+', label: t.stats_1_label, icon: Printer },
              { value: 98, suffix: '%', label: t.stats_2_label, icon: Star },
              { value: 168800, suffix: '+', label: t.stats_3_label, icon: Receipt },
              { value: 24, suffix: '/7', label: t.stats_4_label, icon: Shield },
            ].map((stat, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="flex flex-col items-center text-center md:px-6">
                  <stat.icon className="w-5 h-5 text-teal-400/80 mb-2.5" />
                  <p className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">
                    <CountUp end={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mt-1.5">{stat.label}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* =================== AJAKAN BERLANGGANAN (URGENCY) =================== */}
      <section className="w-full py-16 md:py-24 relative overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-8 relative z-10">
          <FadeIn>
            <div className="text-center mb-10 md:mb-14">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 backdrop-blur px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300 mb-5">
                <Zap className="w-3.5 h-3.5" /> {t.urg_badge}
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-[1.12] tracking-tight">
                {t.urg_h2_1}<br className="hidden md:block" />{' '}
                <span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">{t.urg_h2_2}</span>{' '}
                {t.urg_h2_3}
              </h2>
              <p className="text-slate-300/90 mt-5 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                {t.urg_p}
              </p>
            </div>
          </FadeIn>

          {/* Value Proposition Cards */}
          <div className="grid md:grid-cols-3 gap-4 md:gap-5 mb-10">
            <FadeIn delay={0}>
              <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl p-6 border border-white/10 text-center hover:bg-white/[0.09] hover:-translate-y-1 transition-all duration-300 h-full">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-950/50 mb-4">
                  <ClipboardList className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1.5 tracking-tight">{t.urg_card1_title}</h3>
                <p className="text-slate-300/90 text-sm leading-relaxed">{t.urg_card1_desc}</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl p-6 border border-white/10 text-center hover:bg-white/[0.09] hover:-translate-y-1 transition-all duration-300 h-full">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-950/50 mb-4">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1.5 tracking-tight">{t.urg_card2_title}</h3>
                <p className="text-slate-300/90 text-sm leading-relaxed">{t.urg_card2_desc}</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl p-6 border border-white/10 text-center hover:bg-white/[0.09] hover:-translate-y-1 transition-all duration-300 h-full">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-950/50 mb-4">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1.5 tracking-tight">{t.urg_card3_title}</h3>
                <p className="text-slate-300/90 text-sm leading-relaxed">{t.urg_card3_desc}</p>
              </div>
            </FadeIn>
          </div>

          {/* Dual CTA */}
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-3.5 justify-center mb-5">
              <Button
                onClick={() => goToLogin('register')}
                className="ripple-btn cta-glow rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 hover:brightness-105 active:scale-[0.98] text-white text-base font-bold py-6 px-8 shadow-xl shadow-emerald-600/30 ring-1 ring-white/20"
              >
                {t.urg_cta1} <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                asChild
                className="ripple-btn rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-6 px-8 transition-all duration-300 active:scale-[0.98]"
              >
                <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 w-5 h-5 text-teal-300" /> {t.urg_cta2}
                </a>
              </Button>
            </div>
            <p className="text-center text-slate-400 text-sm">{t.urg_p_below}</p>
          </FadeIn>
        </div>
      </section>

      {/* =================== FITUR =================== */}
      <Section id="fitur" className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-8 md:mb-10">
            <EyebrowBadge label={t.fitur_badge} />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              {t.fitur_h2_1}{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.fitur_h2_2}</span>
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-base md:text-lg leading-relaxed text-gray-600 dark:text-gray-400">
              {t.fitur_p}
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-4 md:gap-5">
          <FeatureCard
            icon={FileText}
            title={t.fitur_card1_title}
            desc={t.fitur_card1_desc}
            delay={0}
          />
          <FeatureCard
            icon={Truck}
            title={t.fitur_card2_title}
            desc={t.fitur_card2_desc}
            delay={0.15}
          />
          <FeatureCard
            icon={ShoppingCart}
            title={t.fitur_card3_title}
            desc={t.fitur_card3_desc}
            delay={0.3}
          />
          <FeatureCard
            icon={Boxes}
            title={t.fitur_card4_title}
            desc={t.fitur_card4_desc}
            delay={0}
          />
          <FeatureCard
            icon={HandCoins}
            title={t.fitur_card5_title}
            desc={t.fitur_card5_desc}
            delay={0.15}
          />
          <FeatureCard
            icon={CreditCard}
            title={t.fitur_card6_title}
            desc={t.fitur_card6_desc}
            delay={0.3}
          />
          <FeatureCard
            icon={Calculator}
            title={t.fitur_card7_title}
            desc={t.fitur_card7_desc}
            delay={0}
          />
          <FeatureCard
            icon={ChartColumn}
            title={t.fitur_card8_title}
            desc={t.fitur_card8_desc}
            delay={0.15}
          />
          <FeatureCard
            icon={Store}
            title={t.fitur_card9_title}
            desc={t.fitur_card9_desc}
            delay={0.3}
          />
          <FeatureCard
            icon={Scissors}
            title={t.fitur_card10_title}
            desc={t.fitur_card10_desc}
            delay={0}
          />
          <FeatureCard
            icon={Printer}
            title={t.fitur_card11_title}
            desc={t.fitur_card11_desc}
            delay={0.15}
          />
          <FeatureCard
            icon={Sparkles}
            title={t.fitur_card12_title}
            desc={t.fitur_card12_desc}
            delay={0.3}
          />
        </div>
      </Section>

      {/* =================== KEUNGGULAN =================== */}
      <Section id="keunggulan" className="bg-gradient-to-b from-emerald-50/30 to-white dark:from-black dark:to-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <EyebrowBadge label={t.keunggulan_badge} />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.keunggulan_h2_1}</span> {t.keunggulan_h2_2}
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-base md:text-lg leading-relaxed text-gray-600 dark:text-gray-400">
              {t.keunggulan_p}
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          {[
            {
              icon: Monitor,
              title: t.adv1_title,
              desc: t.adv1_desc,
            },
            {
              icon: Smartphone,
              title: t.adv2_title,
              desc: t.adv2_desc,
            },
            {
              icon: Zap,
              title: t.adv3_title,
              desc: t.adv3_desc,
            },
            {
              icon: Shield,
              title: t.adv4_title,
              desc: t.adv4_desc,
            },
            {
              icon: Download,
              title: t.adv5_title,
              desc: t.adv5_desc,
            },
            {
              icon: Smartphone,
              title: t.adv6_title,
              desc: t.adv6_desc,
            },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="advantage-tap group flex items-start gap-4 p-5 rounded-2xl bg-white dark:bg-[#111] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 dark:border-white/10 hover:border-emerald-100 dark:hover:border-white/20 cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-600/25 shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </Section>

      {/* =================== KENAPA HARUS LANGGANAN =================== */}
      <Section id="kenapa-langganan" className="bg-gradient-to-b from-teal-50/50 to-white dark:from-black dark:to-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <EyebrowBadge label={t.kenapa_badge} />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              {t.kenapa_h2_1} <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.kenapa_h2_2}</span>{' '}
              {t.kenapa_h2_3} <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.kenapa_h2_4}</span>
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-base md:text-lg leading-relaxed text-gray-600 dark:text-gray-400">
              {t.kenapa_p}
            </p>
          </div>
        </FadeIn>

        {/* ---- Bagian 1: 4 Cloud Advantage Cards ---- */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 mb-12">
          {/* Card 1: Data Aman di Cloud */}
          <FadeIn delay={0}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-white/10 hover:shadow-lg hover:-translate-y-1 hover:border-emerald-100 dark:hover:border-white/20 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-50 to-transparent dark:from-emerald-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-600/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Cloud className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">{t.cloud1_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t.cloud1_b1_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud1_b1_bold}</strong> {t.cloud1_b1_post}</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t.cloud1_b2_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud1_b2_bold}</strong></span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* Card 2: Bisa Buka di Mana Saja */}
          <FadeIn delay={0.1}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-white/10 hover:shadow-lg hover:-translate-y-1 hover:border-emerald-100 dark:hover:border-white/20 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-50 to-transparent dark:from-emerald-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-600/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">{t.cloud2_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t.cloud2_b1_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud2_b1_bold}</strong></span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t.cloud2_b2_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud2_b2_bold}</strong> {t.cloud2_b2_post}</span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* Card 3: HP & Laptop, Semua Bisa */}
          <FadeIn delay={0.2}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-white/10 hover:shadow-lg hover:-translate-y-1 hover:border-emerald-100 dark:hover:border-white/20 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-50 to-transparent dark:from-emerald-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-600/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Smartphone className="w-5 h-5 text-white mr-0.5" />
                  <Monitor className="w-4 h-4 text-white ml-0.5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">{t.cloud3_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong className="text-gray-900 dark:text-gray-100">{t.cloud3_b1_bold}</strong> {t.cloud3_b1_post}</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t.cloud3_b2_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud3_b2_bold}</strong> {t.cloud3_b2_post}</span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* Card 4: Kenapa Bayar? */}
          <FadeIn delay={0.3}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-white/10 hover:shadow-lg hover:-translate-y-1 hover:border-emerald-100 dark:hover:border-white/20 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-50 to-transparent dark:from-emerald-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-600/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Banknote className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">{t.cloud4_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t.cloud4_b1_pre} <strong className="text-emerald-600 dark:text-emerald-400">{t.cloud4_b1_bold}</strong> {t.cloud4_b1_post}</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong className="text-gray-900 dark:text-gray-100">{t.cloud4_b2_bold}</strong> {t.cloud4_b2_post}</span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>
        </div>

        {/* ---- Bagian 2: Kesempatan Emas Banner (panel CTA glass dot-pattern) ---- */}
        <FadeIn delay={0.3}>
          <div className="relative rounded-3xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 border border-amber-600/30 shadow-2xl shadow-amber-700/40 overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute -top-24 right-10 w-72 h-72 bg-yellow-200/40 rounded-full blur-3xl" />
              <div className="absolute -bottom-32 left-1/4 w-80 h-80 bg-amber-600/25 rounded-full blur-3xl" />
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(rgba(120,53,15,0.22) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
            </div>

            <div className="relative z-10 p-6 md:p-10">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-amber-950/10 backdrop-blur rounded-full px-4 py-1.5 border border-amber-800/25 mb-4">
                  <Crown className="w-4 h-4 text-amber-800" />
                  <span className="text-amber-950 font-bold text-[11px] uppercase tracking-[0.18em]">{t.golden_badge}</span>
                </div>
                <h3 className="text-2xl md:text-4xl font-extrabold text-amber-950 leading-tight tracking-tight">
                  {t.golden_h3_1}<br />
                  <span className="bg-gradient-to-r from-amber-950 to-amber-700 bg-clip-text text-transparent">{t.golden_h3_2}</span>
                </h3>
              </div>

              {/* Fakta & Artinya */}
              <div className="grid md:grid-cols-2 gap-4 md:gap-5 mb-8">
                <div className="bg-white/25 backdrop-blur-md rounded-2xl p-5 border border-amber-900/15">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-white/30 flex items-center justify-center shrink-0">
                      <ChartColumn className="w-4 h-4 text-amber-900" />
                    </div>
                    <h4 className="font-bold text-amber-950 text-base">{t.golden_fakta}</h4>
                  </div>
                  <p className="text-amber-950/80 text-sm leading-relaxed">
                    {t.golden_fakta_p_pre} <strong className="text-amber-900">{t.golden_fakta_p_bold1}</strong>{t.golden_fakta_p_mid} <strong className="text-amber-950">{t.golden_fakta_p_bold2}</strong>{t.golden_fakta_p_post}
                  </p>
                </div>
                <div className="bg-white/25 backdrop-blur-md rounded-2xl p-5 border border-amber-900/15">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-white/30 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-4 h-4 text-amber-900" />
                    </div>
                    <h4 className="font-bold text-amber-950 text-base">{t.golden_artinya}</h4>
                  </div>
                  <p className="text-amber-950/80 text-sm leading-relaxed">
                    {t.golden_artinya_p_pre} <strong className="text-amber-900">{t.golden_artinya_p_bold1}</strong>{t.golden_artinya_p_mid} <strong className="text-amber-950">{t.golden_artinya_p_bold2}</strong>
                  </p>
                </div>
              </div>

              {/* 3 Statistics Flow */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-5 mb-8">
                <FadeIn delay={0.4}>
                  <div className="bg-white/25 backdrop-blur-md rounded-2xl px-6 py-4 border border-amber-900/15 text-center min-w-[170px]">
                    <p className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-950 to-amber-700 bg-clip-text text-transparent">{t.golden_stat1_val}</p>
                    <p className="text-amber-800 text-sm mt-1">{t.golden_stat1_label}</p>
                  </div>
                </FadeIn>
                <ArrowRight className="hidden md:block w-5 h-5 text-amber-900/40" />
                <ArrowDown className="md:hidden w-5 h-5 text-amber-900/40" />
                <FadeIn delay={0.5}>
                  <div className="bg-white/25 backdrop-blur-md rounded-2xl px-6 py-4 border border-amber-900/15 text-center min-w-[170px]">
                    <p className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-950 to-amber-700 bg-clip-text text-transparent">{t.golden_stat2_val}</p>
                    <p className="text-amber-800 text-sm mt-1">{t.golden_stat2_label}</p>
                  </div>
                </FadeIn>
                <ArrowRight className="hidden md:block w-5 h-5 text-amber-900/40" />
                <ArrowDown className="md:hidden w-5 h-5 text-amber-900/40" />
                <FadeIn delay={0.6}>
                  <div className="bg-white/25 backdrop-blur-md rounded-2xl px-6 py-4 border border-amber-900/15 text-center min-w-[170px]">
                    <p className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-950 to-amber-700 bg-clip-text text-transparent">{t.golden_stat3_val}</p>
                    <p className="text-amber-800 text-sm mt-1">{t.golden_stat3_label}</p>
                  </div>
                </FadeIn>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3.5 justify-center mb-7">
                <Button
                  onClick={() => goToLogin('register')}
                  className="ripple-btn cta-glow rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 hover:brightness-105 active:scale-[0.98] text-white text-base font-bold py-6 px-8 shadow-xl shadow-emerald-600/30 ring-1 ring-white/20"
                >
                  <Crown className="mr-2 w-5 h-5" /> {t.golden_cta1} <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  asChild
                  className="ripple-btn rounded-xl bg-amber-950/10 hover:bg-amber-950/20 border border-amber-900/25 text-amber-950 font-bold py-6 px-8 transition-all duration-300 active:scale-[0.98]"
                >
                  <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 w-5 h-5 text-amber-900" /> {t.golden_cta2}
                  </a>
                </Button>
              </div>

              {/* Quote penutup */}
              <div className="text-center">
                <blockquote className="text-amber-950/90 text-base md:text-lg italic font-medium max-w-2xl mx-auto leading-relaxed">
                  &ldquo;{t.golden_quote}&rdquo;
                </blockquote>
                <div className="w-16 h-1 bg-gradient-to-r from-amber-700 to-amber-950 mx-auto mt-4 rounded-full" />
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* =================== CARA KERJA =================== */}
      <Section className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <EyebrowBadge label={t.cara_badge} />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              {t.cara_h2_1}{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">1-2-3</span>
            </h2>
          </div>
        </FadeIn>

        <div className="relative grid md:grid-cols-3 gap-10 md:gap-8 max-w-4xl mx-auto">
          <div aria-hidden="true" className="hidden md:block absolute top-6 left-[16.666%] right-[16.666%] h-0.5 bg-gradient-to-r from-emerald-600/15 via-teal-400/50 to-emerald-600/15" />
          {[
            { step: '1', title: t.cara_step1_title, desc: t.cara_step1_desc, icon: FileText },
            { step: '2', title: t.cara_step2_title, desc: t.cara_step2_desc, icon: Boxes },
            { step: '3', title: t.cara_step3_title, desc: t.cara_step3_desc, icon: ChartColumn },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15}>
              <div className="relative flex flex-col items-center text-center">
                <div className="relative z-10 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-teal-400 flex items-center justify-center text-white text-lg font-extrabold shadow-lg shadow-emerald-600/30 ring-8 ring-white dark:ring-black">
                  {item.step}
                </div>
                <div className="mt-5 w-full rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111] shadow-sm hover:shadow-lg hover:shadow-emerald-600/10 hover:-translate-y-1 transition-all duration-300 p-6">
                  <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center mb-3">
                    <item.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </Section>

      {/* =================== HARGA =================== */}
      <Section id="harga" className="bg-gradient-to-b from-[#3f0d14] via-[#800020] to-[#3f0d14]">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <EyebrowBadge label={t.harga_badge} dark />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-white">
              {t.harga_h2_1}{' '}
              <span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">{t.harga_h2_2}</span>{' '}
              {t.harga_h2_3}
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-base md:text-lg leading-relaxed text-slate-400">
              {t.harga_p}
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 max-w-6xl mx-auto">
          <PricingCard
            title={t.price_economis_title}
            price="Rp 78.000"
            period={t.price_economis_period}
            description={t.price_economis_desc}
            buttonLabel={t.price_btn}
            features={[
              t.price_economis_f1,
              t.price_economis_f2,
              t.price_economis_f3,
              t.price_economis_f4,
              t.price_economis_f5,
              <span key="bold" className="font-bold">{t.price_economis_f6_bold}</span>,
              t.price_economis_f7,
            ]}
            delay={0}
            onSelect={() => openPayment('bulanan-ekonomis')}
          />
          <PricingCard
            title={t.price_bulanan_title}
            price="Rp 128.000"
            period={t.price_bulanan_period}
            description={t.price_bulanan_desc}
            buttonLabel={t.price_btn}
            features={[
              t.price_bulanan_f1,
              t.price_bulanan_f2,
              t.price_bulanan_f3,
              t.price_bulanan_f4,
              t.price_bulanan_f5,
              <span key="bold" className="font-bold">{t.price_bulanan_f6_bold}</span>,
              t.price_bulanan_f7,
            ]}
            delay={0}
            onSelect={() => openPayment('bulanan')}
          />
          <PricingCard
            title={t.price_tahunan_title}
            price="Rp 888.000"
            period={t.price_tahunan_period}
            description={t.price_tahunan_desc}
            descriptionExtra={t.price_tahunan_desc_extra}
            popular
            popularLabel={t.price_popular_badge}
            buttonLabel={t.price_btn}
            features={[
              t.price_tahunan_f1,
              t.price_tahunan_f2,
              t.price_tahunan_f3,
              t.price_tahunan_f4,
              t.price_tahunan_f5,
              t.price_tahunan_f6,
              t.price_tahunan_f7,
              t.price_tahunan_f8,
            ]}
            delay={0.15}
            onSelect={() => openPayment('tahunan')}
          />
        </div>

        {/* Guarantee */}
        <FadeIn delay={0.3}>
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-6 py-3">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">
                {t.price_guarantee}
              </span>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* =================== TESTIMONI =================== */}
      <Section id="testimoni" className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <EyebrowBadge label={t.testimoni_badge} />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              {t.testimoni_h2_1}{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.testimoni_h2_2}</span> {t.testimoni_h2_3}
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
          <TestimonialCard
            name={t.testi1_name}
            role={t.testi1_role}
            quote={t.testi1_quote}
            avatar="M"
            delay={0}
          />
          <TestimonialCard
            name={t.testi2_name}
            role={t.testi2_role}
            quote={t.testi2_quote}
            avatar="J"
            delay={0.15}
          />
          <TestimonialCard
            name={t.testi3_name}
            role={t.testi3_role}
            quote={t.testi3_quote}
            avatar="LL"
            delay={0.3}
          />
          <TestimonialCard
            name={t.testi4_name}
            role={t.testi4_role}
            quote={t.testi4_quote}
            avatar="GP"
            delay={0.45}
          />
        </div>
      </Section>

      {/* =================== CTA FINAL (STRONG) =================== */}
      <section className="w-full py-16 md:py-24 px-4 md:px-8 bg-white dark:bg-black">
        <FadeIn>
          <div className="relative max-w-5xl mx-auto rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-600 shadow-2xl shadow-emerald-600/25 overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute -top-24 -right-16 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-28 -left-20 w-80 h-80 bg-emerald-400/20 rounded-full blur-3xl" />
              <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            </div>

            <div className="relative z-10 px-5 py-12 md:p-14">
              <div className="text-center mb-8">
                <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
                  {t.cta_h2_1}<br className="hidden md:block" />{' '}
                  {t.cta_h2_2} <span className="underline decoration-teal-300/60 decoration-4 underline-offset-8">{t.cta_h2_3}</span> {t.cta_h2_4}
                </h2>
                <p className="text-emerald-50/90 mt-5 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                  {t.cta_p}
                </p>
              </div>

              {/* Trust Badges */}
              <FadeIn delay={0.15}>
                <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20 justify-center">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span className="text-white font-semibold text-sm">{t.cta_trust1}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20 justify-center">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span className="text-white font-semibold text-sm">{t.cta_trust2}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20 justify-center">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span className="text-white font-semibold text-sm">{t.cta_trust3}</span>
                  </div>
                </div>
              </FadeIn>

              {/* Main CTA Card */}
              <FadeIn delay={0.3}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-10 shadow-2xl text-center max-w-3xl mx-auto border border-white/40 dark:border-white/10">
                  <h3 className="text-xl md:text-2xl font-extrabold text-gray-900 dark:text-gray-100 mb-4 tracking-tight">
                    {t.cta_card_h3}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mb-5">
                    {t.cta_card_p_pre} <span className="font-bold text-gray-900 dark:text-gray-100">{t.cta_card_p_bold1}</span>{t.cta_card_p_mid}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{t.cta_card_p_bold2}</span>
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5 justify-center mb-2">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 justify-center">
                      <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong className="font-semibold">{t.cta_card_check1_bold}</strong>{t.cta_card_check1_post}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 justify-center">
                      <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong className="font-semibold">{t.cta_card_check2_bold}</strong>{t.cta_card_check2_post}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 justify-center">
                      <CircleCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong className="font-semibold">{t.cta_card_check3_bold}</strong>{t.cta_card_check3_post}</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3.5 justify-center mt-6">
                    <Button
                      onClick={() => goToLogin('register')}
                      className="ripple-btn cta-glow rounded-xl bg-gradient-to-r from-emerald-600 to-teal-400 hover:from-emerald-500 hover:to-teal-300 hover:brightness-105 active:scale-[0.98] text-white shadow-lg shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/30 transition-all duration-300 text-base font-bold py-6 px-8"
                    >
                      {t.cta_card_btn1} <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                    <Button
                      asChild
                      className="ripple-btn rounded-xl bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 dark:bg-transparent dark:border-white/20 dark:hover:bg-white/5 text-gray-800 dark:text-gray-100 font-bold py-6 px-8 transition-all duration-300 active:scale-[0.98]"
                    >
                      <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                        <MessageCircle className="mr-2 w-5 h-5" /> {t.cta_card_btn2}
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-5 flex items-center justify-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    {t.cta_card_p_bottom}
                  </p>
                </div>
              </FadeIn>

              {/* Reassure */}
              <FadeIn delay={0.45}>
                <p className="text-center text-emerald-50/80 text-sm mt-6 max-w-xl mx-auto leading-relaxed">
                  {t.cta_reassure}
                </p>
              </FadeIn>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* =================== FAQ =================== */}
      <Section className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <EyebrowBadge label={t.faq_badge} />
            <h2 className="text-3xl md:text-[42px] leading-[1.15] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              {t.faq_h2_1}{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-400 bg-clip-text text-transparent">{t.faq_h2_2}</span>
            </h2>
          </div>
        </FadeIn>

        <div className="max-w-3xl mx-auto space-y-3.5">
          {[
            {
              q: t.faq1_q,
              a: t.faq1_a,
            },
            {
              q: t.faq2_q,
              a: t.faq2_a,
            },
            {
              q: t.faq3_q,
              a: t.faq3_a,
            },
            {
              q: t.faq4_q,
              a: t.faq4_a,
            },
          ].map((faq, i) => {
            const open = openFaq === i;
            return (
              <FadeIn key={i} delay={i * 0.1}>
                <div className={`rounded-2xl bg-white dark:bg-[#111] transition-all duration-300 ${
                  open
                    ? 'border border-emerald-100 dark:border-emerald-900/60 shadow-lg shadow-emerald-600/5'
                    : 'border border-gray-100 dark:border-white/10 shadow-sm hover:border-emerald-100 dark:hover:border-white/20'
                }`}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 md:px-6 py-4 min-h-[56px] text-left cursor-pointer"
                  >
                    <span className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">{faq.q}</span>
                    <span className={`w-8 h-8 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
                      <ChevronDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  </button>
                  {open && (
                    <div id={`faq-panel-${i}`} className="px-5 md:px-6 pb-5 -mt-0.5">
                      <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              </FadeIn>
            );
          })}
        </div>
      </Section>

      {/* =================== FOOTER =================== */}
      <footer className="dark-surface w-full bg-gray-900 pt-12 pb-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/logo-ds.png" alt="Logo" className="w-9 h-9 rounded-xl object-contain shadow-none" />
                <span className="text-xl font-extrabold tracking-tight">
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Darrell</span>
                  <span className="text-white"> Soft</span>
                </span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t.footer_brand_desc}
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-white font-bold text-xs uppercase tracking-[0.18em] mb-4">{t.footer_nav_title}</h4>
              <div className="flex flex-col gap-2.5">
                <a href="#fitur" className="text-gray-400 hover:text-teal-300 text-sm transition-colors">{t.footer_nav_fitur}</a>
                <a href="#harga" className="text-gray-400 hover:text-teal-300 text-sm transition-colors">{t.footer_nav_harga}</a>
                <a href="#testimoni" className="text-gray-400 hover:text-teal-300 text-sm transition-colors">{t.footer_nav_testimoni}</a>
                <a href="#faq" className="text-gray-400 hover:text-teal-300 text-sm transition-colors">{t.footer_nav_faq}</a>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-bold text-xs uppercase tracking-[0.18em] mb-4">{t.footer_contact_title}</h4>
              <div className="flex flex-col gap-2.5">
                <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer" className="text-gray-400 hover:text-teal-300 text-sm transition-colors flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-8 border-t border-white/5">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-600 text-center md:text-left">
                &copy; {new Date().getFullYear()} Darrell Soft. {t.footer_bottom_rights}
                <span aria-hidden="true" className="text-gray-700"> • </span>
                <span className="font-medium text-gray-500" title="Versi aplikasi">{releaseVersionLabel()}</span>
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Shield className="w-3 h-3 text-emerald-500" />
                  <span>{t.footer_encrypted}</span>
                </div>
                <span className="text-gray-700">•</span>
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Shield className="w-3 h-3 text-emerald-500" />
                  <span>{t.footer_secure}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
