'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer, ImageIcon, Loader2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { InvoicePreview } from './invoice-preview';
import { captureDocumentPaperJpg, resolveDocumentPreviewEl } from '@/lib/capture-jpg';
import { printBlobHiRes } from '@/lib/print-hi-res';
import { shareJpgToWhatsApp } from '@/lib/share-jpg';
import type { InvoiceData } from '@/lib/types';

interface InvoicePratinjauScreenProps {
  data: InvoiceData;
  /** Kembali ke form Buat Invoice (Ubah Data) */
  onBack: () => void;
  /** Simpan & lanjut ke halaman Surat Jalan */
  onSuratJalan: () => void;
  savingSj?: boolean;
  /** true = invoice sedang DIHAPUS (dibuka dari Sampah): sembunyikan semua
   *  aksi (Ubah Data/Cetak/JPG/Surat Jalan) agar tidak mengubah dokumen ini */
  isDeleted?: boolean;
}

/**
 * Halaman pratinjau invoice (setelah tombol Simpan di form Buat Invoice).
 * Menampilkan pratinjau A5 dengan GARIS TEPI (border) di sekeliling halaman:
 *   - Desktop: scale dasar fit (lebar & tinggi viewport) lalu DIPERBESAR 56%
 *     (×1.56 = 1.2 lama × 1.3 — +30% dari ukuran sebelumnya; maks 3.12x)
 *     — bila meluber ke bawah, area bisa discroll (scrollbar disembunyikan).
 *   - Mobile: pratinjau mengisi LEBAR PENUH layar (full mobile, tepi-ke-tepi).
 * Tombol aksi Cetak, JPG (bagikan/unduh), dan Surat Jalan berada DI ATAS
 * pratinjau (bar atas, sejajar tombol Ubah Data).
 *
 * Wrapper #document-preview disertakan agar CSS @media print (globals.css)
 * dapat me-reset posisi/scale sehingga A5 tercetak penuh, dan tombol JPG
 * dapat menemukan [data-document-preview] untuk di-capture. Border garis tepi
 * hanya tampil di layar (print:border-0) dan tidak ikut ke hasil JPG karena
 * capture menyasar elemen .a5-page di dalam scaler.
 */
