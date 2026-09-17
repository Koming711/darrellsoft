'use client';

import { cn } from '@/lib/utils';

interface OffscreenPrintPreviewProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Offscreen A5 print host — the invoice page renders its document preview
 * INVISIBLE on screen (user asked to remove the on-screen A5 preview), while
 * still powering the two export mechanisms that need the preview in the DOM:
 *
 *  1. Cetak (window.print)  → `#document-preview` + `.a5-page` @media print
 *     rules in globals.css turn this subtree into the printed page.
 *  2. JPG export            → `captureElementAsJpg` queries
 *     `[data-document-preview]` and clones the A5 node offscreen.
 *
 * On screen the host is pinned off-viewport (`left: -9999px`) so it is never
 * visible but still laid out (scrollWidth/scrollHeight stay accurate for the
 * JPG capture). During @media print, globals.css flips the host back into
 * normal flow (`position: static`) so the printed output is IDENTICAL to the
 * old side-panel preview.
 *
 * DOM nesting mirrors the old DocumentEditorLayout preview panel
 * (`#document-preview > div > div.a5-preview-container > .a5-page`) so the
 * existing print CSS selectors keep matching without modification.
 */
export function OffscreenPrintPreview({ children, className }: OffscreenPrintPreviewProps) {
  return (
    <div className={cn('offscreen-print-host', className)} aria-hidden="true">
      <div id="document-preview">
        <div className="w-full">
          <div className="a5-preview-container mx-auto bg-white">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
