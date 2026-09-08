'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Eye, X, ChevronUp, ChevronDown } from 'lucide-react';

interface DocumentEditorLayoutProps {
  title?: string;
  children: React.ReactNode;
  previewContent: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * 'inline' (default): pratinjau tampil berdampingan di desktop (sticky panel)
   *   dan collapsible di mobile — dipakai surat jalan & purchase order.
   * 'popup': pratinjau TIDAK menempati layout — dibuka sebagai popup overlay
   *   layar penuh via tombol "Lihat Pratinjau A5". Pratinjau tetap ter-mount di
   *   luar layar saat popup tertutup sehingga tombol Cetak (window.print →
   *   #document-preview) dan JPG (capture [data-document-preview]) tetap
   *   berfungsi tanpa membuka popup.
   * 'inline-bottom': pratinjau SELALU tampil di bawah form (tanpa tombol
   *   "Lihat Pratinjau A5") — lebar dibatasi previewMaxWidth, di-scale agar pas,
   *   dengan garis outline. Dipakai halaman Buat Invoice / Surat Jalan / PO.
   */
  previewMode?: 'inline' | 'popup' | 'inline-bottom';
  /**
   * 1 (default) = lebar form standar (max-w-3xl).
   * 2 = form dibagi 2 kolom di desktop — container dilebarkan (max-w-5xl)
   *   supaya tiap kolom cukup lega. Grid kolomnya disusun oleh editor sendiri.
   */
  formColumns?: 1 | 2;
  /**
   * Lebar maksimum (px) container pratinjau untuk mode 'inline-bottom'.
   * Mobile otomatis full-width (dibatasi padding container).
   */
  previewMaxWidth?: number;
}

/**
 * Shared layout for document editors (invoice, surat-jalan, purchase-order,
 * invoice-pelunasan).
 *
 * Mode inline: renders the A5 preview (148mm wide ≈ 559px) in TWO containers:
 *   - Desktop: a sticky side panel (lg+)
 *   - Mobile: a collapsible inline section (<lg)
 *
 * Mode popup: renders ONE preview container — a fixed overlay that is
 *   positioned off-screen while closed. The `.a5-page` inside is scaled to fit
 *   the viewport when open and left at natural size when closed.
 *
 * Each `.a5-page` is scaled to fit its container via a CSS `transform: scale()`.
 * `offsetWidth`/`offsetHeight` are used for measurement because they are NOT
 * affected by CSS transforms.
 */
export function DocumentEditorLayout({
  children,
  previewContent,
  actions,
  previewMode = 'inline',
  formColumns = 1,
  previewMaxWidth = 620,
}: DocumentEditorLayoutProps) {
  const isPopup = previewMode === 'popup';
  const isInlineBottom = previewMode === 'inline-bottom';
  const wideForm = formColumns === 2;
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const desktopWrapperRef = useRef<HTMLDivElement>(null);
  const mobileWrapperRef = useRef<HTMLDivElement>(null);
  const popupWrapperRef = useRef<HTMLDivElement>(null);
  const bottomWrapperRef = useRef<HTMLDivElement>(null);

  /**
   * Scale a single `.a5-page` to fit its wrapper container.
   *
   * Uses `offsetWidth`/`offsetHeight` (which are NOT affected by CSS
   * `transform: scale()`) to read the page's natural pixel size, then applies
   * `transformOrigin: top left` so the scaled content anchors to the top-left
   * corner. The wrapper's height is set to the SCALED height so subsequent
   * layout (action buttons, etc.) flows below the visible preview instead of
   * overlapping it.
   */
  const scaleContainer = (wrapper: HTMLElement | null) => {
    if (!wrapper) return;
    const a5Page = wrapper.querySelector('.a5-page') as HTMLElement | null;
    if (!a5Page) return;

    const wrapperWidth = wrapper.clientWidth;
    const pageWidth = a5Page.offsetWidth;
    // Guard: if either dimension is 0 (container hidden / not laid out yet),
    // skip — the effect will re-run on the next frame / timer.
    if (wrapperWidth === 0 || pageWidth === 0) return;

    const scale = wrapperWidth / pageWidth;
    a5Page.style.transform = `scale(${scale})`;
    a5Page.style.transformOrigin = 'top left';
    // Reserve vertical space for the scaled content.
    wrapper.style.height = (a5Page.offsetHeight * scale) + 'px';
  };

  /**
   * Popup mode — fit the `.a5-page` to the viewport when the popup is open
   * (same behavior as the preview overlay in the Riwayat list), and keep it
   * at natural size while closed (off-screen mount, so print/JPG capture get
   * the full-resolution 148mm page).
   */
  useLayoutEffect(() => {
    if (!isPopup) return;
    const wrapper = popupWrapperRef.current;
    if (!wrapper) return;
    const a5Page = wrapper.querySelector('.a5-page') as HTMLElement | null;
    if (!a5Page) return;

    const fit = () => {
      const naturalW = a5Page.offsetWidth;
      const naturalH = a5Page.offsetHeight;
      if (naturalW === 0 || naturalH === 0) {
        // Element not laid out yet — retry on next frame
        requestAnimationFrame(fit);
        return;
      }
      if (popupOpen) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Reserved space: top close-button row (~56px) + bottom bar (~88px) + padding (32px)
        const reservedH = 56 + 88 + 32;
        const reservedW = 32;
        const availW = Math.max(120, vw - reservedW);
        const availH = Math.max(120, vh - reservedH);
        // Fit entirely within available space; cap at 1.4x for very large screens
        const scale = Math.min(availW / naturalW, availH / naturalH, 1.4);
        a5Page.style.transform = `scale(${scale})`;
        a5Page.style.transformOrigin = 'top left';
        wrapper.style.width = `${naturalW * scale}px`;
        wrapper.style.height = `${naturalH * scale}px`;
      } else {
        // Closed (off-screen): natural size — keeps JPG capture & print crisp
        a5Page.style.transform = 'none';
        wrapper.style.width = `${naturalW}px`;
        wrapper.style.height = `${naturalH}px`;
      }
    };

    fit();
    const raf = requestAnimationFrame(fit);
    const timer = setTimeout(fit, 250);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener('resize', fit);
    };
  }, [isPopup, popupOpen, previewContent]);

  useLayoutEffect(() => {
    // No early return for isInlineBottom — bottomWrapperRef (inline-bottom
    // preview) needs scaling too. scaleContainer() guards null/hidden refs,
    // so desktop/mobile wrappers that are absent in this mode are skipped.
    const scaleAll = () => {
      scaleContainer(desktopWrapperRef.current);
      scaleContainer(mobileWrapperRef.current);
      scaleContainer(bottomWrapperRef.current);
    };

    // Run immediately (post-DOM-mutation, pre-paint) so there's no flash of
    // the unscaled 559px A5 page overflowing the container.
    scaleAll();
    // Re-run after paint (covers web-font / image load timing).
    const raf = requestAnimationFrame(scaleAll);
    const timer = setTimeout(scaleAll, 250);
    window.addEventListener('resize', scaleAll);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener('resize', scaleAll);
    };
    // Re-scale when the preview data changes OR when the mobile collapsible
    // section is toggled (so the freshly-mounted mobile container gets scaled).
  }, [isPopup, isInlineBottom, previewContent, showMobilePreview]);

  // ===== INLINE-BOTTOM MODE (Buat Invoice / Surat Jalan / PO) =====
  if (isInlineBottom) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-[1600px] px-3 py-3 md:px-6 md:py-4 print:max-w-none print:p-0">
          {/* Editor form — dibagi 2 kolom (grid disusun editor) saat formColumns=2 */}
          <div className={`mx-auto space-y-3 lg:space-y-5 print-hidden ${wideForm ? 'max-w-5xl' : 'max-w-3xl'}`}>
            {children}
          </div>

          {/* Actions — di bawah form, sebelum pratinjau */}
          {actions && (
            <div className={`mx-auto mt-4 space-y-3 print:hidden ${wideForm ? 'max-w-5xl' : 'max-w-3xl'}`}>
              {actions}
            </div>
          )}

          {/* Pratinjau A5 — SELALU tampil (fit lebar, garis outline).
              id="document-preview" dipakai CSS print (@media print) yang me-reset
              posisi/ukuran sehingga A5 tercetak penuh pada ukuran aslinya. */}
          <div
            id="document-preview"
            className="mt-5 flex justify-center print:mt-0 print:block"
          >
            <div
              className="w-full print:max-w-none"
              style={{ maxWidth: `${previewMaxWidth}px` }}
            >
              <div
                ref={bottomWrapperRef}
                data-preview-scaler
                data-document-preview
                className="a5-preview-container mx-auto bg-white overflow-hidden"
                style={{
                  border: '2px solid #cbd5e1',
                  borderRadius: '10px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
                }}
              >
                {previewContent}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== POPUP MODE =====
  if (isPopup) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-[1600px] px-3 py-3 md:px-6 md:py-4 print:max-w-none print:p-0">
        {/* Editor form — dibagi 2 kolom (grid disusun editor) saat formColumns=2 */}
          <div className={`mx-auto space-y-3 lg:space-y-5 print-hidden ${wideForm ? 'max-w-5xl' : 'max-w-3xl'}`}>
            {children}
          </div>

          {/* Toggle + Actions */}
          <div className={`mx-auto mt-4 space-y-3 print:hidden ${wideForm ? 'max-w-5xl' : 'max-w-3xl'}`}>
            <button
              type="button"
              onClick={() => setPopupOpen(true)}
              className="w-full sm:w-auto sm:min-w-[240px] inline-flex items-center justify-center gap-2 px-4 py-3 bg-card border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[44px]"
            >
              <Eye className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-semibold text-slate-700">Lihat Pratinjau A5</span>
            </button>
            {actions && <div>{actions}</div>}
          </div>
        </div>

        {/*
         * Preview popup overlay.
         * Saat tertutup: tetap ter-mount di luar layar (left: -99999px, bukan
         * display:none) supaya tombol Cetak & JPG tetap menemukan pratinjau.
         * id="document-preview" dipakai CSS print (@media print) yang me-reset
         * posisi/ukurannya sehingga A5 tercetak penuh walau popup tertutup.
         */}
        <div
          id="document-preview"
          aria-hidden={!popupOpen}
          style={popupOpen ? {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 70, // di atas MobileBottomNav (z-50) & popup lain (z-[60])
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
          } : {
            position: 'fixed',
            top: 0,
            left: '-99999px',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'none',
          }}
        >
          {/* Close row */}
          {popupOpen && (
            <div className="flex justify-end p-3 shrink-0 print:hidden">
              <button
                onClick={() => setPopupOpen(false)}
                aria-label="Tutup pratinjau"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
              >
                <X className="w-4 h-4 text-slate-700" />
              </button>
            </div>
          )}

          {/* Scrollable preview area */}
          <div className="flex-1 flex items-start justify-center overflow-auto p-4 min-h-0 print:block print:p-0 print:overflow-visible">
            <div
              ref={popupWrapperRef}
              data-preview-scaler
              data-document-preview
              className="flex-shrink-0"
            >
              {previewContent}
            </div>
          </div>

          {/* Bottom bar */}
          {popupOpen && (
            <div className="shrink-0 flex justify-center p-4 pb-6 sm:pb-4 bg-black/60 backdrop-blur-sm print:hidden">
              <button
                onClick={() => setPopupOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[40px] rounded-lg bg-white text-slate-700 text-sm font-semibold shadow-md hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" /> Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== INLINE MODE (default — surat jalan, purchase order) =====
  return (
    <div className="min-h-screen">
      {/* Editor + Preview */}
      <div className="mx-auto max-w-[1600px] px-3 py-3 md:px-6 md:py-4 print:max-w-none print:p-0">
        {/* Desktop: side-by-side grid */}
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-[3fr_5fr] print:grid-cols-1">
          {/* Editor Panel */}
          <div className="space-y-3 lg:space-y-5 print-hidden">
            {children}
          </div>

          {/* Desktop Preview Panel — visible on lg+, and ALWAYS visible during print */}
          <div className="hidden lg:flex justify-center print:flex print:justify-center" id="document-preview">
            <div className="w-full print:max-w-none">
              <div className="sticky top-20 print:static">
                <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground print:hidden">
                  Pratinjau A5
                </div>
                {/* A5 preview wrapper — scales the 148mm page to fit */}
                <div
                  ref={desktopWrapperRef}
                  data-preview-scaler
                  data-document-preview
                  className="a5-preview-container mx-auto bg-white overflow-hidden"
                  style={{ border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                >
                  {previewContent}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== MOBILE: Inline Preview Section ===== */}
        <div className="lg:hidden print:hidden mt-4">
          {/* Toggle Button */}
          <button
            onClick={() => setShowMobilePreview(!showMobilePreview)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-semibold text-slate-700">
                {showMobilePreview ? 'Sembunyikan Pratinjau' : 'Lihat Pratinjau A5'}
              </span>
            </div>
            {showMobilePreview ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Collapsible Preview */}
          {showMobilePreview && (
            <div className="mt-3 flex justify-center">
              <div className="w-full max-w-[420px]">
                <div
                  ref={mobileWrapperRef}
                  data-preview-scaler
                  data-document-preview
                  className="a5-preview-container bg-white overflow-hidden"
                  style={{ border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                >
                  {previewContent}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons — below editor on all screens */}
        {actions && (
          <div className="mt-4 lg:mt-6 print:hidden">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
