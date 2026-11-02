'use client'

import * as React from 'react'
import { formatRp } from '@/lib/money'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput } from '@/components/shared/money-input'

interface ManualPriceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  previousPrice: string | null
  nextPrice: string | null
  /** alasan lama bila baris sebelumnya sudah MANUAL */
  initialReason: string | null
  onNextPriceChange: (value: string | null) => void
  onConfirm: (reason: string) => void
}

/**
 * Dialog alasan perubahan harga manual pada baris draft invoice.
 * Harga manual hanya berlaku untuk invoice yang sedang dibuat.
 */
export function ManualPriceDialog({
  open,
  onOpenChange,
  productName,
  previousPrice,
  nextPrice,
  initialReason,
  onNextPriceChange,
  onConfirm,
}: ManualPriceDialogProps) {
  const [reason, setReason] = React.useState('')
  const [touched, setTouched] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setReason(initialReason ?? '')
      setTouched(false)
    }
  }, [open, initialReason])

  const reasonValid = reason.trim().length >= 3
  const priceValid = nextPrice !== null && nextPrice !== '' && Number(nextPrice) > 0
  const canSave = reasonValid && priceValid
  const showReasonError = touched && !reasonValid

  function handleConfirm() {
    if (!canSave) {
      setTouched(true)
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTouched(false)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alasan Perubahan Harga</DialogTitle>
          <DialogDescription>
            {productName ? `${productName} — ` : ''}harga lama {formatRp(previousPrice)} diubah secara manual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Harga Lama</Label>
              <p className="text-sm font-medium">{formatRp(previousPrice)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-price-new">Harga Baru</Label>
              <MoneyInput
                id="manual-price-new"
                value={nextPrice}
                onChange={onNextPriceChange}
                aria-label="Harga baru manual"
              />
              {!priceValid && <p className="text-xs text-destructive">Harga baru wajib diisi lebih dari nol.</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-price-reason">
              Alasan Perubahan Harga <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="manual-price-reason"
              rows={3}
              placeholder="Contoh: negosiasi khusus untuk proyek ini..."
              value={reason}
              aria-invalid={showReasonError}
              onBlur={() => setTouched(true)}
              onChange={(e) => setReason(e.target.value)}
            />
            {showReasonError && <p className="text-xs text-destructive">Alasan minimal 3 karakter.</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            Harga manual hanya berlaku untuk invoice ini dan tidak mengubah daftar harga master/customer.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canSave}>
            Simpan Harga Manual
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
