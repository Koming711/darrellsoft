'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, ChevronRight, FileDown, FileSpreadsheet, FileText, Image as ImageIcon,
  Mail, MessageCircle, Pencil, Printer, Trash2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, downloadFile } from '@/lib/invoice-client'
import { formatDate, formatIDR, formatNum } from '@/lib/invoice-format'
import {
  STATUS_LABEL,
  type Invoice,
  type InvoiceCustomer,
  type InvoiceLine,
  type InvoiceSessionUser,
  type InvoiceSettlementRow,
  type InvoiceStatus,
} from '@/lib/invoice-types'
import { cn } from '@/lib/utils'
import { buildEmailLink, buildWaLink } from '@/lib/invoice-wa'
import { captureElementAsJpg } from '@/lib/capture-jpg'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, SummaryChip, TypeBadge } from '@/components/invoice/invoice-badges'
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

const STATUS_CHIP: Record<InvoiceStatus, string> = {
  BELUM_BAYAR: 'text-amber-700 border-amber-300',
  LUNAS: 'text-emerald-700 border-emerald-300',
  BATAL: 'text-stone-500 border-stone-300',
}

interface InvoiceDetailProps {
  user: InvoiceSessionUser
  invoiceId: string
  onBack: () => void
  onChanged: () => void
  onDeleted: () => void
  /** Opsional: buka invoice lain (riwayat pelunasan / invoice DP induk) dari halaman detail ini */
  onOpenInvoice?: (id: string) => void
  /** Opsional: buka mode edit invoice */
  onEdit?: (id: string) => void
}

