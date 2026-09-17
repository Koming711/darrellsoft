'use client';

import { Suspense, useState, useEffect } from 'react';
import { ArrowLeft, FileText, Banknote, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceEditor, type BuatInvoiceMode } from './invoice-editor';
import { useDokuproStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const MODE_TABS: { key: BuatInvoiceMode; label: string; icon: typeof FileText; hint: string }[] = [
  { key: 'regular', label: 'Regular', icon: FileText, hint: 'Invoice penuh untuk seluruh tagihan tanpa uang muka.' },
  { key: 'dp', label: 'DP', icon: Banknote, hint: 'Invoice dengan uang muka (DP) — sisa pembayaran otomatis tercatat di Editor Pelunasan.' },
  { key: 'pelunasan', label: 'Pelunasan', icon: CheckCircle2, hint: 'Invoice pelunasan untuk sisa pembayaran invoice yang sudah ada.' },
];

export function BuatInvoiceBaru({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<BuatInvoiceMode>('regular');
  const activeTab = MODE_TABS.find((t) => t.key === mode)!;

  // Pick the initial mode from the store once on mount (client only, after
  // hydration) — restored pelunasan docs open in Pelunasan mode, invoices
  // with DP open in DP mode, everything else in Regular mode.
  useEffect(() => {
    const inv = useDokuproStore.getState().invoice;
    if (inv.type === 'invoice-pelunasan') setMode('pelunasan');
    else if ((inv.dp || 0) > 0) setMode('dp');
  }, []);

  return (
    <div className="space-y-4">
      {/* Back bar */}
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={onBack} className="h-8 gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Riwayat
        </Button>
      </div>

      {/* Mode tabs: Regular / DP / Pelunasan */}
      <div className="flex items-center gap-2 overflow-x-auto print:hidden">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={cn(
              'px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5',
              mode === tab.key
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 dark:text-slate-300 dark:border-zinc-700 dark:hover:bg-zinc-800'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mode hint */}
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 px-1 print:hidden">{activeTab.hint}</p>

      <Suspense fallback={null}>
        <InvoiceEditor mode={mode} onSaved={onBack} />
      </Suspense>
    </div>
  );
}
