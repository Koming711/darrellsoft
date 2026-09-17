'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, ChevronRight, FileDown, FileSpreadsheet, FileText, Mail,
  MessageCircle, Printer, Trash2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, downloadFile } from '@/lib/client'
import { formatDate, formatIDR } from '@/lib/format'
import {
  STATUS_LABEL,
  type Invoice,
  type InvoiceSettlementRow,
  type InvoiceStatus,
  type SessionUser,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { buildEmailLink, buildWaLink } from '@/lib/wa'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, TypeBadge } from '@/components/views/invoice-badges'
import { InvoicePrintBody } from '@/components/views/invoice-print'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

function sisaClass(sisa: number): string {
  return sisa > 0 ? 'text-amber-700' : 'text-emerald-700'
}


interface InvoiceDetailProps {
  user: SessionUser
  invoiceId: string
  onBack: () => void
  onChanged: () => void
  onDeleted: () => void
  /** Opsional: buka invoice lain (mis. riwayat pelunasan / invoice DP induk) dari halaman detail ini */
  onOpenInvoice?: (id: string) => void
}

export default function InvoiceDetail({
  user,
  invoiceId,
  onBack,
  onChanged,
  onDeleted,
  onOpenInvoice,
}: InvoiceDetailProps) {
  const [inv, setInv] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'lunas' | 'batal' | 'hapus' | null>(null)

  const [confirmLunas, setConfirmLunas] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)
  const [confirmHapus, setConfirmHapus] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${encodeURIComponent(invoiceId)}`)
      setInv(data.invoice)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  // Data turunan per tipe (aman utk inv null)
  const parent = inv?.type === 'PELUNASAN' ? inv.parent ?? null : null
  const settlements = inv?.type === 'DP' ? inv.settlements ?? [] : []
  const settlementTotal = settlements
    .filter((s) => s.status !== 'BATAL')
    .reduce((acc, s) => acc + s.paidAmount, 0)

  const handleStatus = async (status: InvoiceStatus) => {
    setBusy(status === 'LUNAS' ? 'lunas' : 'batal')
    try {
      const data = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      setInv(data.invoice)
      toast.success(status === 'LUNAS' ? 'Invoice ditandai lunas' : 'Invoice dibatalkan')
      onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    setBusy('hapus')
    try {
      await apiFetch<{ ok: boolean }>(`/api/invoices/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' })
      toast.success('Invoice dihapus')
      onDeleted()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(null)
    }
  }

  const handleWa = () => {
    if (!inv) return
    const { url, hasPhone, message } = buildWaLink(inv)
    if (!hasPhone) {
      if (navigator.clipboard) navigator.clipboard.writeText(message).catch(() => {})
      toast.info('Nomor WA pelanggan belum ada. Pesan disalin — pilih kontak manual di WhatsApp.')
    }
    window.open(url, '_blank')
  }

  const handleEmail = () => {
    if (!inv) return
    const { url, hasEmail } = buildEmailLink(inv)
    if (!hasEmail) {
      toast.info('Email pelanggan belum diisi — aplikasi email akan terbuka tanpa penerima.')
    }
    window.location.href = url
  }

  const handleExcel = () => {
    if (!inv) return
    downloadFile(`/api/export/invoices?invoiceId=${encodeURIComponent(inv.id)}`, `Invoice-${inv.number}.xlsx`)
      .then(() => toast.success('File Excel berhasil diunduh'))
      .catch((e) => toast.error(errText(e)))
  }

  const handlePdf = () => {
    window.print()
    toast.info('Pilih "Save as PDF" pada dialog cetak untuk menyimpan file.')
  }

  return (
    <div className="space-y-5">
      {/* Header + aksi */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="Kembali ke daftar invoice"
            className="h-10 w-10 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {loading ? (
            <Skeleton className="h-8 w-48" />
          ) : inv ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-bold truncate">{inv.number}</h1>
                <TypeBadge type={inv.type} />
                <StatusBadge status={inv.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dibuat oleh {inv.createdByName} · {formatDate(inv.date)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Invoice tidak ditemukan.</p>
          )}
        </div>

        {inv && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleWa}
              disabled={busy !== null}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button
              variant="outline"
              onClick={handleEmail}
              disabled={busy !== null}
              className="min-h-[44px]"
              aria-label="Kirim invoice via email"
            >
              <Mail className="h-4 w-4" /> Email
            </Button>
            <Button
              variant="outline"
              onClick={handleExcel}
              disabled={busy !== null}
              className="min-h-[44px]"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={busy !== null}
              className="min-h-[44px]"
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={handlePdf}
              disabled={busy !== null}
              className="min-h-[44px]"
            >
              <FileDown className="h-4 w-4" /> Simpan sebagai PDF
            </Button>
            {inv.status === 'BELUM_BAYAR' && (
              <Button
                variant="outline"
                onClick={() => setConfirmLunas(true)}
                disabled={busy !== null}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 min-h-[44px]"
              >
                <CheckCircle2 className="h-4 w-4" /> Tandai Lunas
              </Button>
            )}
            {inv.status !== 'BATAL' && (
              <Button
                variant="ghost"
                onClick={() => setConfirmBatal(true)}
                disabled={busy !== null}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px]"
              >
                <XCircle className="h-4 w-4" /> Batalkan
              </Button>
            )}
            {inv.status === 'BATAL' && (
              <p className="w-full text-xs text-muted-foreground self-center">
                Invoice berstatus batal — perubahan status dinonaktifkan.
              </p>
            )}
            {user.role === 'ADMIN' && (
              <Button
                variant="ghost"
                onClick={() => setConfirmHapus(true)}
                disabled={busy !== null}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px]"
              >
                <Trash2 className="h-4 w-4" /> Hapus
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Panel data tambahan per tipe (layar saja, di luar area cetak) */}
      {inv && inv.type === 'DP' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <SummaryChip label="DP Dibayar" value={formatIDR(inv.dpAmount)} />
            <SummaryChip label="Sudah Dipelunasi" value={formatIDR(settlementTotal)} valueClass="text-emerald-700" />
            <SummaryChip
              label="Sisa Tagihan"
              value={formatIDR(inv.sisa)}
              valueClass={cn('font-bold', sisaClass(inv.sisa))}
            />
          </div>
          {settlements.length > 0 && (
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-5 pt-4 pb-3">
                <CardTitle className="text-sm">Riwayat Pelunasan</CardTitle>
              </CardHeader>
              <CardContent className="px-2 md:px-3 pb-3">
                <ul className="divide-y divide-stone-100">
                  {settlements.map((s) => (
                    <li key={s.id}>
                      <SettlementRow
                        s={s}
                        interactive={Boolean(onOpenInvoice)}
                        onOpen={(id) => onOpenInvoice?.(id)}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {inv && inv.type === 'PELUNASAN' && parent && (
        <Card className="p-0 gap-0">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              {onOpenInvoice ? (
                <button
                  onClick={() => onOpenInvoice(parent.id)}
                  aria-label={`Buka invoice DP ${parent.number}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-2 min-h-[44px] text-left"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  Invoice DP: {parent.number} · {formatDate(parent.date)}
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                  Invoice DP: {parent.number} · {formatDate(parent.date)}
                </p>
              )}
              <StatusBadge status={parent.status} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <SummaryChip label="Total Pesanan" value={formatIDR(parent.total)} />
              <SummaryChip label="Total DP" value={formatIDR(parent.dpAmount)} />
              <SummaryChip label="Pelunasan" value={formatIDR(inv.paidAmount)} valueClass="text-emerald-700" />
              <SummaryChip
                label="Sisa Tagihan"
                value={formatIDR(inv.sisa)}
                valueClass={cn('font-bold', sisaClass(inv.sisa))}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kartu cetak */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : inv ? (
        <Card id="print-area" className="p-0 gap-0 shadow-sm">
          <CardContent className="p-5 md:p-8">
            <InvoicePrintBody inv={inv} />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-sm font-medium">Invoice tidak ditemukan</p>
          <p className="text-xs text-muted-foreground mt-1">Data mungkin sudah dihapus.</p>
          <Button variant="outline" className="mt-3 min-h-[44px]" onClick={onBack}>
            Kembali ke daftar
          </Button>
        </div>
      )}

      {/* AlertDialog tandai lunas */}
      <AlertDialog open={confirmLunas} onOpenChange={setConfirmLunas}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tandai invoice lunas?</AlertDialogTitle>
            <AlertDialogDescription>
              {inv?.number} untuk {inv?.customer.name} dengan total {inv ? formatIDR(inv.total) : ''} akan
              ditandai sebagai LUNAS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={(e) => { e.preventDefault(); setConfirmLunas(false); void handleStatus('LUNAS') }}
            >
              {busy === 'lunas' ? 'Menyimpan…' : 'Ya, Tandai Lunas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog batalkan */}
      <AlertDialog open={confirmBatal} onOpenChange={setConfirmBatal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {inv?.number} akan berstatus BATAL dan tidak dihitung dalam ringkasan penjualan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); setConfirmBatal(false); void handleStatus('BATAL') }}
            >
              {busy === 'batal' ? 'Memproses…' : 'Ya, Batalkan Invoice'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog hapus */}
      <AlertDialog open={confirmHapus} onOpenChange={setConfirmHapus}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {inv?.number} akan dihapus permanen beserta seluruh rinciannya. Tindakan ini tidak dapat
              dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); setConfirmHapus(false); void handleDelete() }}
            >
              {busy === 'hapus' ? 'Menghapus…' : 'Ya, Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ===== Komponen layar (di luar area cetak) ===== */

function SummaryChip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold mt-0.5 whitespace-nowrap', valueClass)}>{value}</p>
    </div>
  )
}

function SettlementRow({
  s,
  interactive,
  onOpen,
}: {
  s: InvoiceSettlementRow
  interactive: boolean
  onOpen: (id: string) => void
}) {
  const muted = s.status === 'BATAL'
  const inner = (
    <>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', muted && 'line-through text-stone-400')}>{s.number}</p>
        <p className={cn('text-xs text-muted-foreground mt-0.5', muted && 'line-through')}>
          {formatDate(s.date)} · Dibuat oleh {s.createdByName}
        </p>
      </div>
      <span className={cn('text-sm font-semibold whitespace-nowrap', muted && 'line-through text-stone-400')}>
        {formatIDR(s.paidAmount)}
      </span>
      <StatusBadge status={s.status} />
      {interactive && <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" aria-hidden="true" />}
    </>
  )
  if (!interactive) {
    return <div className="w-full flex items-center gap-3 px-2 md:px-3 py-3 min-h-[52px]">{inner}</div>
  }
  return (
    <button
      onClick={() => onOpen(s.id)}
      aria-label={`Buka transaksi pelunasan ${s.number}`}
      className="w-full flex items-center gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 transition-colors text-left min-h-[52px]"
    >
      {inner}
    </button>
  )
}
