'use client'

/**
 * BackupRestoreButtons — tombol Backup & Restore data barang + harga per
 * pelanggan (file .xlsx), dipakai bersama oleh halaman /barang dan
 * /harga-customer (keduanya mengelola sumber data yang sama: tabel Barang
 * + registrasi BarangCustomer — satu sumber kebenaran).
 *
 * - Backup : GET /api/database/backup-harga-per-customer → unduh .xlsx
 *            (sheet Laporan / Data / Data_Registrasi / Info).
 * - Restore: POST /api/database/restore-harga-per-customer (multipart file),
 *            mode REPLACE — wajib konfirmasi via AlertDialog dulu. Endpoint
 *            sudah di-hardening: validasi baris SEBELUM delete, file tidak
 *            valid dibatalkan 400 tanpa menghapus data.
 *
 * Setelah restore sukses: onRestored() agar halaman memuat ulang datanya,
 * plus notifyDataChange('items') agar halaman lain ikut segar.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { DatabaseBackup, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/auth-fetch'
import { notifyDataChange } from '@/lib/data-sync'
import { Button } from '@/components/ui/button'
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

interface BackupRestoreButtonsProps {
  /** Dipanggil setelah restore sukses — halaman memuat ulang datanya. */
  onRestored?: () => void
}

export default function BackupRestoreButtons({ onRestored }: BackupRestoreButtonsProps) {
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Backup: unduh .xlsx (barang + harga khusus per pelanggan). */
  const handleBackup = async () => {
    setBusy('backup')
    try {
      const res = await authFetch('/api/database/backup-harga-per-customer')
      if (!res.ok) {
        let errMsg = 'Gagal backup data barang'
        try {
          const errData = await res.json()
          errMsg = errData?.error || errMsg
        } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) {
        toast.error('Backup kosong — tidak ada data')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? decodeURIComponent(match[1]) : `backup-barang-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) {
      console.error('Backup barang error:', e)
      toast.error('Gagal backup data barang')
    } finally {
      setBusy(null)
    }
  }

  const handlePickFile = () => fileRef.current?.click()

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    e.target.value = '' // izinkan memilih file yang sama lagi nanti
    if (f) setPendingFile(f)
  }

  /** Restore: unggah file → GANTI semua barang + registrasi harga milik user. */
  const doRestore = async () => {
    if (!pendingFile) return
    setBusy('restore')
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      const res = await authFetch('/api/database/restore-harga-per-customer', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        const skipped = (data.skippedReg || 0) + (data.skippedBarang || 0)
        toast.success(
          `Restore berhasil (${data.count} barang, ${data.regCount} harga khusus)${
            skipped > 0 ? ` — ${skipped} baris dilewati` : ''
          }`
        )
        onRestored?.()
        notifyDataChange('items')
      } else {
        toast.error(data?.error || 'Gagal restore data barang')
      }
    } catch {
      toast.error('File backup tidak valid')
    } finally {
      setBusy(null)
      setPendingFile(null)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <Button
        variant="outline"
        onClick={handleBackup}
        disabled={busy !== null}
        title="Unduh backup barang & harga per pelanggan (.xlsx)"
        className="min-h-[44px] shrink-0 px-3 text-xs"
      >
        {busy === 'backup' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <DatabaseBackup className="h-4 w-4" aria-hidden />
        )}
        Backup
      </Button>
      <Button
        variant="outline"
        onClick={handlePickFile}
        disabled={busy !== null}
        title="Pulihkan barang & harga per pelanggan dari file backup (.xlsx) — ganti semua data"
        className="min-h-[44px] shrink-0 px-3 text-xs"
      >
        {busy === 'restore' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        Restore
      </Button>

      {/* Konfirmasi restore — mode REPLACE, tidak bisa dibatalkan */}
      <AlertDialog
        open={!!pendingFile}
        onOpenChange={(open) => {
          if (!open) setPendingFile(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulihkan dari file backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua data barang &amp; harga per pelanggan yang ada sekarang akan
              DIGANTI dengan isi file &quot;{pendingFile?.name}&quot;. Tindakan tidak bisa
              dibatalkan — pastikan file adalah backup terbaru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'restore'}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'restore'}
              onClick={(e) => {
                e.preventDefault()
                doRestore()
              }}
            >
              {busy === 'restore' ? 'Memulihkan…' : 'Ya, Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
