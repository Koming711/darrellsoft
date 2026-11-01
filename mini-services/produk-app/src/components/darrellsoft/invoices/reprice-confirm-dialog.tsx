'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface RepriceConfirmDialogProps {
  open: boolean
  /** jumlah baris yang sedang berstatus MANUAL pada draft */
  manualCount: number
  onOpenChange: (open: boolean) => void
  /** ganti semua baris (termasuk yang manual) dengan harga baru */
  onReplaceAll: () => void
  /** pertahankan baris manual, ganti hanya baris otomatis */
  onKeepManual: () => void
}

/**
 * Konfirmasi ketika customer / tanggal invoice diubah padahal ada baris
 * yang harganya sudah diedit manual.
 */
export function RepriceConfirmDialog({
  open,
  manualCount,
  onOpenChange,
  onReplaceAll,
  onKeepManual,
}: RepriceConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi Ganti Harga</AlertDialogTitle>
          <AlertDialogDescription>
            Harga pada {manualCount} baris yang diedit manual akan diganti sesuai harga customer yang baru.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeepManual}>Pertahankan Manual</AlertDialogCancel>
          <AlertDialogAction onClick={onReplaceAll}>Ganti Harga</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
