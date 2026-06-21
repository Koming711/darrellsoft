'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Printer,
  Calculator,
  DollarSign,
  Zap,
  Monitor,
  Smartphone,
  Shield,
  X,
  CheckCircle2,
  ChevronRight,
  Star,
  TrendingUp,
  Package,
  MousePointerClick,
  ArrowRight,
  MessageCircle,
  Download,
  Cloud,
  Globe,
  Lock,
  Banknote,
  Crown,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/language-context';


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
    <section id={id} className={`w-full py-16 md:py-24 px-4 md:px-8 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
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
      <Card className="card-tap group relative overflow-hidden border-0 bg-white dark:bg-[#111] shadow-lg hover:shadow-2xl transition-all duration-500 h-full">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-sky-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardContent className="relative p-6 pt-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-600/25 group-hover:scale-110 transition-transform duration-500">
            <Icon className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h3>
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
  periodBelow = false,
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
  periodBelow?: boolean;
  delay?: number;
  onSelect: () => void;
  popularLabel?: string;
  buttonLabel?: string;
}) {
  return (
    <FadeIn delay={delay}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="h-full"
      >
      <Card
        onClick={onSelect}
        className={`relative overflow-hidden h-full flex flex-col cursor-pointer transition-all duration-500 hover:-translate-y-2 active:shadow-xl bg-[#1a1a1a] ${
          popular
            ? 'border-2 border-blue-600 shadow-2xl shadow-blue-600/20 hover:shadow-blue-600/40'
            : 'border border-white/10 shadow-lg hover:shadow-xl hover:border-white/20'
        }`}
      >
        {popular && (
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-sky-400" />
        )}
        <CardHeader className="relative p-4 pb-3 text-center">
          {popular && (
            <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-sky-400 text-white border-0 px-3 py-0.5 text-xs font-semibold shadow-lg">
              <Star className="w-3 h-3 mr-1" /> {popularLabel}
            </Badge>
          )}
          <h3 className="text-base font-bold text-white mt-1">{title}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{description}{descriptionExtra && <><br />{descriptionExtra}</>}</p>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">
              {price}
            </span>
            {periodBelow ? (
              <p className="text-gray-400 text-xs mt-1">{period}</p>
            ) : (
              <span className="text-gray-500 text-xs ml-1">/{period}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative p-4 pt-0 flex-1">
          <Separator className="mb-4 bg-white/10" />
          <ul className="space-y-2">
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="relative p-4 pt-0">
          <Button
            className={`ripple-btn w-full py-2 text-xs font-semibold transition-all duration-300 ${
              popular
                ? 'cta-glow bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            }`}
          >
            {buttonLabel} <ArrowRight className="ml-1.5 w-3 h-3" />
          </Button>
        </CardFooter>
      </Card>
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
      <Card className="card-tap bg-white dark:bg-[#111] shadow-lg hover:shadow-xl transition-all duration-300 border-0 h-full">
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-sky-300 text-sky-300" />
            ))}
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed italic">&ldquo;{quote}&rdquo;</p>
          <div className="flex items-center gap-3 mt-auto pt-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-sky-300 flex items-center justify-center text-white font-bold text-sm">
              {avatar}
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
    nav_login: 'Login',

    hero_badge: 'Sistem Hitung Cepat Percetakan',
    hero_h1_1: 'Jangan jadi penonton saja!!!.',
    hero_h1_2: 'Sekarang sudah bisa mulai bisnis cetak',
    hero_h1_3: 'Dus Makanan, Dus Kue, Hampers, dll',
    hero_p1_bold1: 'Tidak ada alasan lagi gak bisa hitung modal cetakan...!!',
    hero_p1_bold2: 'Pakai Darrell Soft aja!',
    hero_p1_text: 'Dulu cuma yang ahli yang bisa hitung modal cetak.',
    hero_p1_emphasis: 'siapapun bisa',
    hero_p1_end: 'jadi pengusaha percetakan yang sukses!',
    hero_p2: 'Lupakan kalkulator manual yang bikin pusing. Dengan Darrell Soft, hitung modal jadi semudah mengetik.',
    hero_trust1: 'Tanpa ikatan kontrak',
    hero_trust2: 'Bisa batal kapan saja tanpa syarat',
    hero_trust3: 'Bisa langganan 1 bulan saja',
    hero_trust4: 'Tanpa denda',
    hero_cta1: 'Langganan Sekarang — Gratis 3 Hari!',
    hero_cta2: 'Lihat Paket Harga',
    hero_p3: 'Mulai gratis, tanpa kartu kredit. Berhenti kapan saja, tanpa denda.',

    hero_label_dus_kue: 'Dus Kue',
    hero_label_hampers: 'Hampers',
    hero_label_kantong_kebab: 'Kantong Kebab',
    hero_label_dus_donut: 'Dus Donut',
    hero_label_dus_ayam_geprek: 'Dus Ayam Geprek',
    hero_label_lunchbox_paper: 'Lunchbox Paper',
    hero_label_paperbowl: 'Paperbowl',
    hero_label_paperbag: 'Paperbag',
    hero_label_hampers_lebaran: 'Hampers Lebaran',
    hero_alt_printing: 'Mesin Cetak Kemasan',
    hero_badge_hitung_cepat: 'Hitung Cepat',
    hero_badge_hitung_cepat_val: '< 5 detik',
    hero_badge_profit_naik: 'Profit Naik',
    hero_badge_profit_naik_val: '+40%',

    stats_1_label: 'Pengguna Aktif',
    stats_2_label: 'Tingkat Kepuasan',
    stats_3_label: 'Transaksi Sukses',
    stats_4_label: 'Support Online',

    urg_badge: 'Penawaran Terbatas',
    urg_h2_1: 'Jangan Biarkan Bisnis Cetakmu',
    urg_h2_2: 'Terus Rugi',
    urg_h2_3: 'Karena Salah Hitung!',
    urg_p: 'Berlangganan Darrell Soft lebih murah daripada rugi satu kali salah hitung!',
    urg_card1_title: 'Hitung Akurat',
    urg_card1_desc: 'Perhitungan 100% akurat, tidak ada lagi kesalahan hitung yang bikin rugi jutaan rupiah.',
    urg_card2_title: 'Profit Maksimal',
    urg_card2_desc: 'Tentukan margin sendiri, setiap order pasti menguntungkan. Profit naik sampai 40%!',
    urg_card3_title: 'Hemat Waktu 90%',
    urg_card3_desc: 'Yang biasa 30 menit, sekarang cuma 3 detik. Waktumu lebih produktif untuk yang lain!',
    urg_cta1: 'Ya, Saya Mau Coba Gratis!',
    urg_cta2: 'Tanya Admin Dulu',
    urg_p_below: 'Cuma 3 detik daftar, langsung bisa pakai.',

    fitur_badge: 'Fitur Unggulan',
    fitur_h2_1: 'Hitung Modal Jadi',
    fitur_h2_2: 'Semudah Mengetik',
    fitur_p: 'Semua yang kamu butuhkan untuk mengelola bisnis percetakan, dalam satu aplikasi yang powerful.',
    fitur_card1_title: 'Update Harga Sekali Klik',
    fitur_card1_desc: 'Update harga kertas dan ongkos cetak sekali klik. Tidak perlu edit satu-satu, semua otomatis tersinkronisasi.',
    fitur_card2_title: 'Ketik Ukuran → Langsung Harga',
    fitur_card2_desc: 'Ketik ukuran bahan, aplikasi langsung kasih harga modal. Otomatis dan akurat, tanpa kalkulator manual.',
    fitur_card3_title: 'Tentukan Profit, Harga Jual Muncul',
    fitur_card3_desc: 'Tentukan profit yang kamu mau, harga jual langsung muncul. Kontrol penuh atas margin keuntunganmu.',

    keunggulan_badge: 'Kenapa Darrell Soft?',
    keunggulan_h2_1: 'Cepat, Akurat,',
    keunggulan_h2_2: 'dan Fleksibel!',
    keunggulan_p: 'Bisa diakses via Desktop maupun HP, kapan saja dan di mana saja.',
    adv1_title: 'Akses via Desktop',
    adv1_desc: 'Tampilan penuh yang nyaman untuk penggunaan di kantor atau toko. Semua fitur lengkap tersedia.',
    adv2_title: 'Akses via HP',
    adv2_desc: 'Mobile-friendly! Kelola bisnis percetakanmu langsung dari smartphone, di mana saja kamu berada.',
    adv3_title: 'Kecepatan Tinggi',
    adv3_desc: 'Proses kalkulasi instan. Tidak perlu menunggu lama, semua perhitungan selesai dalam hitungan detik.',
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

    cloud1_title: '☁️ Data Aman di Cloud, Tidak Hilang!',
    cloud1_b1_pre: 'HP hilang/laptop rusak?',
    cloud1_b1_bold: 'Data tetap aman',
    cloud1_b1_post: 'di cloud server terenkripsi',
    cloud1_b2_pre: 'Login dari perangkat mana saja,',
    cloud1_b2_bold: 'data langsung ada lengkap dan utuh',

    cloud2_title: '🌍 Bisa Buka di Mana Saja — Dalam & Luar Negeri!',
    cloud2_b1_pre: 'Jakarta, Surabaya, atau luar negeri —',
    cloud2_b1_bold: 'selama ada internet, bisnis tetap jalan',
    cloud2_b2_pre: 'HP saat di perjalanan,',
    cloud2_b2_bold: 'laptop saat di kantor',
    cloud2_b2_post: '— semua bisa!',

    cloud3_title: '📱 HP & Laptop, Semua Bisa!',
    cloud3_b1_bold: 'Satu akun, semua perangkat',
    cloud3_b1_post: 'tersinkronisasi real-time',
    cloud3_b2_pre: 'Update di HP,',
    cloud3_b2_bold: 'langsung muncul di laptop',
    cloud3_b2_post: '— dan sebaliknya',

    cloud4_title: '🛡️ Kenapa Bayar? Investasi Kecil, Hasil Besar!',
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
    golden_artinya_p_mid: '. Orang takut karena tidak bisa hitung modal —',
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
    cara_step1_title: 'Masukkan Spesifikasi',
    cara_step1_desc: 'Ketik ukuran bahan, jenis kertas, dan jumlah cetak yang diinginkan.',
    cara_step2_title: 'Sistem Hitung Otomatis',
    cara_step2_desc: 'Aplikasi langsung menghitung modal berdasarkan spesifikasi yang dimasukkan.',
    cara_step3_title: 'Tentukan & Jual',
    cara_step3_desc: 'Atur profit yang diinginkan, harga jual otomatis muncul. Siap cetak!',

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
    price_economis_f2: 'Semua fitur kalkulasi cetak',
    price_economis_f3: 'Update harga kertas & ongkos',
    price_economis_f4: 'Hitung otomatis harga modal',
    price_economis_f5: 'Akses Desktop & Mobile',
    price_economis_f6_bold: 'Boleh langganan 1 bulan saja',
    price_economis_f7: 'Tidak ada biaya denda sama sekali',

    price_bulanan_title: 'Langganan Bulanan',
    price_bulanan_desc: 'Langganan bulanan, sangat fleksibel',
    price_bulanan_period: 'per bulan',
    price_bulanan_f1: '2 akun untuk team',
    price_bulanan_f2: 'Semua fitur kalkulasi cetak',
    price_bulanan_f3: 'Update harga kertas & ongkos',
    price_bulanan_f4: 'Hitung otomatis harga modal',
    price_bulanan_f5: 'Akses Desktop & Mobile',
    price_bulanan_f6_bold: 'Boleh langganan 1 bulan saja',
    price_bulanan_f7: 'Tidak ada biaya denda sama sekali',

    price_tahunan_title: 'Langganan Tahunan',
    price_tahunan_desc: 'Hanya Rp 74.000/bulan',
    price_tahunan_desc_extra: '— hemat 37%!',
    price_tahunan_period: 'per tahun',
    price_tahunan_f1: '3 akun untuk group',
    price_tahunan_f2: 'Semua fitur kalkulasi cetak',
    price_tahunan_f3: 'Update harga kertas & ongkos',
    price_tahunan_f4: 'Hitung otomatis harga modal',
    price_tahunan_f5: 'Akses Desktop & Mobile',
    price_tahunan_f6: 'Priority Support 24/7',
    price_tahunan_f7: 'Laporan bulanan lengkap',
    price_tahunan_f8: 'Backup data otomatis',

    price_lifetime_title: 'Tanpa Langganan',
    price_lifetime_desc: 'Beli putus, tidak perlu langganan',
    price_lifetime_period: 'sekali bayar',
    price_lifetime_f1: '4 akun untuk group solid',
    price_lifetime_f2: 'Semua fitur kalkulasi cetak',
    price_lifetime_f3: 'Update harga kertas & ongkos',
    price_lifetime_f4: 'Hitung otomatis harga modal',
    price_lifetime_f5: 'Akses Desktop & Mobile',
    price_lifetime_f6: 'Beli sekali, pakai selamanya',
    price_lifetime_f7: 'Tidak ada biaya berlangganan',
    price_lifetime_f8: 'Priority Support 24/7',

    price_guarantee: 'Tanpa Ikatan Apapun! Bisa batal kapan saja tanpa denda.',

    testimoni_badge: 'Testimoni',
    testimoni_h2_1: 'Dipercaya',
    testimoni_h2_2: 'Ribuan Pengusaha',
    testimoni_h2_3: 'Percetakan',
    testi1_name: 'Maman',
    testi1_role: 'Pemilik Tunas Makmur',
    testi1_quote: 'Dulu hitung modal cetak pakai kalkulator, sering salah dan rugi. Sekarang pakai Darrell Soft, semua otomatis dan akurat. Profit naik 40%!',
    testi2_name: 'Jimmy',
    testi2_role: 'Owner SiPrint',
    testi2_quote: 'Aplikasinya super mudah dipakai. Saya yang nggak paham komputer pun bisa langsung pakai. Harga paketnya juga sangat terjangkau.',
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
    cta_p: 'Kompetitormu sudah pakai Darrell Soft. Mereka hitung modal dalam hitungan detik, sementara kamu masih pakai kalkulator?',
    cta_trust1: 'Gratis 3 hari trial',
    cta_trust2: 'Tanpa kartu kredit',
    cta_trust3: 'Bisa batal kapan saja',
    cta_card_h3: 'Cuma Rp 128.000/bulan — Lebih Murah dari Gaji Karyawan 1 Hari!',
    cta_card_p_pre: 'Bayangkan:',
    cta_card_p_bold1: '1 kali salah hitung saja bisa rugi ratusan ribu hingga jutaan rupiah',
    cta_card_p_mid: '. Dengan Darrell Soft, kamu bayar cuma Rp 128.000/bulan tapi hemat jutaan dari kesalahan hitung. ',
    cta_card_p_bold2: 'Investasi kecil, untung besar!',
    cta_card_check1_bold: 'Tanpa kontrak',
    cta_card_check1_post: ' — bebas berhenti kapan saja',
    cta_card_check2_bold: 'Tanpa denda',
    cta_card_check2_post: ' — tidak ada biaya tersembunyi',
    cta_card_check3_bold: 'Coba gratis 3 hari',
    cta_card_check3_post: ' — buktikan dulu!',
    cta_card_btn1: 'Langganan Sekarang — Gratis!',
    cta_card_btn2: 'Tanya Admin Dulu',
    cta_card_p_bottom: '💎 Sudah dipercaya 7.000+ pengusaha percetakan di Indonesia',
    cta_reassure: 'Masih ragu? Chat admin kami, konsultasi gratis tanpa kewajiban berlangganan.',

    faq_badge: 'FAQ',
    faq_h2_1: 'Pertanyaan yang',
    faq_h2_2: 'Sering Ditanyakan',
    faq1_q: 'Apakah bisa dicoba dulu sebelum berlangganan?',
    faq1_a: 'Tentu! Kami menyediakan masa trial gratis agar kamu bisa merasakan semua fitur Darrell Soft sebelum memutuskan berlangganan.',
    faq2_q: 'Bagaimana cara berlangganan?',
    faq2_a: 'Sangat mudah! Cukup DM kami, pilih paket yang sesuai, dan lakukan pembayaran. Akun kamu akan langsung aktif.',
    faq3_q: 'Apakah data saya aman?',
    faq3_a: 'Ya! Data kamu dilindungi dengan enkripsi dan backup otomatis. Privasi dan keamanan data adalah prioritas utama kami.',
    faq4_q: 'Bisa berhenti berlangganan kapan saja?',
    faq4_a: 'Tentu! Tidak ada ikatan kontrak. Kamu bisa berhenti kapan saja tanpa denda atau biaya tambahan.',

    footer_brand_desc: 'Sistem kasir percetakan yang membantu menghitung modal, mengelola harga, dan meningkatkan profit bisnis cetakmu.',
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

    hero_badge: 'Fast Printing Cost Calculator',
    hero_h1_1: "Don't just be a spectator!!!.",
    hero_h1_2: 'Now you can start a printing business for',
    hero_h1_3: 'Food Boxes, Cake Boxes, Hampers, etc.',
    hero_p1_bold1: 'No more excuses for not being able to calculate printing costs...!!',
    hero_p1_bold2: 'Just use Darrell Soft!',
    hero_p1_text: 'In the past, only experts could calculate printing costs.',
    hero_p1_emphasis: 'anyone can',
    hero_p1_end: 'become a successful printing entrepreneur!',
    hero_p2: 'Forget manual calculators that give you headaches. With Darrell Soft, calculating costs is as easy as typing.',
    hero_trust1: 'No contract binding',
    hero_trust2: 'Cancel anytime, no conditions',
    hero_trust3: 'Subscribe for just 1 month',
    hero_trust4: 'No penalty',
    hero_cta1: 'Subscribe Now — Free 3 Days!',
    hero_cta2: 'View Pricing Plans',
    hero_p3: 'Start free, no credit card. Stop anytime, no penalty.',

    hero_label_dus_kue: 'Cake Box',
    hero_label_hampers: 'Hampers',
    hero_label_kantong_kebab: 'Kebab Bag',
    hero_label_dus_donut: 'Donut Box',
    hero_label_dus_ayam_geprek: 'Fried Chicken Box',
    hero_label_lunchbox_paper: 'Paper Lunchbox',
    hero_label_paperbowl: 'Paperbowl',
    hero_label_paperbag: 'Paperbag',
    hero_label_hampers_lebaran: 'Eid Hampers',
    hero_alt_printing: 'Packaging Printing Machine',
    hero_badge_hitung_cepat: 'Fast Calculation',
    hero_badge_hitung_cepat_val: '< 5 seconds',
    hero_badge_profit_naik: 'Profit Up',
    hero_badge_profit_naik_val: '+40%',

    stats_1_label: 'Active Users',
    stats_2_label: 'Satisfaction Rate',
    stats_3_label: 'Successful Transactions',
    stats_4_label: 'Online Support',

    urg_badge: 'Limited Offer',
    urg_h2_1: "Don't Let Your Printing Business",
    urg_h2_2: 'Keep Losing',
    urg_h2_3: 'Due to Wrong Calculations!',
    urg_p: 'Subscribing to Darrell Soft is cheaper than losing money from one wrong calculation!',
    urg_card1_title: 'Accurate Calculation',
    urg_card1_desc: '100% accurate calculations, no more calculation mistakes that cost you millions of rupiah.',
    urg_card2_title: 'Maximum Profit',
    urg_card2_desc: 'Set your own margin, every order is profitable. Profit up by 40%!',
    urg_card3_title: 'Save 90% of Time',
    urg_card3_desc: 'What used to take 30 minutes, now only 3 seconds. Your time is more productive for other things!',
    urg_cta1: 'Yes, I Want to Try Free!',
    urg_cta2: 'Ask Admin First',
    urg_p_below: 'Just 3 seconds to register, ready to use right away.',

    fitur_badge: 'Key Features',
    fitur_h2_1: 'Calculating Costs Is As',
    fitur_h2_2: 'Easy As Typing',
    fitur_p: 'Everything you need to manage your printing business, in one powerful application.',
    fitur_card1_title: 'Update Prices with One Click',
    fitur_card1_desc: 'Update paper prices and printing costs with one click. No need to edit one by one, everything syncs automatically.',
    fitur_card2_title: 'Type Size → Instant Price',
    fitur_card2_desc: 'Type the material size, the app instantly gives you the base cost. Automatic and accurate, no manual calculator.',
    fitur_card3_title: 'Set Profit, Selling Price Appears',
    fitur_card3_desc: 'Set your desired profit, the selling price appears instantly. Full control over your profit margin.',

    keunggulan_badge: 'Why Darrell Soft?',
    keunggulan_h2_1: 'Fast, Accurate,',
    keunggulan_h2_2: 'and Flexible!',
    keunggulan_p: 'Accessible via Desktop or Mobile, anytime and anywhere.',
    adv1_title: 'Desktop Access',
    adv1_desc: 'Full view comfortable for office or shop use. All complete features available.',
    adv2_title: 'Mobile Access',
    adv2_desc: 'Mobile-friendly! Manage your printing business directly from your smartphone, wherever you are.',
    adv3_title: 'High Speed',
    adv3_desc: 'Instant calculation process. No need to wait long, all calculations done in seconds.',
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

    cloud1_title: '☁️ Data Safe in Cloud, Never Lost!',
    cloud1_b1_pre: 'Phone lost/laptop broken?',
    cloud1_b1_bold: 'Data stays safe',
    cloud1_b1_post: 'in encrypted cloud server',
    cloud1_b2_pre: 'Login from any device,',
    cloud1_b2_bold: 'data is right there complete and intact',

    cloud2_title: '🌍 Open from Anywhere — Domestic & Abroad!',
    cloud2_b1_pre: 'Jakarta, Surabaya, or abroad —',
    cloud2_b1_bold: 'as long as there is internet, business keeps running',
    cloud2_b2_pre: 'Phone while traveling,',
    cloud2_b2_bold: 'laptop at the office',
    cloud2_b2_post: '— all works!',

    cloud3_title: '📱 Phone & Laptop, All Work!',
    cloud3_b1_bold: 'One account, all devices',
    cloud3_b1_post: 'synced in real-time',
    cloud3_b2_pre: 'Update on phone,',
    cloud3_b2_bold: 'instantly appears on laptop',
    cloud3_b2_post: '— and vice versa',

    cloud4_title: '🛡️ Why Pay? Small Investment, Big Results!',
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
    golden_artinya_p_mid: '. People are afraid because they cannot calculate costs —',
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
    cara_step1_title: 'Enter Specifications',
    cara_step1_desc: 'Type the material size, paper type, and desired print quantity.',
    cara_step2_title: 'Auto Calculation System',
    cara_step2_desc: 'The app instantly calculates the cost based on the entered specifications.',
    cara_step3_title: 'Set & Sell',
    cara_step3_desc: 'Set your desired profit, the selling price appears automatically. Ready to print!',

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
    price_economis_f2: 'All printing calculation features',
    price_economis_f3: 'Update paper prices & costs',
    price_economis_f4: 'Auto calculate base cost',
    price_economis_f5: 'Desktop & Mobile Access',
    price_economis_f6_bold: 'Can subscribe for just 1 month',
    price_economis_f7: 'No penalty fees whatsoever',

    price_bulanan_title: 'Monthly Subscription',
    price_bulanan_desc: 'Monthly subscription, very flexible',
    price_bulanan_period: 'per month',
    price_bulanan_f1: '2 accounts for a team',
    price_bulanan_f2: 'All printing calculation features',
    price_bulanan_f3: 'Update paper prices & costs',
    price_bulanan_f4: 'Auto calculate base cost',
    price_bulanan_f5: 'Desktop & Mobile Access',
    price_bulanan_f6_bold: 'Can subscribe for just 1 month',
    price_bulanan_f7: 'No penalty fees whatsoever',

    price_tahunan_title: 'Annual Subscription',
    price_tahunan_desc: 'Only Rp 74,000/month',
    price_tahunan_desc_extra: '— save 37%!',
    price_tahunan_period: 'per year',
    price_tahunan_f1: '3 accounts for a group',
    price_tahunan_f2: 'All printing calculation features',
    price_tahunan_f3: 'Update paper prices & costs',
    price_tahunan_f4: 'Auto calculate base cost',
    price_tahunan_f5: 'Desktop & Mobile Access',
    price_tahunan_f6: 'Priority 24/7 Support',
    price_tahunan_f7: 'Complete monthly reports',
    price_tahunan_f8: 'Automatic data backup',

    price_lifetime_title: 'No Subscription',
    price_lifetime_desc: 'One-time purchase, no subscription needed',
    price_lifetime_period: 'one-time payment',
    price_lifetime_f1: '4 accounts for a solid group',
    price_lifetime_f2: 'All printing calculation features',
    price_lifetime_f3: 'Update paper prices & costs',
    price_lifetime_f4: 'Auto calculate base cost',
    price_lifetime_f5: 'Desktop & Mobile Access',
    price_lifetime_f6: 'Buy once, use forever',
    price_lifetime_f7: 'No subscription fees',
    price_lifetime_f8: 'Priority 24/7 Support',

    price_guarantee: 'No Binding Commitment! Cancel anytime without penalty.',

    testimoni_badge: 'Testimonials',
    testimoni_h2_1: 'Trusted by',
    testimoni_h2_2: 'Thousands of',
    testimoni_h2_3: 'Printing Entrepreneurs',
    testi1_name: 'Maman',
    testi1_role: 'Owner of Tunas Makmur',
    testi1_quote: 'Used to calculate printing costs with a calculator, often wrong and losing money. Now using Darrell Soft, everything is automatic and accurate. Profit up 40%!',
    testi2_name: 'Jimmy',
    testi2_role: 'Owner of SiPrint',
    testi2_quote: "The app is super easy to use. Even I, who don't understand computers, can use it right away. The package price is also very affordable.",
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
    cta_p: 'Your competitors are already using Darrell Soft. They calculate costs in seconds, while you still use a calculator?',
    cta_trust1: 'Free 3-day trial',
    cta_trust2: 'No credit card',
    cta_trust3: 'Cancel anytime',
    cta_card_h3: 'Only Rp 128,000/month — Cheaper Than 1 Day of Employee Wage!',
    cta_card_p_pre: 'Imagine:',
    cta_card_p_bold1: 'one wrong calculation can cost you hundreds of thousands to millions of rupiah',
    cta_card_p_mid: '. With Darrell Soft, you pay only Rp 128,000/month but save millions from calculation mistakes. ',
    cta_card_p_bold2: 'Small investment, big profit!',
    cta_card_check1_bold: 'No contract',
    cta_card_check1_post: ' — free to stop anytime',
    cta_card_check2_bold: 'No penalty',
    cta_card_check2_post: ' — no hidden fees',
    cta_card_check3_bold: 'Try free for 3 days',
    cta_card_check3_post: ' — prove it first!',
    cta_card_btn1: 'Subscribe Now — Free!',
    cta_card_btn2: 'Ask Admin First',
    cta_card_p_bottom: '💎 Trusted by 7,000+ printing entrepreneurs in Indonesia',
    cta_reassure: 'Still unsure? Chat our admin, free consultation with no obligation to subscribe.',

    faq_badge: 'FAQ',
    faq_h2_1: 'Frequently',
    faq_h2_2: 'Asked Questions',
    faq1_q: 'Can I try it first before subscribing?',
    faq1_a: 'Of course! We provide a free trial period so you can experience all Darrell Soft features before deciding to subscribe.',
    faq2_q: 'How do I subscribe?',
    faq2_a: 'Very easy! Just DM us, choose the suitable plan, and make the payment. Your account will be activated immediately.',
    faq3_q: 'Is my data safe?',
    faq3_a: 'Yes! Your data is protected with encryption and automatic backup. Privacy and data security are our top priorities.',
    faq4_q: 'Can I stop subscribing anytime?',
    faq4_a: 'Of course! No contract binding. You can stop anytime without penalty or additional fees.',

    footer_brand_desc: 'Printing cashier system that helps calculate costs, manage prices, and increase your printing business profit.',
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

  const goToLogin = (tab?: string) => {
    router.push(tab ? `/login?tab=${tab}` : '/login');
  };

  const openPayment = (pkgType: string) => {
    router.push(`/checkout?plan=${pkgType}`);
  };

  // Hero image panel (food box grid + printing machine with overlay badges).
  // On mobile it renders inline right after the H1; on desktop it's in the right column.
  const heroImagePanel = (
    <div className="relative">
      <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-blue-600/10 border border-blue-50 dark:border-white/10 p-3 sm:p-4 bg-gradient-to-br from-blue-50/50 to-white dark:from-slate-900/50 dark:to-slate-950">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {[
            { src: '/dus-kue.jpg', label: t.hero_label_dus_kue },
            { src: '/hampers.jpg', label: t.hero_label_hampers },
            { src: '/kantong-kebab.jpg', label: t.hero_label_kantong_kebab },
            { src: '/dus-donut.jpg', label: t.hero_label_dus_donut },
            { src: '/dus-ayam-geprek.jpg', label: t.hero_label_dus_ayam_geprek },
            { src: '/lunchbox-paper.jpg', label: t.hero_label_lunchbox_paper },
            { src: '/paperbowl.png', label: t.hero_label_paperbowl },
            { src: '/paperbag.jpg', label: t.hero_label_paperbag },
            { src: '/hampers-lebaran.jpg', label: t.hero_label_hampers_lebaran },
          ].map((item, i) => (
            <motion.div
              key={item.src}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.07, duration: 0.4 }}
              className="group relative rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-md border border-gray-100 dark:border-white/10 aspect-square"
            >
              <img
                src={item.src}
                alt={item.label}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1.5 sm:py-2">
                <p className="text-[10px] sm:text-xs font-bold text-white text-center leading-tight">{item.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
        {/* Printing machine image — below the food box grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + 9 * 0.07, duration: 0.5 }}
          className="mt-2.5 sm:mt-3 relative rounded-xl overflow-hidden shadow-md border border-gray-100 dark:border-white/10 bg-white dark:bg-slate-800"
        >
          <img
            src="/hero-printing.png"
            alt={t.hero_alt_printing}
            className="w-full h-32 sm:h-44 md:h-48 object-cover transition-transform duration-500 hover:scale-105"
          />
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          {/* Hitung Cepat badge — overlaid on the printing machine image (top-right) */}
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute top-2 right-2 md:top-3 md:right-3 bg-white/95 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow-xl p-1.5 md:p-2.5 border border-white/40 dark:border-white/10 z-10"
          >
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-7 h-7 md:w-9 md:h-9 rounded-md bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center">
                <Calculator className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-[9px] md:text-[11px] text-gray-600 dark:text-gray-300 leading-none">{t.hero_badge_hitung_cepat}</p>
                <p className="text-xs md:text-base font-bold text-blue-700 dark:text-blue-400 leading-tight">{t.hero_badge_hitung_cepat_val}</p>
              </div>
            </div>
          </motion.div>
          {/* Profit Naik badge — overlaid on the printing machine image (bottom-left) */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute bottom-2 left-2 md:bottom-3 md:left-3 bg-white/95 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow-xl p-1.5 md:p-2.5 border border-white/40 dark:border-white/10 z-10"
          >
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-7 h-7 md:w-9 md:h-9 rounded-md bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-[9px] md:text-[11px] text-gray-600 dark:text-gray-300 leading-none">{t.hero_badge_profit_naik}</p>
                <p className="text-xs md:text-base font-bold text-green-600 dark:text-green-400 leading-tight">{t.hero_badge_profit_naik_val}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-black dark:via-black dark:to-black">
      {/* =================== NAVBAR =================== */}
      <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <img src="/logo-ds.png" alt="Logo" className="w-9 h-9 rounded-xl object-contain shadow-none" />
            <span className="text-[16px] md:text-[22px] tracking-tight text-blue-900 dark:text-blue-300" style={{ fontWeight: 900 }}>
              darrellsoft.com
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#fitur" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">{t.nav_fitur}</a>
            <a href="#kenapa-langganan" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">{t.nav_kenapa}</a>
            <a href="#harga" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">{t.nav_harga}</a>
            <a href="#testimoni" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">{t.nav_testimoni}</a>
            <LanguageToggle />
            <ThemeToggle className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10" />
            <Button onClick={() => goToLogin()} className="ripple-btn bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-300">
              Login <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          {/* Mobile: Masuk button + theme toggle + language toggle instead of hamburger */}
          <div className="md:hidden flex items-center gap-1.5">
            <LanguageToggle compact />
            <ThemeToggle className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10" />
            <Button onClick={() => goToLogin()} className="ripple-btn bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-300 text-xs px-3 py-1.5 h-8">
              Login <ChevronRight className="ml-1 w-3 h-3" />
            </Button>
          </div>
        </div>

      </nav>

      {/* =================== HERO =================== */}
      <section className="relative w-full overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-blue-100/20 dark:bg-blue-900/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-16 md:pb-24">
          {/* Section title — centered, close to the Darrellsoft navbar banner */}
          <FadeIn direction="down" delay={0.05}>
            <div className="flex justify-center mb-4 md:mb-6">
              <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 px-8 py-3 text-[18px] md:text-[22px] font-bold">
                <Zap className="w-7 h-7 md:w-8 md:h-8 mr-3" /> {t.hero_badge}
              </Badge>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
            {/* Left - Text */}
            <FadeIn direction="right">
              <div className="flex flex-col gap-6">
                <h1 className="text-gray-900 dark:text-gray-100 leading-[1.1] text-[31.67px] md:text-[43.67px] lg:text-[55.67px]" style={{ fontWeight: 900 }}>
                  <span style={{ fontWeight: 900 }}>{t.hero_h1_1}{' '}</span>
                  <span className="font-extrabold" style={{ color: '#4374C1', fontWeight: 900 }}>{t.hero_h1_2}</span>{' '}
                  <span className="bg-gradient-to-r from-red-500 to-rose-500 bg-clip-text text-transparent" style={{ fontWeight: 900 }}>{t.hero_h1_3}</span>
                </h1>

                {/* Mobile: show images right after H1 (below the "Hampers" text) */}
                <div className="md:hidden">{heroImagePanel}</div>

                <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-bold text-blue-600 dark:text-blue-400">{t.hero_p1_bold1}</span><br />
                  <span className="font-bold text-gray-900 dark:text-gray-100">{t.hero_p1_bold2}</span>.<br />
                  {t.hero_p1_text}
                  {' '}<span className="font-semibold text-blue-700 dark:text-blue-400">{t.hero_p1_emphasis}</span>{' '}{t.hero_p1_end}
                </p>

                <p className="text-base text-gray-500 dark:text-gray-500 leading-relaxed">
                  {t.hero_p2}
                </p>



                {/* Trust signals */}
                <div className="flex items-center gap-4 mt-4 flex-wrap">
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <Shield className="w-5 h-5 text-green-500" />
                    <span className="font-extrabold">{t.hero_trust1}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-extrabold">{t.hero_trust2}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-extrabold">{t.hero_trust3}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <X className="w-5 h-5 text-red-400" />
                    <span className="font-extrabold">{t.hero_trust4}</span>
                  </div>
                </div>

                {/* Hero CTA — Primary */}
                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                  <Button
                    size="lg"
                    onClick={() => goToLogin('register')}
                    className="ripple-btn cta-glow bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-300 text-base font-bold py-6 px-8"
                  >
                    {t.hero_cta1} <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => document.getElementById('harga')?.scrollIntoView({ behavior: 'smooth' })}
                    className="ripple-btn border-2 border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/30 font-bold transition-all duration-300 text-base py-6 px-8"
                  >
                    {t.hero_cta2}
                  </Button>
                </div>
                <p className="text-base text-black dark:text-white mt-2">{t.hero_p3}</p>
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
      <section className="w-full bg-gradient-to-r from-gray-900 to-gray-800 py-8 md:py-10">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { value: 7168, suffix: '+', label: t.stats_1_label, icon: Printer },
              { value: 98, suffix: '%', label: t.stats_2_label, icon: Star },
              { value: 168800, suffix: '+', label: t.stats_3_label, icon: Package },
              { value: 24, suffix: '/7', label: t.stats_4_label, icon: Shield },
            ].map((stat, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="flex flex-col md:flex-row items-center md:items-center gap-2 md:gap-3 text-center md:text-left">
                  <stat.icon className="w-8 h-8 text-blue-400 hidden md:block" />
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-white">
                      <CountUp end={stat.value} suffix={stat.suffix} />
                    </p>
                    <p className="text-xs md:text-sm text-gray-400 mt-0.5">{stat.label}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* =================== AJAKAN BERLANGGANAN (URGENCY) =================== */}
      <section className="w-full py-16 md:py-24 relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-sky-600">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 border-2 border-white rounded-full" />
          <div className="absolute bottom-10 right-10 w-60 h-60 border-2 border-white rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-white rounded-full" />
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-8 relative z-10">
          <FadeIn>
            <div className="text-center mb-10">
              <Badge className="bg-yellow-400 text-yellow-900 border-0 mb-4 px-8 py-3 text-[18px] md:text-[22px] font-bold shadow-lg shadow-yellow-400/30 animate-pulse">
                <Zap className="w-8 h-8 mr-2" /> {t.urg_badge}
              </Badge>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                {t.urg_h2_1}<br className="hidden md:block" />{' '}
                <span className="underline decoration-white/50 decoration-4 underline-offset-4">{t.urg_h2_2}</span> {t.urg_h2_3}
              </h2>
              <p className="text-white/90 mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                {t.urg_p}
              </p>
            </div>
          </FadeIn>

          {/* Value Proposition Cards */}
          <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-10">
            <FadeIn delay={0}>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center hover:bg-white/20 transition-all duration-300">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg mb-3">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{t.urg_card1_title}</h3>
                <p className="text-white/80 text-sm leading-relaxed">{t.urg_card1_desc}</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center hover:bg-white/20 transition-all duration-300">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-400 to-sky-500 flex items-center justify-center shadow-lg mb-3">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{t.urg_card2_title}</h3>
                <p className="text-white/80 text-sm leading-relaxed">{t.urg_card2_desc}</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center hover:bg-white/20 transition-all duration-300">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-lg mb-3">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{t.urg_card3_title}</h3>
                <p className="text-white/80 text-sm leading-relaxed">{t.urg_card3_desc}</p>
              </div>
            </FadeIn>
          </div>

          {/* Dual CTA */}
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
              <Button
                size="lg"
                onClick={() => goToLogin('register')}
                className="ripple-btn cta-glow bg-white text-blue-700 hover:bg-blue-50 shadow-2xl shadow-blue-700/20 hover:shadow-3xl transition-all duration-300 text-lg font-bold py-7 px-10"
              >
                {t.urg_cta1} <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                asChild
                className="ripple-btn bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-700/25 hover:shadow-xl transition-all duration-300 text-lg py-7 px-10"
              >
                <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 w-5 h-5" /> {t.urg_cta2}
                </a>
              </Button>
            </div>
            <p className="text-center text-white/70 text-sm">{t.urg_p_below}</p>
          </FadeIn>
        </div>
      </section>

      {/* =================== FITUR =================== */}
      <Section id="fitur" className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.fitur_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              {t.fitur_h2_1}{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.fitur_h2_2}</span>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              {t.fitur_p}
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          <FeatureCard
            icon={MousePointerClick}
            title={t.fitur_card1_title}
            desc={t.fitur_card1_desc}
            delay={0}
          />
          <FeatureCard
            icon={Calculator}
            title={t.fitur_card2_title}
            desc={t.fitur_card2_desc}
            delay={0.15}
          />
          <FeatureCard
            icon={DollarSign}
            title={t.fitur_card3_title}
            desc={t.fitur_card3_desc}
            delay={0.3}
          />
        </div>
      </Section>

      {/* =================== KEUNGGULAN =================== */}
      <Section id="keunggulan" className="bg-gradient-to-b from-blue-50/30 to-white dark:from-black dark:to-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.keunggulan_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.keunggulan_h2_1}</span> {t.keunggulan_h2_2}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              {t.keunggulan_p}
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          {[
            {
              icon: Monitor,
              title: t.adv1_title,
              desc: t.adv1_desc,
              color: 'from-blue-600 to-red-500',
            },
            {
              icon: Smartphone,
              title: t.adv2_title,
              desc: t.adv2_desc,
              color: 'from-sky-400 to-blue-600',
            },
            {
              icon: Zap,
              title: t.adv3_title,
              desc: t.adv3_desc,
              color: 'from-sky-300 to-sky-400',
            },
            {
              icon: Shield,
              title: t.adv4_title,
              desc: t.adv4_desc,
              color: 'from-green-500 to-emerald-500',
            },
            {
              icon: Download,
              title: t.adv5_title,
              desc: t.adv5_desc,
              color: 'from-blue-500 to-indigo-500',
            },
            {
              icon: Smartphone,
              title: t.adv6_title,
              desc: t.adv6_desc,
              color: 'from-purple-500 to-pink-500',
            },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="advantage-tap group flex items-start gap-4 p-5 rounded-xl bg-white dark:bg-[#111] shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-white/10 hover:border-blue-100 dark:hover:border-white/20 cursor-pointer">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </Section>

      {/* =================== KENAPA HARUS LANGGANAN =================== */}
      <Section id="kenapa-langganan" className="bg-gradient-to-b from-sky-50/50 to-white dark:from-black dark:to-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 border-sky-100 dark:border-sky-800 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.kenapa_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              {t.kenapa_h2_1} <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.kenapa_h2_2}</span>{' '}
              {t.kenapa_h2_3} <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.kenapa_h2_4}</span>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              {t.kenapa_p}
            </p>
          </div>
        </FadeIn>

        {/* ---- Bagian 1: 4 Cloud Advantage Cards ---- */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 mb-12">
          {/* Card 1: Data Aman di Cloud */}
          <FadeIn delay={0}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-white/10 hover:shadow-xl hover:border-sky-200 dark:hover:border-sky-800 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-sky-100/60 to-transparent dark:from-sky-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Cloud className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t.cloud1_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{t.cloud1_b1_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud1_b1_bold}</strong> {t.cloud1_b1_post}</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{t.cloud1_b2_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud1_b2_bold}</strong></span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* Card 2: Bisa Buka di Mana Saja */}
          <FadeIn delay={0.1}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-white/10 hover:shadow-xl hover:border-emerald-200 dark:hover:border-emerald-800 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-100/60 to-transparent dark:from-emerald-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Globe className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t.cloud2_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{t.cloud2_b1_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud2_b1_bold}</strong></span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{t.cloud2_b2_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud2_b2_bold}</strong> {t.cloud2_b2_post}</span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* Card 3: HP & Laptop, Semua Bisa */}
          <FadeIn delay={0.2}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-white/10 hover:shadow-xl hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-violet-100/60 to-transparent dark:from-violet-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Smartphone className="w-5 h-5 text-white mr-0.5" />
                  <Monitor className="w-4 h-4 text-white ml-0.5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t.cloud3_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span><strong className="text-gray-900 dark:text-gray-100">{t.cloud3_b1_bold}</strong> {t.cloud3_b1_post}</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{t.cloud3_b2_pre} <strong className="text-gray-900 dark:text-gray-100">{t.cloud3_b2_bold}</strong> {t.cloud3_b2_post}</span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* Card 4: Kenapa Bayar? */}
          <FadeIn delay={0.3}>
            <div className="group bg-white dark:bg-[#111] rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-white/10 hover:shadow-xl hover:border-amber-200 dark:hover:border-amber-800 transition-all duration-300 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-100/60 to-transparent dark:from-amber-900/20 dark:to-transparent rounded-bl-full" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 group-hover:scale-110 transition-transform duration-300 mb-4">
                  <Banknote className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t.cloud4_title}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{t.cloud4_b1_pre} <strong className="text-amber-600 dark:text-amber-400">{t.cloud4_b1_bold}</strong> {t.cloud4_b1_post}</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span><strong className="text-gray-900 dark:text-gray-100">{t.cloud4_b2_bold}</strong> {t.cloud4_b2_post}</span>
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>
        </div>

        {/* ---- Bagian 2: Kesempatan Emas Banner ---- */}
        <FadeIn delay={0.3}>
          <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-sky-700 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-8 right-16 w-40 h-40 border-2 border-white rounded-full" />
              <div className="absolute bottom-8 left-12 w-56 h-56 border border-white rounded-full" />
              <div className="absolute top-1/2 left-1/3 w-32 h-32 border border-white rounded-full" />
            </div>

            <div className="relative z-10">
              {/* Crown Badge */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-3 bg-yellow-400/20 backdrop-blur-sm rounded-full px-8 py-4 border border-yellow-400/30 mb-4">
                  <Crown className="w-8 h-8 text-yellow-300" />
                  <span className="text-yellow-200 font-bold text-[18px] md:text-[22px]">{t.golden_badge}</span>
                </div>
                <h3 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">
                  {t.golden_h3_1}<br />
                  <span className="text-yellow-300">{t.golden_h3_2}</span>
                </h3>
              </div>

              {/* Fakta & Artinya */}
              <div className="grid md:grid-cols-2 gap-5 mb-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-400/20 flex items-center justify-center">
                      <span className="text-lg">📊</span>
                    </div>
                    <h4 className="font-bold text-white text-base">{t.golden_fakta}</h4>
                  </div>
                  <p className="text-white/85 text-sm leading-relaxed">
                    {t.golden_fakta_p_pre} <strong className="text-yellow-300">{t.golden_fakta_p_bold1}</strong>{t.golden_fakta_p_mid} <strong className="text-white">{t.golden_fakta_p_bold2}</strong>{t.golden_fakta_p_post}
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-green-400/20 flex items-center justify-center">
                      <span className="text-lg">💡</span>
                    </div>
                    <h4 className="font-bold text-white text-base">{t.golden_artinya}</h4>
                  </div>
                  <p className="text-white/85 text-sm leading-relaxed">
                    {t.golden_artinya_p_pre} <strong className="text-yellow-300">{t.golden_artinya_p_bold1}</strong>{t.golden_artinya_p_mid} <strong className="text-white">{t.golden_artinya_p_bold2}</strong>
                  </p>
                </div>
              </div>

              {/* 3 Statistics Flow */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-8">
                <FadeIn delay={0.4}>
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 text-center min-w-[180px]">
                    <p className="text-3xl md:text-4xl font-extrabold text-yellow-300">{t.golden_stat1_val}</p>
                    <p className="text-white/80 text-sm mt-1">{t.golden_stat1_label}</p>
                  </div>
                </FadeIn>
                <div className="hidden md:block text-white/40 text-3xl">→</div>
                <div className="block md:hidden text-white/40 text-2xl">↓</div>
                <FadeIn delay={0.5}>
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 text-center min-w-[180px]">
                    <p className="text-3xl md:text-4xl font-extrabold text-red-300">{t.golden_stat2_val}</p>
                    <p className="text-white/80 text-sm mt-1">{t.golden_stat2_label}</p>
                  </div>
                </FadeIn>
                <div className="hidden md:block text-white/40 text-3xl">→</div>
                <div className="block md:hidden text-white/40 text-2xl">↓</div>
                <FadeIn delay={0.6}>
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 text-center min-w-[180px]">
                    <p className="text-3xl md:text-4xl font-extrabold text-green-300">{t.golden_stat3_val}</p>
                    <p className="text-white/80 text-sm mt-1">{t.golden_stat3_label}</p>
                  </div>
                </FadeIn>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                <Button
                  size="lg"
                  onClick={() => goToLogin('register')}
                  className="ripple-btn cta-glow bg-white text-blue-700 hover:bg-blue-50 shadow-2xl shadow-blue-700/20 hover:shadow-3xl transition-all duration-300 text-base font-bold py-6 px-8"
                >
                  <Crown className="mr-2 w-5 h-5" /> {t.golden_cta1} <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  asChild
                  className="ripple-btn bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-700/25 hover:shadow-xl transition-all duration-300 text-base py-6 px-8"
                >
                  <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 w-5 h-5" /> {t.golden_cta2}
                  </a>
                </Button>
              </div>

              {/* Quote penutup */}
              <div className="text-center">
                <blockquote className="text-white/90 text-base md:text-lg italic font-medium max-w-2xl mx-auto leading-relaxed">
                  &ldquo;{t.golden_quote}&rdquo;
                </blockquote>
                <div className="w-16 h-1 bg-gradient-to-r from-yellow-400 to-amber-400 mx-auto mt-4 rounded-full" />
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* =================== CARA KERJA =================== */}
      <Section className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.cara_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              {t.cara_h2_1}{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">1-2-3</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {[
            { step: '01', title: t.cara_step1_title, desc: t.cara_step1_desc, icon: Package },
            { step: '02', title: t.cara_step2_title, desc: t.cara_step2_desc, icon: Calculator },
            { step: '03', title: t.cara_step3_title, desc: t.cara_step3_desc, icon: DollarSign },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15}>
              <div className="relative text-center">
                {/* Step number */}
                <div className="text-7xl font-black text-blue-50 dark:text-white/5 absolute -top-4 left-1/2 -translate-x-1/2 select-none">
                  {item.step}
                </div>
                <div className="relative z-10 flex flex-col items-center gap-3 pt-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-600/25">
                    <item.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm max-w-xs">{item.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </Section>

      {/* =================== HARGA =================== */}
      <Section id="harga" className="bg-gradient-to-b from-gray-900 to-gray-950">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-400/10 text-blue-300 border-blue-400/20 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.harga_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              {t.harga_h2_1}{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.harga_h2_2}</span> {t.harga_h2_3}
            </h2>
            <p className="text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              {t.harga_p}
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-6xl mx-auto">
          <PricingCard
            title={t.price_economis_title}
            price="Rp 78.000"
            period={t.price_economis_period}
            description={t.price_economis_desc}
            periodBelow
            popularLabel={t.price_popular_badge}
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
            periodBelow
            popularLabel={t.price_popular_badge}
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
            periodBelow
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
          <PricingCard
            title={t.price_lifetime_title}
            price="Rp 3.888.000"
            period={t.price_lifetime_period}
            description={t.price_lifetime_desc}
            periodBelow
            popularLabel={t.price_popular_badge}
            buttonLabel={t.price_btn}
            features={[
              t.price_lifetime_f1,
              t.price_lifetime_f2,
              t.price_lifetime_f3,
              t.price_lifetime_f4,
              t.price_lifetime_f5,
              t.price_lifetime_f6,
              t.price_lifetime_f7,
              t.price_lifetime_f8,
            ]}
            delay={0}
            onSelect={() => openPayment('lifetime')}
          />
        </div>

        {/* Guarantee */}
        <FadeIn delay={0.3}>
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-6 py-3">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-sm font-semibold text-green-400">
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
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.testimoni_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              {t.testimoni_h2_1}{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.testimoni_h2_2}</span> {t.testimoni_h2_3}
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
      <section className="w-full py-16 md:py-24 relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-sky-600">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 border-2 border-white rounded-full" />
          <div className="absolute bottom-10 right-10 w-60 h-60 border-2 border-white rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-white rounded-full" />
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-8 relative z-10">
          <FadeIn>
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                {t.cta_h2_1}<br className="hidden md:block" />{' '}
                {t.cta_h2_2} <span className="underline decoration-white/50 decoration-4 underline-offset-4">{t.cta_h2_3}</span> {t.cta_h2_4}
              </h2>
              <p className="text-white/90 mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                {t.cta_p}
              </p>
            </div>
          </FadeIn>

          {/* Trust Badges */}
          <FadeIn delay={0.15}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-white font-semibold text-sm">{t.cta_trust1}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-white font-semibold text-sm">{t.cta_trust2}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-white font-semibold text-sm">{t.cta_trust3}</span>
              </div>
            </div>
          </FadeIn>

          {/* Main CTA Card */}
          <FadeIn delay={0.3}>
            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl text-center max-w-3xl mx-auto">
              <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-4">
                {t.cta_card_h3}
              </h3>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-4">
                {t.cta_card_p_pre} <span className="font-bold text-gray-900">{t.cta_card_p_bold1}</span>{t.cta_card_p_mid}
                <span className="font-bold text-blue-600"> {t.cta_card_p_bold2}</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span><strong>{t.cta_card_check1_bold}</strong>{t.cta_card_check1_post}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span><strong>{t.cta_card_check2_bold}</strong>{t.cta_card_check2_post}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span><strong>{t.cta_card_check3_bold}</strong>{t.cta_card_check3_post}</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                <Button
                  size="lg"
                  onClick={() => goToLogin('register')}
                  className="ripple-btn cta-glow bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-300 text-lg font-bold py-7 px-10"
                >
                  {t.cta_card_btn1} <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  asChild
                  className="ripple-btn bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-700/25 hover:shadow-xl transition-all duration-300 text-lg py-7 px-10"
                >
                  <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 w-5 h-5" /> {t.cta_card_btn2}
                  </a>
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-4">{t.cta_card_p_bottom}</p>
            </div>
          </FadeIn>

          {/* Reassure */}
          <FadeIn delay={0.45}>
            <p className="text-center text-white/70 text-sm mt-6 max-w-xl mx-auto leading-relaxed">
              {t.cta_reassure}
            </p>
          </FadeIn>
        </div>
      </section>

      {/* =================== FAQ =================== */}
      <Section className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-[18px] md:text-[22px] font-bold">
              {t.faq_badge}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              {t.faq_h2_1}{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">{t.faq_h2_2}</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
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
          ].map((faq, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#111] border border-gray-100 dark:border-white/10 hover:border-blue-100 dark:hover:border-white/20 hover:shadow-md transition-all duration-300">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{faq.q}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </Section>

      {/* =================== FOOTER =================== */}
      <footer className="w-full bg-gray-900 pt-12 pb-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/logo-ds.png" alt="Logo" className="w-9 h-9 rounded-xl object-contain shadow-none" />
                <span className="text-xl font-extrabold tracking-tight">
                  <span className="bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent">Darrell</span>
                  <span className="text-white"> Soft</span>
                </span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t.footer_brand_desc}
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-white font-bold text-sm mb-4">{t.footer_nav_title}</h4>
              <div className="flex flex-col gap-2">
                <a href="#fitur" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer_nav_fitur}</a>
                <a href="#harga" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer_nav_harga}</a>
                <a href="#testimoni" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer_nav_testimoni}</a>
                <a href="#faq" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer_nav_faq}</a>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-bold text-sm mb-4">{t.footer_contact_title}</h4>
              <div className="flex flex-col gap-2">
                <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer" className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-8 border-t border-gray-800">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-600 text-center md:text-left">
                &copy; {new Date().getFullYear()} Darrell Soft. {t.footer_bottom_rights}
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Shield className="w-3 h-3 text-green-500" />
                  <span>{t.footer_encrypted}</span>
                </div>
                <span className="text-gray-700">•</span>
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Shield className="w-3 h-3 text-green-500" />
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
