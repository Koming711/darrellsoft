'use client'

import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRp, lineTotal, toNumber } from '@/lib/money'
import type { DraftItem } from './types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MoneyInput } from '@/components/shared/money-input'
import { PriceSourceBadge } from '@/components/shared/badges'

interface CreateItemsTableProps {
  items: DraftItem[]
  canManualPrice: boolean
  disabled: boolean
  /** tampilkan pesan error qty per baris (setelah submit dicoba) */
  showQtyErrors: boolean
  onQtyChange: (key: string, quantity: string) => void
  onPriceChange: (key: string, next: string | null) => void
  onRemove: (key: string) => void
}

/** Tabel baris barang pada draft invoice: qty, harga (dapat diedit manual), sumber, subtotal. */
export function CreateItemsTable({
  items,
  canManualPrice,
  disabled,
  showQtyErrors,
  onQtyChange,
  onPriceChange,
  onRemove,
}: CreateItemsTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Belum ada barang pada invoice ini.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Barang</TableHead>
          <TableHead className="w-20">Qty</TableHead>
          <TableHead>Satuan</TableHead>
          <TableHead>Harga</TableHead>
          <TableHead>Sumber</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Aksi</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((it) => {
          const qtyInvalid = showQtyErrors && toNumber(it.quantity) <= 0
          return (
            <TableRow key={it.key}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{it.productName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{it.productCode}</span>
                </div>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className={cn('w-20', qtyInvalid && 'border-destructive focus-visible:ring-destructive')}
                  value={it.quantity}
                  aria-label={`Qty ${it.productName}`}
                  onChange={(e) => onQtyChange(it.key, e.target.value)}
                  disabled={disabled}
                />
                {qtyInvalid && <p className="mt-1 text-xs text-destructive">Qty harus lebih dari 0.</p>}
              </TableCell>
              <TableCell className="text-muted-foreground">{it.unit}</TableCell>
              <TableCell>
                {canManualPrice ? (
                  <MoneyInput
                    className="w-36"
                    value={it.unitPrice}
                    onChange={(v) => onPriceChange(it.key, v)}
                    aria-label={`Harga ${it.productName}`}
                    disabled={disabled}
                  />
                ) : (
                  <span>{formatRp(it.unitPrice)}</span>
                )}
              </TableCell>
              <TableCell>
                <div
                  title={it.source === 'MANUAL' && it.manualReason ? `Alasan: ${it.manualReason}` : undefined}
                  className="flex flex-col gap-1"
                >
                  <PriceSourceBadge source={it.source} className="w-fit" />
                  {it.source === 'MANUAL' && it.manualReason && (
                    <span className="max-w-36 truncate text-[11px] italic text-muted-foreground">
                      Alasan: {it.manualReason}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">{formatRp(lineTotal(it.quantity, it.unitPrice))}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus ${it.productName}`}
                  onClick={() => onRemove(it.key)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
