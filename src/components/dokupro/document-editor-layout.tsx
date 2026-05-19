'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';

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
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Editor + Preview */}
      <div className="mx-auto max-w-[1600px] px-3 py-3 md:px-6 md:py-4">
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-[3fr_5fr]">
          {/* Editor Panel */}
          <div className="space-y-3 lg:space-y-5 print-hidden">
            {children}
          </div>

          {/* Preview Panel — A5 proportioned (desktop: side-by-side, mobile: hidden behind toggle) */}
          <div className="hidden lg:flex justify-center print:justify-center" id="document-preview">
            <div className="w-full max-w-[680px] print:max-w-none">
              <div className="sticky top-20">
                <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground print:hidden">
                  Pratinjau
                </div>
                {/* A5 container: 148mm x 210mm ratio, scaled for screen */}
                <div className="a5-preview-container mx-auto bg-white" style={{ aspectRatio: '148 / 210' }}>
                  <div className="a5-preview-scaler">
                    {previewContent}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons — below editor on all screens */}
        {actions && (
          <div className="mt-4 lg:mt-6">
            {actions}
          </div>
        )}
      </div>

      {/* ===== MOBILE: Floating Preview Toggle Button ===== */}
      <button
        onClick={() => setShowPreview(true)}
        className="fixed bottom-4 right-4 z-40 lg:hidden flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 text-white rounded-full shadow-lg hover:bg-slate-700 active:scale-95 transition-all print:hidden"
      >
        <Eye className="w-4 h-4" />
        <span className="text-xs font-semibold">Pratinjau</span>
      </button>

      {/* ===== MOBILE: Full-screen Preview Overlay ===== */}
      {showPreview && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-100 flex flex-col print:hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Pratinjau Dokumen</h3>
            <button
              onClick={() => setShowPreview(false)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          {/* Preview Content */}
          <div className="flex-1 overflow-auto p-3">
            <div className="mx-auto max-w-[420px]">
              <div className="a5-preview-container bg-white" style={{ aspectRatio: '148 / 210' }}>
                <div className="a5-preview-scaler">
                  {previewContent}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