export function InvoicePratinjauScreen({ data, onBack, onSuratJalan, savingSj = false, isDeleted = false }: InvoicePratinjauScreenProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [generatingJpg, setGeneratingJpg] = useState(false);
  // Target render tombol aksi: element #invoice-detail-actions di bar TERATAS
  // halaman (sejajar judul "Detail Invoice Baru") via portal. Fallback 'inline'
  // = render di bar pratinjau sendiri bila mount point tidak tersedia.
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | 'inline' | null>(null);

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const find = () => {
      const el = document.getElementById('invoice-detail-actions');
      if (el) {
        setActionsTarget(el);
        return;
      }
      if (++tries < 20) {
        timer = setTimeout(find, 50);
      } else {
        setActionsTarget('inline');
      }
    };
    find();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  // Scale halaman A5:
  //   - Desktop (lg+): scale dasar = min(lebar / tinggi), lalu DIPERBESAR 56%
  //     (×1.56 = 1.2 lama × 1.3 sesuai permintaan +30% dari sekarang; maks
  //     3.12x) — pratinjau lebih besar; bila tingginya meluber, area bisa
  //     discroll (scrollbar disembunyikan via .hide-scrollbar, scroll tetap
  //     berfungsi dengan wheel/trackpad).
  //   - Mobile (<lg): scale mengisi LEBAR PENUH layar (full mobile,
  //     tepi-ke-tepi) — sudah maksimal, tidak diperbesar agar tidak muncul
  //     scroll horizontal.
  // Tinggi area dihitung dari posisi NYATA area pratinjau sehingga pratinjau
  // mengisi sisa viewport tanpa scroll halaman.
  const fit = useCallback(() => {
    const area = areaRef.current;
    const scaler = scalerRef.current;
    if (!area || !scaler) return;
    const a5Page = scaler.querySelector('.a5-page') as HTMLElement | null;
    if (!a5Page) return;

    const naturalW = a5Page.offsetWidth;
    const naturalH = a5Page.offsetHeight;
    if (naturalW === 0 || naturalH === 0) {
      // Belum ter-layout — coba lagi frame berikutnya
      requestAnimationFrame(fit);
      return;
    }

    const areaTop = area.getBoundingClientRect().top;
    // Tanpa bar aksi bawah — area pratinjau mengisi sisa viewport.
    const availH = Math.max(120, window.innerHeight - areaTop - 8);
    const isMobile = window.innerWidth < 1024;
    // Mobile: tanpa padding horizontal (-mx-4 + px-0) → clientWidth = lebar
    // layar penuh. Desktop: padding lg:p-4 (32px total) dikurangkan.
    const availW = isMobile
      ? Math.max(120, area.clientWidth)
      : Math.max(120, area.clientWidth - 32);
    // Mobile: utamakan lebar penuh (full mobile) — dikurangi 2px garis tepi
    // (border kiri+kanan scaler) agar totalnya pas tepi-ke-tepi tanpa scroll
    // horizontal. Desktop: muat lebar DAN tinggi (tinggi konten = tinggi
    // terkunci - padding vertikal 32px).
    const baseScale = isMobile
      ? (availW - 2) / naturalW
      : Math.min(availW / naturalW, (availH - 32) / naturalH, 2);
    // Desktop: pratinjau diperbesar 56% dari ukuran dasar (1.2 lama × 1.3
    // = +30% dari ukuran sebelumnya; maks total 3.12x).
    // Mobile: sudah full lebar layar — tetap memakai baseScale agar tidak
    // muncul scroll horizontal.
    const scale = isMobile ? baseScale : Math.min(baseScale * 1.56, 3.12);

    // Kunci tinggi area secara eksplisit agar pratinjau pas di viewport
    // (di-reset kembali oleh CSS print via #invoice-preview-area).
    area.style.height = `${availH}px`;

    a5Page.style.transform = `scale(${scale})`;
    a5Page.style.transformOrigin = 'top left';
    // +2px = ruang border 1px kiri/kanan (atas/bawah) scaler agar garis tepi
    // tidak tertutup halaman putih (box-sizing border-box).
    scaler.style.width = `${naturalW * scale + 2}px`;
    scaler.style.height = `${naturalH * scale + 2}px`;
  }, []);

  useLayoutEffect(() => {
    fit();
    const raf = requestAnimationFrame(fit);
    const timer = setTimeout(fit, 250);
    window.addEventListener('resize', fit);
    // ResizeObserver: re-fit setiap kali ukuran NYATA area berubah (setelah
    // layout settles) — menutup transien resize/transisi CSS yang bisa membuat
    // satu kali fit memakai lebar lama (scale tidak konvergen).
    // Guard lastW/lastH mencegah loop (fit mengunci tinggi area → RO fire lagi).
    let roRaf = 0;
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(fit);
    });
    if (areaRef.current) ro.observe(areaRef.current);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(roRaf);
      clearTimeout(timer);
      window.removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, [fit, data]);

  // Cetak: hasil cetak = gambar JPG hi-res 300 DPI yang sama dengan hasil JPG
  // (identik mobile & desktop) — menangkap .a5-page berukuran tetap 148mm,
  // bukan wrapper scaler yang skala-nya mengikuti viewport.
  const handleCetak = async () => {
    toast.dismiss();
    try {
      const previewEl = resolveDocumentPreviewEl();
      if (!previewEl) {
        toast.error('Pratinjau tidak ditemukan');
        return;
      }
      const blob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 });
      const ok = await printBlobHiRes(blob, {
        title: `Invoice ${data.nomor || ''}`.trim(),
        page: '148mm 210mm',
        margin: '0',
      });
      if (!ok) toast.error('Popup diblokir. Izinkan popup untuk mencetak.');
    } catch (err) {
      console.error('Print error:', err);
      toast.error('Gagal menyiapkan cetakan');
    }
  };

  const handleJpg = async () => {
    setGeneratingJpg(true);
    try {
      const nomor = data.nomor || 'draft';
      const fileName = `${nomor.replace(/\//g, '-')}.jpg`;
      // Hi-res 300 DPI dari .a5-page (ukuran tetap 148mm) — hasil identik
      // mobile & desktop, bukan wrapper scaler yang mengikuti viewport.
      const previewEl = resolveDocumentPreviewEl();
      if (!previewEl) {
        toast.error('Pratinjau tidak ditemukan');
        return;
      }

      const blob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 });
      if (!blob || !(blob instanceof Blob)) {
        toast.error('Gagal membuat JPG - blob tidak valid');
        return;
      }

      const result = await shareJpgToWhatsApp({
        blob,
        fileName,
        documentLabel: 'Invoice',
        phone: data.client?.kontak || '',
      });

      if (result.status === 'shared') {
        toast.success('Invoice dibagikan ke WhatsApp');
      } else if (result.status === 'cancelled') {
        // User membatalkan — tanpa notifikasi
      } else if (result.status === 'downloaded') {
        toast.success(`${fileName} tersimpan ke perangkat`, {
          description: 'File JPG telah diunduh ke folder Downloads.',
        });
      } else {
        toast.error(result.error || 'Gagal memproses JPG');
      }
    } catch (err) {
      console.error('JPG generation error:', err);
      toast.error('Gagal membuat JPG. Coba lagi atau gunakan Cetak.');
    } finally {
      setGeneratingJpg(false);
    }
  };

  const cetakButton = (
    <Button size="sm" onClick={() => { void handleCetak() }} className="bg-emerald-600 hover:bg-emerald-700 h-9">
      <Printer className="mr-1.5 h-3.5 w-3.5" />
      Cetak
    </Button>
  );
  const jpgButton = (
    <Button
      size="sm"
      onClick={handleJpg}
      disabled={generatingJpg}
      className="bg-green-600 hover:bg-green-700 disabled:opacity-50 h-9"
    >
      {generatingJpg ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          JPG...
        </>
      ) : (
        <>
          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
          JPG
        </>
      )}
    </Button>
  );
  const suratJalanButton = (
    <Button
      size="sm"
      onClick={onSuratJalan}
      disabled={savingSj}
      className="bg-orange-600 hover:bg-orange-700 h-9"
    >
      <Truck className="mr-1.5 h-3.5 w-3.5" />
      {savingSj ? 'Menyimpan...' : 'Surat Jalan'}
    </Button>
  );

  return (
    <div className="flex flex-col">
      {/* Bar atas: Ubah Data + judul. Tombol Cetak/JPG/Surat Jalan dipindah
          ke bar TERATAS halaman (sejajar judul "Detail Invoice") via portal.
          Saat invoice dihapus (dibuka dari Sampah): tanpa aksi edit/cetak. */}
      <div className="print:hidden flex flex-wrap items-center gap-2 shrink-0">
        {!isDeleted && (
          <Button variant="outline" size="sm" onClick={onBack} className="h-9 gap-1.5 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Ubah Data
          </Button>
        )}
        <h2 className="text-sm md:text-base font-bold tracking-tight text-foreground">Pratinjau Invoice</h2>
        {isDeleted && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-red-200 text-red-600 bg-red-50">Dihapus</Badge>
        )}
        {data.nomor && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{data.nomor}</span>
        )}
        {!isDeleted && actionsTarget === 'inline' && (
          <div className="flex items-center gap-2 sm:ml-auto">
            {cetakButton}
            {jpgButton}
            {suratJalanButton}
          </div>
        )}
      </div>

      {!isDeleted && actionsTarget instanceof HTMLElement &&
        createPortal(
          <>
            {cetakButton}
            {jpgButton}
            {suratJalanButton}
          </>,
          actionsTarget
        )}

      {/* Area pratinjau A5 — tetap terlihat saat print (CSS me-reset #document-preview).
          Mobile: -mx-4 menetralkan padding main p-4 agar pratinjau full lebar layar.
          hide-scrollbar: scrollbar disembunyikan (scroll tetap berfungsi) agar
          tampilan bersih saat pratinjau lebih besar meluber ke bawah. */}
      <div ref={areaRef} id="invoice-preview-area" className="flex items-start justify-center overflow-auto hide-scrollbar min-h-0 -mx-4 py-2 lg:mx-0 lg:p-4 print:overflow-visible print:p-0 print:mx-0 print:my-0">
        <div id="document-preview">
          <div ref={scalerRef} data-preview-scaler className="flex-shrink-0 border border-slate-400 print:border-0">
            <InvoicePreview data={data} showPelunasanLabel={data.type === 'invoice-pelunasan'} />
          </div>
        </div>
      </div>

    </div>
  );
}
