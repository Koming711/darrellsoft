'use client'

import * as React from 'react'
import { api } from '@/lib/client-api'
import { formatRp, toNumber } from '@/lib/money'
import { useToast } from '@/hooks/use-toast'
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
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/shared/money-input'

/** Target pembayaran: invoice yang akan dibayar beserta sisa tagihannya. */
export interface PaymentTarget {
  id: string
  number: string
  sisa: number
}

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: PaymentTarget | null
  onSuccess: () => void
}

/** Dialog pencatatan pembayaran invoice. */
export function PaymentDialog({ open, onOpenChange, target, onSuccess }: PaymentDialogProps) {
  const { toast } = useToast()
  const [amount, setAmount] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Set nilai default sebesar sisa tagihan setiap kali dialog dibuka
  React.useEffect(() => {
    if (open && target) {
      setAmount(target.sisa > 0 ? String(target.sisa) : null)
    }
    if (!open) {
      setSaving(false)
    }
  }, [open, target])

  const amountValid = amount !== null && amount !== '' && toNumber(amount) > 0

  async function handleSubmit() {
    if (!target || !amountValid || saving) return
    setSaving(true)
    try {
      await api<InvoiceDTO>(`/api/invoices/${target.id}/payments`, {
        method: 'POST',
        body: { amount },
      })
      toast({ title: 'Pembayaran dicatat', description: `Invoice ${target.number} berhasil diperbarui.` })
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Gagal mencatat pembayaran',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Pembayaran — {target?.number ?? ''}</DialogTitle>
          <DialogDescription>
            Sisa tagihan: <span className="font-semibold text-foreground">{formatRp(target?.sisa ?? 0)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="payment-amount">
            Jumlah Pembayaran <span className="text-destructive">*</span>
          </Label>
          <MoneyInput id="payment-amount" value={amount} onChange={setAmount} aria-label="Jumlah pembayaran" />
          {!amountValid && <p className="text-xs text-destructive">Jumlah pembayaran wajib diisi lebih dari nol.</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || !amountValid}>
            {saving ? 'Menyimpan...' : 'Simpan Pembayaran'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
