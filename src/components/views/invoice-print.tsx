'use client'

/**
 * Template cetak invoice (semua komponen di dalam #print-area).
 * Dipakai oleh invoice-detail (cetak dari halaman detail) dan laporan penjualan
 * (cetak per baris via dialog). Tidak boleh berisi tombol/interaksi CRUD.
 */
import {
  STATUS_LABEL,
  type Invoice,
  type InvoiceCustomer,
  type InvoiceLine,
  type InvoiceSettlementRow,
  type InvoiceStatus,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDate, formatIDR, formatNum } from '@/lib/format'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATUS_CHIP: Record<InvoiceStatus, string> = {
  BELUM_BAYAR: 'text-amber-700 border-amber-300',
  LUNAS: 'text-emerald-700 border-emerald-300',
  BATAL: 'text-stone-500 border-stone-300',
}

function PrintKop({
  title,
  number,
  status,
  date,
  dueDate,
}: {
  title: string
  number: string
  status: InvoiceStatus
  date: string
  dueDate: string | null
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-stone-200">
      <div className="flex items-start gap-3">
        <img src="/logo.svg" alt="Logo InvoiceKu" className="h-12 w-12" />
        <div>
          <p className="text-lg font-bold tracking-tight leading-tight">InvoiceKu</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Invoice &amp; Harga Khusus Pelanggan</p>
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
        <p className="text-xs text-muted-foreground mt-0.5">Dibuat oleh</p>
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

/**
 * Isi lengkap template cetak invoice (tanpa pembungkus #print-area —
 * pemanggil yang membungkus dengan Card/div ber-id="print-area").
 */
export function InvoicePrintBody({ inv }: { inv: Invoice }) {
  return (
    <>
      <PrintKop
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
      {inv.type === 'DP' && (inv.settlements ?? []).length > 0 && (
        <PrintDpSettlements settlements={inv.settlements ?? []} />
      )}

      <PrintNotes notes={inv.notes} />

      <PrintSignature name={inv.createdByName} />
    </>
  )
}
