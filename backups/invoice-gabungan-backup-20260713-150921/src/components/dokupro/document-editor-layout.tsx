'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Eye, X, ChevronUp, ChevronDown } from 'lucide-react';

interface DocumentEditorLayoutProps {
  title?: string;
  children: React.ReactNode;
  previewContent: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Shared layout for document editors (invoice, surat-jalan, purchase-order,
 * invoice-pelunasan).
 *
 * Renders the A5 preview (148mm wide ≈ 559px) in TWO containers:
 *   - Desktop: a sticky side panel (lg+)
 *   - Mobile: a collapsible inline section (<lg)
 *
 * Each `.a5-page` is scaled to fit its own container width via a CSS
 * `transform: scale()`. This is critical on mobile, where the 559px page
 * would otherwise overflow the ~390px viewport and get clipped by
 * `overflow-hidden`.
 */
export function DocumentEditorLayout({
  children,
  previewContent,
  actions,
}: DocumentEditorLayoutProps) {
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const desktopWrapperRef = useRef<HTMLDivElement>(null);
  const mobileWrapperRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    const scaleAll = () => {
      scaleContainer(desktopWrapperRef.current);
      scaleContainer(mobileWrapperRef.current);
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
  }, [previewContent, showMobilePreview]);

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
