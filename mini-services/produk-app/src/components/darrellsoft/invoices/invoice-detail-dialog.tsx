'use client'

import * as React from 'react'
import { Wallet } from 'lucide-react'
import { api } from '@/lib/client-api'
import { formatDateID, formatNumberID, formatRp, toNumber } from '@/lib/money'
import { useAppStore } from '@/store/app-store'
import type { InvoiceDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InvoiceStatusBadge, PriceSourceBadge } from '@/components/shared/badges'
import type { PaymentTarget } from './payment-dialog'

interface InvoiceDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string | null
  /** bertambah setiap kali pembayaran dicatat agar detail di-refetch */
  refreshKey: number
  canPay: boolean
  onPay: (target: PaymentTarget) => void
}

/** Dialog detail invoice: item, ringkasan tagihan, dan aksi catat pembayaran. */
export function InvoiceDetailDialog({
  open,
  onOpenChange,
  invoiceId,
  refreshKey,
  canPay,
  onPay,
}: InvoiceDetailDialogProps) {
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)
  const [invoice, setInvoice] = React.useState<InvoiceDTO | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !invoiceId || !companyId || !userId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api<InvoiceDTO>(`/api/invoices/${invoiceId}`)
      .then((data) => {
        if (cancelled) return
        setInvoice(data)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, invoiceId, refreshKey, companyId, userId])

  React.useEffect(() => {
    if (!open) {
      setInvoice(null)
      setError(null)
    }
  }, [open])

  const sisa = invoice ? Math.max(0, toNumber(invoice.total) - toNumber(invoice.amountPaid)) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-mono">{invoice?.number ?? 'Detail Invoice'}</DialogTitle>
            {invoice && <InvoiceStatusBadge status={invoice.status} />}
          </div>
          <DialogDescription>Rincian tagihan beserta sumber harga per baris.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-72" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-64 ml-auto" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Gagal memuat invoice: {error}
          </div>
        ) : invoice ? (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-1.5 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <span className="text-muted-foreground">Tanggal Invoice</span>
                <span className="font-medium sm:ml-2">{formatDateID(invoice.invoiceDate)}</span>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <span className="text-muted-foreground">Jatuh Tempo</span>
                <span className="font-medium sm:ml-2">{invoice.dueDate ? formatDateID(invoice.dueDate) : '-'}</span>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2 sm:block">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium sm:ml-2">
                  {invoice.customerName} <span className="font-mono text-xs text-muted-foreground">({invoice.customerCode})</span>
                </span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">{it.productCode}</TableCell>
                    <TableCell className="max-w-40 truncate">{it.productName}</TableCell>
                    <TableCell className="text-right">
                      {formatNumberID(it.quantity)}
                      <span className="text-muted-foreground"> {it.unit}</span>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex flex-col gap-1"
                        title={it.priceSource === 'MANUAL' && it.manualReason ? `Alasan: ${it.manualReason}` : undefined}
                      >
                        <span>{formatRp(it.unitPrice)}</span>
                        <PriceSourceBadge source={it.priceSource} className="w-fit" />
                        {it.priceSource === 'MANUAL' && it.manualReason && (
                          <span className="text-[11px] italic text-muted-foreground">Alasan: {it.manualReason}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatRp(it.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatRp(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diskon</span>
                <span>− {formatRp(invoice.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pajak ({formatNumberID(invoice.taxPercent)}%)</span>
                <span>{formatRp(invoice.taxAmount)}</span>
              </div>
              <Separator />
              <div className="flex items-baseline justify-between">
                <span className="font-medium">TOTAL</span>
                <span className="text-lg font-semibold">{formatRp(invoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dibayar</span>
                <span>{formatRp(invoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sisa</span>
                <span className="font-semibold text-amber-700">{formatRp(sisa)}</span>
              </div>
            </div>

            {invoice.note && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan</p>
                <p className="mt-1 whitespace-pre-line">{invoice.note}</p>
              </div>
            )}
          </div>
        ) : null}

        {canPay && invoice && invoice.status !== 'PAID' && (
          <DialogFooter>
            <Button type="button" onClick={() => onPay({ id: invoice.id, number: invoice.number, sisa })}>
              <Wallet className="h-4 w-4" />
              Catat Pembayaran
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
