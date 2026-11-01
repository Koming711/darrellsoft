'use client'

import { formatRp } from '@/lib/money'
import type { DraftSummary } from './types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { MoneyInput } from '@/components/shared/money-input'

interface CreateSummaryPanelProps {
  summary: DraftSummary
  discount: string | null
  onDiscountChange: (value: string | null) => void
  taxPercent: string
  onTaxPercentChange: (value: string) => void
  /** pesan error diskon bila melebihi subtotal */
  discountError: string | null
}

/** Panel ringkasan (kanan) pada dialog Buat Invoice: diskon, pajak, total, dan estimasi margin. */
export function CreateSummaryPanel({
  summary,
  discount,
  onDiscountChange,
  taxPercent,
  onTaxPercentChange,
  discountError,
}: CreateSummaryPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatRp(summary.subtotal)}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-discount">Diskon (Rp)</Label>
            <MoneyInput id="invoice-discount" value={discount} onChange={onDiscountChange} aria-label="Diskon" />
            {discountError && <p className="text-xs text-destructive">{discountError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-tax">Pajak (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="invoice-tax"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={taxPercent}
                onChange={(e) => onTaxPercentChange(e.target.value)}
                className="w-24"
                aria-label="Persentase pajak"
              />
              <span className="text-sm text-muted-foreground">= {formatRp(summary.taxAmount)}</span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">DPP</span>
            <span>{formatRp(summary.dpp)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">TOTAL</span>
            <span className="text-lg font-semibold text-emerald-700">{formatRp(summary.total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="p-4 space-y-1.5">
          <p className="text-sm font-medium text-emerald-800">Estimasi Margin</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-700">Total Margin</span>
            <span className="font-medium text-emerald-800">{formatRp(summary.margin)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-700">Margin (%)</span>
            <span className="font-medium text-emerald-800">{summary.marginPercent.toFixed(1)}%</span>
          </div>
          <p className="text-xs text-emerald-700/80">Harga pokok diambil dari Master Produk saat invoice dibuat.</p>
        </CardContent>
      </Card>
    </div>
  )
}