export default function InvoiceDetail({
  user,
  invoiceId,
  onBack,
  onChanged,
  onDeleted,
  onOpenInvoice,
  onEdit,
}: InvoiceDetailProps) {
  const [inv, setInv] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'lunas' | 'batal' | 'hapus' | 'jpg' | null>(null)
  const [company, setCompany] = useState<{ name: string; logo: string; phone: string }>({
    name: '', logo: '', phone: '',
  })

  const printRef = useRef<HTMLDivElement>(null)

  const [confirmLunas, setConfirmLunas] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)
  const [confirmHapus, setConfirmHapus] = useState(false)

  const canDelete = user.role === 'superadmin' || user.role === 'admin'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/public-settings')
        const d = res.ok ? await res.json() : null
        if (!cancelled && d) {
          setCompany({
            name: d.company_name || '',
            logo: d.company_logo || '',
            phone: d.company_phone || '',
          })
        }
      } catch {
        /* abaikan — kop tetap memakai fallback */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiJson<{ invoice: Invoice }>(`/api/invoices/${encodeURIComponent(invoiceId)}`)
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
      const data = await apiJson<{ invoice: Invoice }>(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
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
      await apiJson<{ ok: boolean }>(`/api/invoices/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' })
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

  const handleJpg = async () => {
    if (!printRef.current || !inv) return
    setBusy('jpg')
    try {
      const blob = await captureElementAsJpg(printRef.current)
      const result = await shareJpgToWhatsApp({
        blob,
        fileName: `Invoice-${inv.number}.jpg`,
        documentLabel: 'Invoice',
      })
      if (result.status === 'shared') toast.success('Gambar dibagikan')
      else if (result.status === 'downloaded') toast.success('Gambar JPG diunduh')
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(null)
    }
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
              <p className="text-xs text-muted-foreground mt-0.5">{formatDate(inv.date)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Invoice tidak ditemukan.</p>
          )}
        </div>

        {inv && (
          <div className="flex flex-wrap gap-2">
            {onEdit && inv.status !== 'BATAL' && (
              <Button
                variant="outline"
                onClick={() => onEdit(invoiceId)}
                disabled={busy !== null}
                className="min-h-[44px]"
                aria-label={`Edit invoice ${inv.number}`}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <Button
              onClick={handleWa}
              disabled={busy !== null}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleJpg()}
              disabled={busy !== null}
              className="min-h-[44px]"
              aria-label="Kirim gambar invoice via WhatsApp"
            >
              {busy === 'jpg' ? <span className="animate-spin"><ImageIcon className="h-4 w-4" /></span> : <ImageIcon className="h-4 w-4" />} JPG
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
            {inv.status !== 'BATAL' ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmBatal(true)}
                disabled={busy !== null}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px]"
              >
                <XCircle className="h-4 w-4" /> Batalkan
              </Button>
            ) : (
              <p className="w-full text-xs text-muted-foreground self-center">
                Invoice berstatus batal — perubahan status dinonaktifkan.
              </p>
            )}
            {canDelete && (
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
        <Card id="print-area" className="p-0 gap-0 shadow-sm" ref={printRef}>
          <CardContent className="p-5 md:p-8">
            <PrintKop
              company={company}
              title={
                inv.type === 'DP'
                  ? 'INVOICE DP — UANG MUKA'
                  : inv.type === 'PELUNASAN'
                    ? 'INVOICE PELUNASAN'
                    : 'INVOICE'
              }
              number={inv.number}
              status={inv.status}
              date={inv.date}
              dueDate={inv.dueDate}
            />

            <PrintCustomer customer={inv.customer} />

            {/* Rincian barang / layanan */}
            <div className="py-5">
              <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
                <PrintItems items={inv.items} />
              </div>

              {inv.type === 'REGULER' && (
                <PrintTotalsReguler
                  subtotal={inv.subtotal}
                  discount={inv.discount}
                  taxRate={inv.taxRate}
                  taxAmount={inv.taxAmount}
                  total={inv.total}
                />
              )}
              {inv.type === 'DP' && <PrintTotalsDp inv={inv} />}
              {inv.type === 'PELUNASAN' && <PrintTotalsPelunasan inv={inv} />}
            </div>

            {/* Riwayat pelunasan (cetak, hanya invoice DP) */}
            {inv.type === 'DP' && settlements.length > 0 && (
              <PrintDpSettlements settlements={settlements} />
            )}

            <PrintNotes notes={inv.notes} />

            <PrintSignature name={company.name || inv.customer.name} />
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
          {formatDate(s.date)}
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

/* ===== Komponen template cetak (semua di dalam #print-area) ===== */

function PrintKop({
  company,
  title,
  number,
  status,
  date,
  dueDate,
}: {
  company: { name: string; logo: string; phone: string }
  title: string
  number: string
  status: InvoiceStatus
  date: string
  dueDate: string | null
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-stone-200">
      <div className="flex items-start gap-3">
        <img
          src={company.logo || '/logo.svg'}
          alt={company.name ? `Logo ${company.name}` : 'Logo'}
          className="h-12 w-12 object-contain"
        />
        <div>
          <p className="text-lg font-bold tracking-tight leading-tight">{company.name || 'Invoice'}</p>
          {company.phone && <p className="text-[11px] text-muted-foreground mt-0.5">{company.phone}</p>}
        </div>
      </div>
      <div className="text-sm sm:text-right space-y-1">
        <p className="text-base font-bold tracking-wide">{title}</p>
        <p className="font-semibold">{number}</p>
        <div>
          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_CHIP[status])}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-xs sm:text-sm pt-1">
          <span className="text-muted-foreground">Tanggal: </span>{formatDate(date)}
        </p>
        <p className="text-xs sm:text-sm">
          <span className="text-muted-foreground">Jatuh Tempo: </span>{dueDate ? formatDate(dueDate) : '-'}
        </p>
      </div>
    </div>
  )
}

function PrintCustomer({ customer }: { customer: InvoiceCustomer }) {
  return (
    <div className="py-5 border-b border-stone-200">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Kepada Yth.</p>
      <p className="font-semibold">{customer.name}</p>
      {customer.address && <p className="text-sm text-muted-foreground">{customer.address}</p>}
      {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
    </div>
  )
}

function PrintItems({ items }: { items: InvoiceLine[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-stone-50 hover:bg-stone-50">
          <TableHead>Deskripsi</TableHead>
          <TableHead className="text-center">Qty</TableHead>
          <TableHead className="text-center">Satuan</TableHead>
          <TableHead className="text-right">Harga</TableHead>
          <TableHead className="text-right">Jumlah</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((it) => (
          <TableRow key={it.id}>
            <TableCell className="font-medium">{it.description}</TableCell>
            <TableCell className="text-center">{formatNum(it.qty)}</TableCell>
            <TableCell className="text-center">{it.unit}</TableCell>
            <TableCell className="text-right whitespace-nowrap">{formatIDR(it.price)}</TableCell>
            <TableCell className="text-right whitespace-nowrap">{formatIDR(it.lineTotal)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PrintSignature({ name }: { name: string }) {
  return (
    <div className="flex justify-end pt-2">
      <div className="text-center text-sm w-44">
        <p>Hormat kami,</p>
        <div className="h-16" aria-hidden="true" />
        <p className="font-semibold border-t border-stone-300 pt-1.5">{name}</p>
      </div>
    </div>
  )
}

function PrintNotes({ notes }: { notes: string | null }) {
  if (!notes) return null
  return (
    <div className="pb-5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Catatan</p>
      <p className="text-sm whitespace-pre-wrap">{notes}</p>
    </div>
  )
}

function PrintTotalsReguler({
  subtotal,
  discount,
  taxRate,
  taxAmount,
  total,
}: {
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
}) {
  return (
    <div className="mt-4 flex justify-end">
      <div className="w-full sm:w-72 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatIDR(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Diskon</span>
            <span className="text-red-600">-{formatIDR(discount)}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">PPN ({formatNum(taxRate)}%)</span>
            <span>{formatIDR(taxAmount)}</span>
          </div>
        )}
        <Separator className="my-2" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-lg">{formatIDR(total)}</span>
        </div>
      </div>
    </div>
  )
}

function PrintTotalsDp({ inv }: { inv: Invoice }) {
  const lunas = inv.sisa <= 0
  return (
    <div className="mt-4 flex justify-end">
      <div className="w-full sm:w-80 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatIDR(inv.subtotal)}</span>
        </div>
        {inv.discount > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Diskon</span>
            <span className="text-red-600">-{formatIDR(inv.discount)}</span>
          </div>
        )}
        {inv.taxRate > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">PPN ({formatNum(inv.taxRate)}%)</span>
            <span>{formatIDR(inv.taxAmount)}</span>
          </div>
        )}
        <Separator className="my-2" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">Total Pesanan</span>
          <span className="font-bold">{formatIDR(inv.total)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Jumlah DP (Dibayar)</span>
          <span className="font-semibold text-emerald-700">{formatIDR(inv.dpAmount)}</span>
        </div>
        <Separator className="my-2" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-bold">SISA TAGIHAN</span>
          <span className={cn('font-bold text-lg', lunas ? 'text-emerald-700' : 'text-amber-700')}>
            {lunas ? 'LUNAS' : formatIDR(inv.sisa)}
          </span>
        </div>
      </div>
    </div>
  )
}

function PrintDpSettlements({ settlements }: { settlements: InvoiceSettlementRow[] }) {
  return (
    <div className="pb-5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Riwayat Pelunasan</p>
      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50 hover:bg-stone-50">
              <TableHead className="w-10">No</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlements.map((s, i) => (
              <TableRow key={s.id} className={s.status === 'BATAL' ? 'text-stone-400' : undefined}>
                <TableCell className={cn(s.status === 'BATAL' && 'line-through')}>{i + 1}</TableCell>
                <TableCell className={cn(s.status === 'BATAL' && 'line-through')}>{formatDate(s.date)}</TableCell>
                <TableCell className={cn('text-right whitespace-nowrap', s.status === 'BATAL' && 'line-through')}>
                  {formatIDR(s.paidAmount)}
                </TableCell>
                <TableCell className={cn('text-center', s.status === 'BATAL' && 'line-through')}>
                  {STATUS_LABEL[s.status]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function PrintTotalsPelunasan({ inv }: { inv: Invoice }) {
  const p = inv.parent ?? null
  const lunas = inv.sisa <= 0
  return (
    <div className="mt-4 flex flex-col items-end gap-2">
      <div className="w-full sm:w-80 space-y-1.5 text-sm">
        {p && (
          <>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total Pesanan</span>
              <span>{formatIDR(p.total)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total DP</span>
              <span>{formatIDR(p.dpAmount)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">PELUNASAN</span>
          <span className="font-bold text-lg text-emerald-700">{formatIDR(inv.paidAmount)}</span>
        </div>
        <Separator className="my-2" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-bold">SISA TAGIHAN</span>
          <span className={cn('font-bold text-lg', lunas ? 'text-emerald-700' : 'text-amber-700')}>
            {lunas ? 'LUNAS — sisa Rp0' : formatIDR(inv.sisa)}
          </span>
        </div>
      </div>
      {p && (
        <p className="text-xs text-muted-foreground text-left sm:text-right w-full">
          Merupakan pelunasan dari invoice DP {p.number}.
        </p>
      )}
    </div>
  )
}
