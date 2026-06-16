'use client';

import { useState, useEffect, useRef } from 'react';
import { Eye, X, ChevronUp, ChevronDown } from 'lucide-react';

interface DocumentEditorLayoutProps {
  title?: string;
  children: React.ReactNode;
  previewContent: React.ReactNode;
  actions?: React.ReactNode;
}

export function DocumentEditorLayout({
  children,
  previewContent,
  actions,
}: DocumentEditorLayoutProps) {
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const previewWrapperRef = useRef<HTMLDivElement>(null);

  // Scale A5 preview to fit container
  useEffect(() => {
    const scalePreview = () => {
      const wrapper = previewWrapperRef.current;
      if (!wrapper) return;
      const a5Page = wrapper.querySelector('.a5-page') as HTMLElement;
      if (!a5Page) return;

      const wrapperWidth = wrapper.clientWidth;
      // A5 is 148mm, scale to fit wrapper
      const scale = wrapperWidth / a5Page.offsetWidth;
      a5Page.style.transform = `scale(${scale})`;
      a5Page.style.transformOrigin = 'top left';
      // Adjust wrapper height to match scaled content
      wrapper.style.height = (a5Page.offsetHeight * scale) + 'px';
    };

    scalePreview();
    window.addEventListener('resize', scalePreview);
    // Small delay to let content render
    const timer = setTimeout(scalePreview, 200);
    return () => {
      window.removeEventListener('resize', scalePreview);
      clearTimeout(timer);
    };
  }, [previewContent]);

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
                  ref={previewWrapperRef}
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
