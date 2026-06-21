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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';


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
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  descriptionExtra?: string;
  features: string[];
  popular?: boolean;
  periodBelow?: boolean;
  delay?: number;
  onSelect: () => void;
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
              <Star className="w-3 h-3 mr-1" /> Hemat Banget!
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
            Pilih Paket <ArrowRight className="ml-1.5 w-3 h-3" />
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


export default function Home() {

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
            { src: '/dus-kue.jpg', label: 'Dus Kue' },
            { src: '/hampers.jpg', label: 'Hampers' },
            { src: '/kantong-kebab.jpg', label: 'Kantong Kebab' },
            { src: '/dus-donut.jpg', label: 'Dus Donut' },
            { src: '/dus-ayam-geprek.jpg', label: 'Dus Ayam Geprek' },
            { src: '/lunchbox-paper.jpg', label: 'Lunchbox Paper' },
            { src: '/paperbowl.png', label: 'Paperbowl' },
            { src: '/paperbag.jpg', label: 'Paperbag' },
            { src: '/hampers-lebaran.jpg', label: 'Hampers Lebaran' },
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
            alt="Mesin Cetak Kemasan"
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
                <p className="text-[9px] md:text-[11px] text-gray-600 dark:text-gray-300 leading-none">Hitung Cepat</p>
                <p className="text-xs md:text-base font-bold text-blue-700 dark:text-blue-400 leading-tight">&lt; 5 detik</p>
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
                <p className="text-[9px] md:text-[11px] text-gray-600 dark:text-gray-300 leading-none">Profit Naik</p>
                <p className="text-xs md:text-base font-bold text-green-600 dark:text-green-400 leading-tight">+40%</p>
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
            <a href="#fitur" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">Fitur</a>
            <a href="#kenapa-langganan" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">Kenapa Langganan</a>
            <a href="#harga" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">Harga</a>
            <a href="#testimoni" className="nav-link text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">Testimoni</a>
            <Button onClick={() => goToLogin()} className="ripple-btn bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-300">
              Login <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          {/* Mobile: Masuk button instead of hamburger */}
          <Button onClick={() => goToLogin()} className="md:hidden ripple-btn bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-300 text-xs px-3 py-1.5 h-8">
            Login <ChevronRight className="ml-1 w-3 h-3" />
          </Button>
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
              <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 px-8 py-3 text-2xl md:text-[28px] font-semibold">
                <Zap className="w-7 h-7 md:w-8 md:h-8 mr-3" /> Sistem Hitung Cepat Percetakan
              </Badge>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
            {/* Left - Text */}
            <FadeIn direction="right">
              <div className="flex flex-col gap-6">
                <h1 className="text-5xl md:text-6xl lg:text-7xl text-gray-900 dark:text-gray-100 leading-tight" style={{ fontWeight: 900 }}>
                  <span style={{ fontWeight: 900 }}>Jangan jadi penonton saja!!!.{' '}</span>
                  <span className="font-extrabold" style={{ color: '#4374C1', fontWeight: 900 }}>Sekarang sudah bisa mulai bisnis cetak</span>{' '}
                  <span className="bg-gradient-to-r from-red-500 to-rose-500 bg-clip-text text-transparent" style={{ fontWeight: 900 }}>Dus Makanan, Dus Kue, Hampers, dll</span>
                </h1>

                {/* Mobile: show images right after H1 (below the "Hampers" text) */}
                <div className="md:hidden">{heroImagePanel}</div>

                <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-bold text-blue-600 dark:text-blue-400">Tidak ada alasan lagi gak bisa hitung modal cetakan...!!</span><br />
                  <span className="font-bold text-gray-900 dark:text-gray-100">Pakai Darrell Soft aja!</span>.<br />
                  Dulu cuma yang ahli yang bisa hitung modal cetak.
                  Sekarang, <span className="font-semibold text-blue-700 dark:text-blue-400">siapapun bisa</span> jadi pengusaha percetakan yang sukses!
                </p>

                <p className="text-base text-gray-500 dark:text-gray-500 leading-relaxed">
                  Lupakan kalkulator manual yang bikin pusing. Dengan Darrell Soft, hitung modal jadi semudah mengetik.
                </p>



                {/* Trust signals */}
                <div className="flex items-center gap-4 mt-4 flex-wrap">
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <Shield className="w-5 h-5 text-green-500" />
                    <span className="font-extrabold">Tanpa ikatan kontrak</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-extrabold">Bisa batal kapan saja tanpa syarat</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-extrabold">Bisa langganan 1 bulan saja</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.375rem' }}>
                    <X className="w-5 h-5 text-red-400" />
                    <span className="font-extrabold">Tanpa denda</span>
                  </div>
                </div>

                {/* Hero CTA — Primary */}
                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                  <Button
                    size="lg"
                    onClick={() => goToLogin('register')}
                    className="ripple-btn cta-glow bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-300 text-base font-bold py-6 px-8"
                  >
                    Langganan Sekarang — Gratis 3 Hari! <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => document.getElementById('harga')?.scrollIntoView({ behavior: 'smooth' })}
                    className="ripple-btn border-2 border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/30 font-bold transition-all duration-300 text-base py-6 px-8"
                  >
                    Lihat Paket Harga
                  </Button>
                </div>
                <p className="text-base text-black dark:text-white mt-2">Mulai gratis, tanpa kartu kredit. Berhenti kapan saja, tanpa denda.</p>
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
              { value: 7168, suffix: '+', label: 'Pengguna Aktif', icon: Printer },
              { value: 98, suffix: '%', label: 'Tingkat Kepuasan', icon: Star },
              { value: 168800, suffix: '+', label: 'Transaksi Sukses', icon: Package },
              { value: 24, suffix: '/7', label: 'Support Online', icon: Shield },
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
              <Badge className="bg-yellow-400 text-yellow-900 border-0 mb-4 px-8 py-3 text-[28px] font-bold shadow-lg shadow-yellow-400/30 animate-pulse">
                <Zap className="w-8 h-8 mr-2" /> Penawaran Terbatas
              </Badge>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                Jangan Biarkan Bisnis Cetakmu<br className="hidden md:block" />{' '}
                <span className="underline decoration-white/50 decoration-4 underline-offset-4">Terus Rugi</span> Karena Salah Hitung!
              </h2>
              <p className="text-white/90 mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                Berlangganan Darrell Soft lebih murah daripada rugi satu kali salah hitung!
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
                <h3 className="text-lg font-bold text-white mb-2">Hitung Akurat</h3>
                <p className="text-white/80 text-sm leading-relaxed">Perhitungan 100% akurat, tidak ada lagi kesalahan hitung yang bikin rugi jutaan rupiah.</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center hover:bg-white/20 transition-all duration-300">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-400 to-sky-500 flex items-center justify-center shadow-lg mb-3">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Profit Maksimal</h3>
                <p className="text-white/80 text-sm leading-relaxed">Tentukan margin sendiri, setiap order pasti menguntungkan. Profit naik sampai 40%!</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center hover:bg-white/20 transition-all duration-300">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-lg mb-3">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Hemat Waktu 90%</h3>
                <p className="text-white/80 text-sm leading-relaxed">Yang biasa 30 menit, sekarang cuma 3 detik. Waktumu lebih produktif untuk yang lain!</p>
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
                Ya, Saya Mau Coba Gratis! <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                asChild
                className="ripple-btn bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-700/25 hover:shadow-xl transition-all duration-300 text-lg py-7 px-10"
              >
                <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 w-5 h-5" /> Tanya Admin Dulu
                </a>
              </Button>
            </div>
            <p className="text-center text-white/70 text-sm">Cuma 3 detik daftar, langsung bisa pakai.</p>
          </FadeIn>
        </div>
      </section>

      {/* =================== FITUR =================== */}
      <Section id="fitur" className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-2xl">
              Fitur Unggulan
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              Hitung Modal Jadi{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Semudah Mengetik</span>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              Semua yang kamu butuhkan untuk mengelola bisnis percetakan, dalam satu aplikasi yang powerful.
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          <FeatureCard
            icon={MousePointerClick}
            title="Update Harga Sekali Klik"
            desc="Update harga kertas dan ongkos cetak sekali klik. Tidak perlu edit satu-satu, semua otomatis tersinkronisasi."
            delay={0}
          />
          <FeatureCard
            icon={Calculator}
            title="Ketik Ukuran → Langsung Harga"
            desc="Ketik ukuran bahan, aplikasi langsung kasih harga modal. Otomatis dan akurat, tanpa kalkulator manual."
            delay={0.15}
          />
          <FeatureCard
            icon={DollarSign}
            title="Tentukan Profit, Harga Jual Muncul"
            desc="Tentukan profit yang kamu mau, harga jual langsung muncul. Kontrol penuh atas margin keuntunganmu."
            delay={0.3}
          />
        </div>
      </Section>

      {/* =================== KEUNGGULAN =================== */}
      <Section id="keunggulan" className="bg-gradient-to-b from-blue-50/30 to-white dark:from-black dark:to-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-2xl">
              Kenapa Darrell Soft?
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Cepat, Akurat,</span> dan Fleksibel!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              Bisa diakses via Desktop maupun HP, kapan saja dan di mana saja.
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          {[
            {
              icon: Monitor,
              title: 'Akses via Desktop',
              desc: 'Tampilan penuh yang nyaman untuk penggunaan di kantor atau toko. Semua fitur lengkap tersedia.',
              color: 'from-blue-600 to-red-500',
            },
            {
              icon: Smartphone,
              title: 'Akses via HP',
              desc: 'Mobile-friendly! Kelola bisnis percetakanmu langsung dari smartphone, di mana saja kamu berada.',
              color: 'from-sky-400 to-blue-600',
            },
            {
              icon: Zap,
              title: 'Kecepatan Tinggi',
              desc: 'Proses kalkulasi instan. Tidak perlu menunggu lama, semua perhitungan selesai dalam hitungan detik.',
              color: 'from-sky-300 to-sky-400',
            },
            {
              icon: Shield,
              title: 'Data Aman',
              desc: 'Data bisnismu tersimpan dengan aman. Backup otomatis dan enkripsi untuk keamanan maksimal.',
              color: 'from-green-500 to-emerald-500',
            },
            {
              icon: Download,
              title: 'Install di Windows & Mac',
              desc: 'Bisa diinstall langsung di komputer Windows dan MacBook. Tampil seperti aplikasi desktop asli.',
              color: 'from-blue-500 to-indigo-500',
            },
            {
              icon: Smartphone,
              title: 'Install di Android & iOS',
              desc: 'Install langsung di HP Android dan iPhone. Gampang digunakan, tidak usah buka browser lagi.',
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
            <Badge variant="secondary" className="bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 border-sky-100 dark:border-sky-800 mb-4 px-6 py-2 text-2xl">
              Kenapa Harus Berlangganan?
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              Data Aman di <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Cloud</span>,{' '}
              Bisa Buka di <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Mana Saja</span>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              Darrell Soft berbasis cloud — data bisnismu tersimpan aman dan bisa diakses kapan saja, di mana saja, selama ada internet.
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
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">☁️ Data Aman di Cloud, Tidak Hilang!</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>HP hilang/laptop rusak? <strong className="text-gray-900 dark:text-gray-100">Data tetap aman</strong> di cloud server terenkripsi</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Login dari perangkat mana saja, <strong className="text-gray-900 dark:text-gray-100">data langsung ada lengkap dan utuh</strong></span>
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
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">🌍 Bisa Buka di Mana Saja — Dalam & Luar Negeri!</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Jakarta, Surabaya, atau luar negeri — <strong className="text-gray-900 dark:text-gray-100">selama ada internet, bisnis tetap jalan</strong></span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>HP saat di perjalanan, <strong className="text-gray-900 dark:text-gray-100">laptop saat di kantor</strong> — semua bisa!</span>
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
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">📱 HP & Laptop, Semua Bisa!</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span><strong className="text-gray-900 dark:text-gray-100">Satu akun, semua perangkat</strong> tersinkronisasi real-time</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>Update di HP, <strong className="text-gray-900 dark:text-gray-100">langsung muncul di laptop</strong> — dan sebaliknya</span>
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
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">🛡️ Kenapa Bayar? Investasi Kecil, Hasil Besar!</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>Cuma <strong className="text-amber-600 dark:text-amber-400">Rp 128.000/bulan</strong> — lebih murah dari sekali salah hitung!</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span><strong className="text-gray-900 dark:text-gray-100">Tidak perlu bayar server, IT, atau maintenance</strong> — semua kami tangani</span>
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
                  <span className="text-yellow-200 font-bold text-[28px]">Kesempatan Emas</span>
                </div>
                <h3 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">
                  UMKM Makanan Sudah Banyak...<br />
                  <span className="text-yellow-300">Tapi Bos Percetakan Masih Sedikit!</span>
                </h3>
              </div>

              {/* Fakta & Artinya */}
              <div className="grid md:grid-cols-2 gap-5 mb-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-400/20 flex items-center justify-center">
                      <span className="text-lg">📊</span>
                    </div>
                    <h4 className="font-bold text-white text-base">Fakta</h4>
                  </div>
                  <p className="text-white/85 text-sm leading-relaxed">
                    UMKM makanan sudah <strong className="text-yellow-300">jutaan</strong>, tapi setiap UMKM butuh <strong className="text-white">box, kemasan, stiker, brosur</strong> — semua produk cetak!
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-green-400/20 flex items-center justify-center">
                      <span className="text-lg">💡</span>
                    </div>
                    <h4 className="font-bold text-white text-base">Artinya</h4>
                  </div>
                  <p className="text-white/85 text-sm leading-relaxed">
                    Peluang bos percetakan masih <strong className="text-yellow-300">sangat besar</strong>. Orang takut karena tidak bisa hitung modal — <strong className="text-white">Darrell Soft hilangkan rintangan itu!</strong>
                  </p>
                </div>
              </div>

              {/* 3 Statistics Flow */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-8">
                <FadeIn delay={0.4}>
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 text-center min-w-[180px]">
                    <p className="text-3xl md:text-4xl font-extrabold text-yellow-300">64 Juta+</p>
                    <p className="text-white/80 text-sm mt-1">UMKM di Indonesia</p>
                  </div>
                </FadeIn>
                <div className="hidden md:block text-white/40 text-3xl">→</div>
                <div className="block md:hidden text-white/40 text-2xl">↓</div>
                <FadeIn delay={0.5}>
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 text-center min-w-[180px]">
                    <p className="text-3xl md:text-4xl font-extrabold text-red-300">Sedikit</p>
                    <p className="text-white/80 text-sm mt-1">Pengusaha Percetakan</p>
                  </div>
                </FadeIn>
                <div className="hidden md:block text-white/40 text-3xl">→</div>
                <div className="block md:hidden text-white/40 text-2xl">↓</div>
                <FadeIn delay={0.6}>
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/20 text-center min-w-[180px]">
                    <p className="text-3xl md:text-4xl font-extrabold text-green-300">Peluang Besar!</p>
                    <p className="text-white/80 text-sm mt-1">Jadilah Bos Cetakan</p>
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
                  <Crown className="mr-2 w-5 h-5" /> Jadilah Bos Percetakan! <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  asChild
                  className="ripple-btn bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-700/25 hover:shadow-xl transition-all duration-300 text-base py-6 px-8"
                >
                  <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 w-5 h-5" /> Konsultasi Gratis
                  </a>
                </Button>
              </div>

              {/* Quote penutup */}
              <div className="text-center">
                <blockquote className="text-white/90 text-base md:text-lg italic font-medium max-w-2xl mx-auto leading-relaxed">
                  &ldquo;UMKM harus naik kelas! Dari yang cuma jualan, jadi pengusaha yang punya sistem.&rdquo;
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
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-2xl">
              Cara Kerja
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              Semudah{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">1-2-3</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {[
            { step: '01', title: 'Masukkan Spesifikasi', desc: 'Ketik ukuran bahan, jenis kertas, dan jumlah cetak yang diinginkan.', icon: Package },
            { step: '02', title: 'Sistem Hitung Otomatis', desc: 'Aplikasi langsung menghitung modal berdasarkan spesifikasi yang dimasukkan.', icon: Calculator },
            { step: '03', title: 'Tentukan & Jual', desc: 'Atur profit yang diinginkan, harga jual otomatis muncul. Siap cetak!', icon: DollarSign },
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
            <Badge variant="secondary" className="bg-blue-400/10 text-blue-300 border-blue-400/20 mb-4 px-6 py-2 text-2xl">
              Harga
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              Pilih Paket{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Terbaik</span> Kamu
            </h2>
            <p className="text-gray-400 mt-4 max-w-2xl mx-auto text-base md:text-lg">
              Mulai dari gratis, atau berlangganan untuk fitur lengkap.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-6xl mx-auto">
          <PricingCard
            title="Bulanan Ekonomis"
            price="Rp 78.000"
            period="per bulan"
            description="1 akun, hemat untuk pemula"
            periodBelow
            features={[
              '1 akun pengguna',
              'Semua fitur kalkulasi cetak',
              'Update harga kertas & ongkos',
              'Hitung otomatis harga modal',
              'Akses Desktop & Mobile',
              <span key="bold" className="font-bold">Boleh langganan 1 bulan saja</span>,
              'Tidak ada biaya denda sama sekali',
            ]}
            delay={0}
            onSelect={() => openPayment('bulanan-ekonomis')}
          />
          <PricingCard
            title="Langganan Bulanan"
            price="Rp 128.000"
            period="per bulan"
            description="Langganan bulanan, sangat fleksibel"
            periodBelow
            features={[
              '2 akun untuk team',
              'Semua fitur kalkulasi cetak',
              'Update harga kertas & ongkos',
              'Hitung otomatis harga modal',
              'Akses Desktop & Mobile',
              <span key="bold" className="font-bold">Boleh langganan 1 bulan saja</span>,
              'Tidak ada biaya denda sama sekali',
            ]}
            delay={0}
            onSelect={() => openPayment('bulanan')}
          />
          <PricingCard
            title="Langganan Tahunan"
            price="Rp 888.000"
            period="per tahun"
            description="Hanya Rp 74.000/bulan"
            descriptionExtra="— hemat 37%!"
            popular
            periodBelow
            features={[
              '3 akun untuk group',
              'Semua fitur kalkulasi cetak',
              'Update harga kertas & ongkos',
              'Hitung otomatis harga modal',
              'Akses Desktop & Mobile',
              'Priority Support 24/7',
              'Laporan bulanan lengkap',
              'Backup data otomatis',
            ]}
            delay={0.15}
            onSelect={() => openPayment('tahunan')}
          />
          <PricingCard
            title="Tanpa Langganan"
            price="Rp 3.888.000"
            period="sekali bayar"
            description="Beli putus, tidak perlu langganan"
            periodBelow
            features={[
              '4 akun untuk group solid',
              'Semua fitur kalkulasi cetak',
              'Update harga kertas & ongkos',
              'Hitung otomatis harga modal',
              'Akses Desktop & Mobile',
              'Beli sekali, pakai selamanya',
              'Tidak ada biaya berlangganan',
              'Priority Support 24/7',
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
                Tanpa Ikatan Apapun! Bisa batal kapan saja tanpa denda.
              </span>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* =================== TESTIMONI =================== */}
      <Section id="testimoni" className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4 px-6 py-2 text-2xl">
              Testimoni
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              Dipercaya{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Ribuan Pengusaha</span> Percetakan
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
          <TestimonialCard
            name="Maman"
            role="Pemilik Tunas Makmur"
            quote="Dulu hitung modal cetak pakai kalkulator, sering salah dan rugi. Sekarang pakai Darrell Soft, semua otomatis dan akurat. Profit naik 40%!"
            avatar="M"
            delay={0}
          />
          <TestimonialCard
            name="Jimmy"
            role="Owner SiPrint"
            quote="Aplikasinya super mudah dipakai. Saya yang nggak paham komputer pun bisa langsung pakai. Harga paketnya juga sangat terjangkau."
            avatar="J"
            delay={0.15}
          />
          <TestimonialCard
            name="Lina Listiawati"
            role="Owner Rajabowl"
            quote="Support-nya responsif banget! Setiap ada pertanyaan langsung dijawab. Darrell Soft memang solusi tepat untuk percetakan."
            avatar="LL"
            delay={0.3}
          />
          <TestimonialCard
            name="Gunawan"
            role="Pemilik One Printing"
            quote="Bayar 1 bulan aja gpp, bulan berikutnya tidak usah, tidak ada denda. Seperti langganan Netflix. Fleksibel banget!"
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
                Jangan Tunggu Lagi!<br className="hidden md:block" />{' '}
                Mulai <span className="underline decoration-white/50 decoration-4 underline-offset-4">Langganan</span> Sekarang
              </h2>
              <p className="text-white/90 mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                Kompetitormu sudah pakai Darrell Soft. Mereka hitung modal dalam hitungan detik, sementara kamu masih pakai kalkulator?
              </p>
            </div>
          </FadeIn>

          {/* Trust Badges */}
          <FadeIn delay={0.15}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-white font-semibold text-sm">Gratis 3 hari trial</span>
              </div>
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-white font-semibold text-sm">Tanpa kartu kredit</span>
              </div>
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-white font-semibold text-sm">Bisa batal kapan saja</span>
              </div>
            </div>
          </FadeIn>

          {/* Main CTA Card */}
          <FadeIn delay={0.3}>
            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl text-center max-w-3xl mx-auto">
              <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-4">
                Cuma Rp 128.000/bulan — Lebih Murah dari Gaji Karyawan 1 Hari!
              </h3>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-4">
                Bayangkan: <span className="font-bold text-gray-900">1 kali salah hitung saja bisa rugi ratusan ribu hingga jutaan rupiah</span>. 
                Dengan Darrell Soft, kamu bayar cuma Rp 128.000/bulan tapi hemat jutaan dari kesalahan hitung. 
                <span className="font-bold text-blue-600"> Investasi kecil, untung besar!</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span><strong>Tanpa kontrak</strong> — bebas berhenti kapan saja</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span><strong>Tanpa denda</strong> — tidak ada biaya tersembunyi</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span><strong>Coba gratis 3 hari</strong> — buktikan dulu!</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                <Button
                  size="lg"
                  onClick={() => goToLogin('register')}
                  className="ripple-btn cta-glow bg-gradient-to-r from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-300 text-lg font-bold py-7 px-10"
                >
                  Langganan Sekarang — Gratis! <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  asChild
                  className="ripple-btn bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-700/25 hover:shadow-xl transition-all duration-300 text-lg py-7 px-10"
                >
                  <a href={WHATSAPP_URL} target="whatsapp" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 w-5 h-5" /> Tanya Admin Dulu
                  </a>
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-4">💎 Sudah dipercaya 7.000+ pengusaha percetakan di Indonesia</p>
            </div>
          </FadeIn>

          {/* Reassure */}
          <FadeIn delay={0.45}>
            <p className="text-center text-white/70 text-sm mt-6 max-w-xl mx-auto leading-relaxed">
              Masih ragu? Chat admin kami, konsultasi gratis tanpa kewajiban berlangganan.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* =================== FAQ =================== */}
      <Section className="bg-white dark:bg-black">
        <FadeIn>
          <div className="text-center mb-12 md:mb-16">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4">
              FAQ
            </Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              Pertanyaan yang{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">Sering Ditanyakan</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {[
            {
              q: 'Apakah bisa dicoba dulu sebelum berlangganan?',
              a: 'Tentu! Kami menyediakan masa trial gratis agar kamu bisa merasakan semua fitur Darrell Soft sebelum memutuskan berlangganan.',
            },
            {
              q: 'Bagaimana cara berlangganan?',
              a: 'Sangat mudah! Cukup DM kami, pilih paket yang sesuai, dan lakukan pembayaran. Akun kamu akan langsung aktif.',
            },
            {
              q: 'Apakah data saya aman?',
              a: 'Ya! Data kamu dilindungi dengan enkripsi dan backup otomatis. Privasi dan keamanan data adalah prioritas utama kami.',
            },
            {
              q: 'Bisa berhenti berlangganan kapan saja?',
              a: 'Tentu! Tidak ada ikatan kontrak. Kamu bisa berhenti kapan saja tanpa denda atau biaya tambahan.',
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
                Sistem kasir percetakan yang membantu menghitung modal, mengelola harga, dan meningkatkan profit bisnis cetakmu.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-white font-bold text-sm mb-4">Navigasi</h4>
              <div className="flex flex-col gap-2">
                <a href="#fitur" className="text-gray-400 hover:text-white text-sm transition-colors">Fitur</a>
                <a href="#harga" className="text-gray-400 hover:text-white text-sm transition-colors">Harga</a>
                <a href="#testimoni" className="text-gray-400 hover:text-white text-sm transition-colors">Testimoni</a>
                <a href="#faq" className="text-gray-400 hover:text-white text-sm transition-colors">FAQ</a>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-bold text-sm mb-4">Hubungi Kami</h4>
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
                &copy; {new Date().getFullYear()} Darrell Soft. All rights reserved.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Shield className="w-3 h-3 text-green-500" />
                  <span>Data Terenkripsi</span>
                </div>
                <span className="text-gray-700">•</span>
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Shield className="w-3 h-3 text-green-500" />
                  <span>Koneksi Aman</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
