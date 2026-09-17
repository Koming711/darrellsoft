'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Banknote, Check, ChevronDown, HandCoins, Loader2, Package, Plus, ReceiptText,
  RefreshCw, ShoppingBag, Trash2, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, round2 } from '@/lib/format'
import {
  TYPE_LABEL,
  type Customer,
  type Invoice,
  type InvoiceListResponse,
  type InvoiceListRow,
  type InvoiceStatus,
  type InvoiceType,
  type Item,
  type PriceRow,
  type SessionUser,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

interface InvoiceLineDraft {
  key: string
  itemId: string
  description: string
  unit: string
  qty: string
  price: string
  isCustomPrice: boolean
}

type SavingKey = 'BELUM_BAYAR' | 'LUNAS' | 'DP' | 'PELUNASAN'

interface InvoiceCreateProps {
  user: SessionUser
  onBack: () => void
  onCreated: (invoice: Invoice) => void
}

const TYPE_OPTIONS: InvoiceType[] = ['REGULER', 'DP', 'PELUNASAN']

export default function InvoiceCreate({ user, onBack, onCreated }: InvoiceCreateProps) {
  const [invType, setInvType] = useState<InvoiceType>('REGULER')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [masterLoading, setMasterLoading] = useState(true)

  const [custOpen, setCustOpen] = useState(false)
  const [itemOpen, setItemOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [priceMap, setPriceMap] = useState<Map<string, number | null>>(new Map())
  const [customCount, setCustomCount] = useState(0)

  const [lines, setLines] = useState<InvoiceLineDraft[]>([])
  const [discount, setDiscount] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [dpInput, setDpInput] = useState('')
  const [saving, setSaving] = useState<SavingKey | null>(null)

  // ===== PELUNASAN =====
  const [dpOptions, setDpOptions] = useState<InvoiceListRow[]>([])
  const [dpOptionsLoading, setDpOptionsLoading] = useState(false)
  const [dpPickOpen, setDpPickOpen] = useState(false)
  const [selectedDp, setSelectedDp] = useState<InvoiceListRow | null>(null)
  const [paidInput, setPaidInput] = useState('')
  const [plDueDate, setPlDueDate] = useState('')
  const [plNotes, setPlNotes] = useState('')

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [c, i] = await Promise.all([
          apiFetch<Customer[]>('/api/customers'),
          apiFetch<{ items: Item[] }>('/api/items'),
        ])
        if (cancelled) return
        setCustomers(c.filter((x) => x.isActive))
        setItems(i.items)
      } catch (e) {
        if (!cancelled) toast.error(errText(e))
      } finally {
        if (!cancelled) setMasterLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Opsi invoice DP (status BELUM_BAYAR & sisa > 0) untuk mode PELUNASAN — dimuat saat masuk mode, bisa di-refresh
  const loadDpOptions = useCallback(async () => {
    setDpOptionsLoading(true)
    try {
      const data = await apiFetch<InvoiceListResponse>('/api/invoices?type=DP')
      setDpOptions(data.invoices)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDpOptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (invType === 'PELUNASAN') void loadDpOptions()
  }, [invType, loadDpOptions])

  const eligibleDps = useMemo(
    () => dpOptions.filter((r) => r.type === 'DP' && r.status === 'BELUM_BAYAR' && r.sisa > 0),
    [dpOptions]
  )

  const selectCustomer = async (c: Customer) => {
    setCustOpen(false)
    setSelectedCustomer(c)
    setPricesLoading(true)
    try {
      const data = await apiFetch<{ rows: PriceRow[] }>(
        `/api/prices?customerId=${encodeURIComponent(c.id)}`
      )
      const m = new Map<string, number | null>()
      data.rows.forEach((r) => m.set(r.itemId, r.customPrice))
      setPriceMap(m)
      setCustomCount(data.rows.filter((r) => r.customPrice != null).length)
      // Sesuaikan harga baris yang sudah ada dengan harga pelanggan baru
      setLines((prev) => prev.map((l) => {
        const item = itemsById.get(l.itemId)
        if (!item) return l
        const custom = m.get(l.itemId) ?? null
        return {
          ...l,
          price: custom != null ? String(custom) : String(item.standardPrice),
          isCustomPrice: custom != null,
        }
      }))
    } catch (e) {
      toast.error(errText(e))
      setPriceMap(new Map())
      setCustomCount(0)
    } finally {
      setPricesLoading(false)
    }
  }

  const addLine = (item: Item) => {
    if (!selectedCustomer) {
      toast.error('Pilih pelanggan terlebih dahulu')
      return
    }
    setItemOpen(false)
    if (lines.some((l) => l.itemId === item.id)) {
      toast.info(`${item.name} sudah ada di daftar`)
      return
    }
    const custom = priceMap.get(item.id) ?? null
    setLines((prev) => [
      ...prev,
      {
        key: `line-${item.id}`,
        itemId: item.id,
        description: item.name,
        unit: item.unit,
        qty: '1',
        price: custom != null ? String(custom) : String(item.standardPrice),
        isCustomPrice: custom != null,
      },
    ])
  }

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const updateLine = (key: string, patch: Partial<InvoiceLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  // ===== Ringkasan =====
  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.qty) || 0) * (Number(l.price) || 0), 0),
    [lines]
  )
  const discNum = Number(discount) || 0
  const rateNum = Number(taxRate) || 0
  const taxAmount = round2((subtotal - discNum) * rateNum / 100)
  const total = round2(subtotal - discNum + taxAmount)

  const dpNum = Number(dpInput) || 0
  const dpSisa = Math.max(0, round2(total - dpNum))
  const dpInvalid = dpNum < 0 || dpNum > total

  const paidNum = Number(paidInput) || 0
  const paidLunas = selectedDp !== null && paidNum >= selectedDp.sisa
  const paidInvalid = selectedDp !== null && paidNum > selectedDp.sisa

  const validate = (): string | null => {
    if (!selectedCustomer) return 'Pilih pelanggan terlebih dahulu'
    if (lines.length === 0) return 'Tambahkan minimal 1 barang'
    for (const l of lines) {
      const q = Number(l.qty)
      const p = Number(l.price)
      if (!Number.isFinite(q) || q <= 0) return `Qty untuk "${l.description}" harus lebih dari 0`
      if (!Number.isFinite(p) || p < 0) return `Harga untuk "${l.description}" tidak boleh negatif`
    }
    if (discNum < 0) return 'Diskon tidak boleh negatif'
    if (rateNum < 0) return 'PPN tidak boleh negatif'
    return null
  }

  const handleSaveReguler = async (status: InvoiceStatus) => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    if (!selectedCustomer) return
    setSaving(status === 'LUNAS' ? 'LUNAS' : 'BELUM_BAYAR')
    try {
      const data = await apiFetch<{ invoice: Invoice }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
          notes: notes.trim() || null,
          discount: discNum,
          taxRate: rateNum,
          status,
          items: lines.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            unit: l.unit,
            qty: Number(l.qty),
            price: Number(l.price),
          })),
        }),
      })
      toast.success(`Invoice ${data.invoice.number} tersimpan`)
      onCreated(data.invoice)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(null)
    }
  }

  const handleSaveDp = async () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    if (dpInvalid) {
      toast.error('Jumlah DP tidak boleh melebihi total pesanan')
      return
    }
    if (!selectedCustomer) return
    setSaving('DP')
    try {
      const data = await apiFetch<{ invoice: Invoice }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          type: 'DP',
          customerId: selectedCustomer.id,
          dpAmount: dpNum,
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
          notes: notes.trim() || null,
          discount: discNum,
          taxRate: rateNum,
          items: lines.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            unit: l.unit,
            qty: Number(l.qty),
            price: Number(l.price),
          })),
        }),
      })
      toast.success(`Invoice DP ${data.invoice.number} tersimpan`)
      onCreated(data.invoice)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(null)
    }
  }

  const handleSavePelunasan = async () => {
    if (!selectedDp) {
      toast.error('Pilih invoice DP terlebih dahulu')
      return
    }
    if (!Number.isFinite(paidNum) || paidNum <= 0) {
      toast.error('Nominal pelunasan harus lebih dari 0')
      return
    }
    if (paidNum > selectedDp.sisa) {
      toast.error('Nominal pelunasan melebihi sisa tagihan')
      return
    }
    setSaving('PELUNASAN')
    try {
      const data = await apiFetch<{ invoice: Invoice }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          type: 'PELUNASAN',
          parentInvoiceId: selectedDp.id,
          paidAmount: paidNum,
          dueDate: plDueDate ? new Date(`${plDueDate}T00:00:00`).toISOString() : null,
          notes: plNotes.trim() || null,
        }),
      })
      toast.success(`Pelunasan ${data.invoice.number} tersimpan`)
      onCreated(data.invoice)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(null)
    }
  }

  const selectDpInvoice = (row: InvoiceListRow) => {
    setDpPickOpen(false)
    setSelectedDp(row)
    setPaidInput(String(row.sisa))
  }

  const busy = saving !== null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          aria-label="Kembali ke daftar invoice"
          className="h-10 w-10 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Buat Invoice Baru</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {invType === 'PELUNASAN'
              ? 'Pilih invoice DP yang belum lunas, lalu catat pembayarannya.'
              : 'Pilih pelanggan, tambahkan barang, lalu simpan.'}
          </p>
        </div>
      </div>

      {/* Pemilih tipe invoice */}
      <div
        role="group"
        aria-label="Jenis invoice"
        className="grid grid-cols-3 gap-1.5 max-w-md rounded-xl border border-stone-200 bg-white p-1.5"
      >
        {TYPE_OPTIONS.map((t) => {
          const Icon = t === 'REGULER' ? ReceiptText : t === 'DP' ? Banknote : HandCoins
          return (
            <button
              key={t}
              type="button"
              aria-pressed={invType === t}
              onClick={() => setInvType(t)}
              className={cn(
                'flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border px-2 text-sm font-medium transition-colors',
                invType === t
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-transparent text-stone-600 hover:bg-stone-100'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t === 'DP' ? 'DP (Uang Muka)' : TYPE_LABEL[t]}</span>
            </button>
          )
        })}
      </div>

      {invType === 'PELUNASAN' ? (
        /* ============ MODE PELUNASAN — satu kolom, tanpa picker pelanggan/barang ============ */
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Pilih invoice DP */}
          <Card className="p-0 gap-0">
            <CardHeader className="flex-row items-center justify-between px-4 md:px-5 pt-4 pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-emerald-600" /> Invoice DP
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadDpOptions()}
                disabled={dpOptionsLoading}
                aria-label="Muat ulang daftar invoice DP"
                className="text-emerald-700 hover:text-emerald-800 h-8 min-h-[44px] md:min-h-[36px]"
              >
                <RefreshCw className={cn('h-4 w-4', dpOptionsLoading && 'animate-spin')} />
                <span className="md:hidden">Muat Ulang</span>
              </Button>
            </CardHeader>
            <CardContent className="px-4 md:px-5 pb-4 space-y-2">
              <Popover open={dpPickOpen} onOpenChange={setDpPickOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={dpPickOpen}
                    aria-label="Pilih invoice DP untuk dilunasi"
                    className="w-full justify-between min-h-[44px]"
                  >
                    {selectedDp ? (
                      <span className="truncate">
                        {selectedDp.number} · {selectedDp.customerName}{' '}
                        <span className="text-emerald-700 font-semibold">
                          Sisa {formatIDR(selectedDp.sisa)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Pilih invoice DP…</span>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cari nomor / pelanggan…" />
                    <CommandEmpty>Invoice DP tidak ditemukan.</CommandEmpty>
                    <CommandList className="max-h-60 overflow-y-auto scrollbar-thin">
                      {eligibleDps.length === 0 && (
                        <div className="py-6 text-center text-sm text-muted-foreground px-4">
                          {dpOptionsLoading
                            ? 'Memuat daftar invoice DP…'
                            : 'Tidak ada invoice DP dengan sisa tagihan.'}
                        </div>
                      )}
                      {eligibleDps.map((row) => (
                        <CommandItem
                          key={row.id}
                          value={`${row.number} ${row.customerName}`}
                          onSelect={() => selectDpInvoice(row)}
                          className="min-h-[44px]"
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4 shrink-0',
                              selectedDp?.id === row.id ? 'opacity-100 text-emerald-600' : 'opacity-0'
                            )}
                          />
                          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{row.number}</p>
                              <p className="text-xs text-muted-foreground truncate">{row.customerName}</p>
                            </div>
                            <span className="text-xs font-semibold text-emerald-700 shrink-0">
                              Sisa {formatIDR(row.sisa)}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Hanya invoice DP berstatus Belum Bayar dengan sisa tagihan yang ditampilkan.
              </p>
            </CardContent>
          </Card>

          {dpOptionsLoading && dpOptions.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : selectedDp ? (
            /* Rekap + input pembayaran */
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-5 pt-4 pb-3">
                <CardTitle className="text-sm">Rincian Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-5 pb-4 space-y-3 text-sm">
                {/* Rekap invoice DP */}
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 md:p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Pelanggan</span>
                    <span className="font-medium truncate">{selectedDp.customerName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Total Pesanan</span>
                    <span>{formatIDR(selectedDp.total)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Total DP</span>
                    <span>{formatIDR(selectedDp.dpAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Sudah Dipelunasi</span>
                    <span className="text-emerald-700">{formatIDR(selectedDp.settlementTotal)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">Sisa Tagihan</span>
                    <span className="font-bold text-xl text-amber-700">
                      {formatIDR(selectedDp.sisa)}
                    </span>
                  </div>
                </div>

                {/* Nominal pelunasan */}
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pl-amount">Nominal Pelunasan (Rp)</Label>
                    {paidNum > 0 && !paidInvalid && (
                      paidLunas ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[11px]">
                          Lunas
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[11px]">
                          Bayar Sebagian · sisa {formatIDR(selectedDp.sisa - paidNum)}
                        </Badge>
                      )
                    )}
                  </div>
                  <Input
                    id="pl-amount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="any"
                    value={paidInput}
                    onChange={(e) => setPaidInput(e.target.value)}
                    aria-label="Nominal pelunasan dalam Rupiah"
                    className="min-h-[44px]"
                    placeholder="0"
                  />
                  {paidInvalid ? (
                    <p className="text-xs text-red-600">
                      Nominal tidak boleh melebihi sisa tagihan ({formatIDR(selectedDp.sisa)}).
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Otomatis terisi sisa tagihan — ubah bila pelanggan membayar sebagian.
                    </p>
                  )}
                </div>

                {/* Jatuh tempo & catatan */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pl-due">Jatuh Tempo</Label>
                    <Input
                      id="pl-due"
                      type="date"
                      value={plDueDate}
                      onChange={(e) => setPlDueDate(e.target.value)}
                      aria-label="Tanggal jatuh tempo pelunasan"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pl-notes">Catatan</Label>
                    <Textarea
                      id="pl-notes"
                      rows={2}
                      value={plNotes}
                      onChange={(e) => setPlNotes(e.target.value)}
                      placeholder="Catatan (opsional)"
                    />
                  </div>
                </div>

                <Button
                  disabled={busy || paidInvalid || paidNum <= 0}
                  onClick={() => void handleSavePelunasan()}
                  className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] w-full"
                >
                  {saving === 'PELUNASAN' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan Pelunasan
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 py-10 px-4 text-center">
              <HandCoins className="h-8 w-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Pilih invoice DP di atas untuk mencatat pelunasannya.
              </p>
            </div>
          )}
        </div>
      ) : masterLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Kolom kiri */}
          <div className="lg:col-span-2 space-y-5">
            {/* Pelanggan */}
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-5 pt-4 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-emerald-600" /> Pelanggan
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-5 pb-4 space-y-2">
                <Popover open={custOpen} onOpenChange={setCustOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={custOpen}
                      aria-label="Pilih pelanggan untuk invoice"
                      className="w-full justify-between min-h-[44px]"
                    >
                      {selectedCustomer ? (
                        <span className="truncate">
                          {selectedCustomer.name}{' '}
                          <span className="text-muted-foreground font-mono text-xs">({selectedCustomer.code})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pilih pelanggan…</span>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Cari nama / kode pelanggan…" />
                      <CommandEmpty>Pelanggan tidak ditemukan.</CommandEmpty>
                      <CommandList className="max-h-60 overflow-y-auto scrollbar-thin">
                        {customers.length === 0 && (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            Belum ada pelanggan aktif.
                          </div>
                        )}
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.code}`}
                            onSelect={() => void selectCustomer(c)}
                            className="min-h-[44px]"
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 shrink-0',
                                selectedCustomer?.id === c.id ? 'opacity-100 text-emerald-600' : 'opacity-0'
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedCustomer && (
                  <p className="text-xs">
                    {pricesLoading ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Memuat harga khusus…
                      </span>
                    ) : customCount > 0 ? (
                      <span className="text-emerald-700 font-medium">
                        {customCount} barang dengan harga khusus untuk pelanggan ini
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Belum ada harga khusus — pakai harga standar</span>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Barang / Layanan */}
            <Card className="p-0 gap-0">
              <CardHeader className="flex-row items-center justify-between px-4 md:px-5 pt-4 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-emerald-600" /> Barang / Layanan
                </CardTitle>
                <Popover open={itemOpen} onOpenChange={setItemOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="min-h-[44px] md:min-h-[36px]">
                      <Plus className="h-4 w-4" /> Tambah Barang
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Cari nama / kode barang…" />
                      <CommandEmpty>Barang tidak ditemukan.</CommandEmpty>
                      <CommandList className="max-h-60 overflow-y-auto scrollbar-thin">
                        {items.length === 0 && (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            Belum ada barang aktif.
                          </div>
                        )}
                        {items.map((it) => {
                          const custom = selectedCustomer ? priceMap.get(it.id) ?? null : null
                          return (
                            <CommandItem
                              key={it.id}
                              value={`${it.name} ${it.code}`}
                              onSelect={() => addLine(it)}
                              className="min-h-[44px]"
                            >
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{it.name}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{it.code} · {it.unit}</p>
                                </div>
                                <span
                                  className={cn(
                                    'text-xs shrink-0',
                                    custom != null ? 'font-semibold text-emerald-700' : 'text-muted-foreground'
                                  )}
                                >
                                  {formatIDR(custom ?? it.standardPrice)}
                                </span>
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardContent className="px-4 md:px-5 pb-4">
                {lines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-300 py-8 px-4 text-center">
                    <Package className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Belum ada barang.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-[44px]"
                      onClick={() => setItemOpen(true)}
                    >
                      <Plus className="h-4 w-4" /> Pilih Barang
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                    {lines.map((l) => {
                      const q = Number(l.qty)
                      const p = Number(l.price)
                      const lineTotal = (Number.isFinite(q) ? q : 0) * (Number.isFinite(p) ? p : 0)
                      return (
                        <div key={l.key} className="p-3 md:p-4 grid gap-2.5 md:grid-cols-12 md:items-center">
                          <div className="md:col-span-5 flex items-start justify-between gap-2 min-w-0">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{l.description}</p>
                              <div className="mt-1">
                                {l.isCustomPrice ? (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">Khusus</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-stone-50 text-stone-500 border-stone-200 text-[10px]">Standar</Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-destructive hover:text-destructive md:hidden"
                              onClick={() => removeLine(l.key)}
                              aria-label={`Hapus ${l.description}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="md:col-span-2 grid gap-1">
                            <Label htmlFor={`qty-${l.key}`} className="text-xs text-muted-foreground md:hidden">Qty</Label>
                            <Input
                              id={`qty-${l.key}`}
                              type="number"
                              inputMode="decimal"
                              min={0.01}
                              step="any"
                              value={l.qty}
                              onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                              aria-label={`Jumlah ${l.description}`}
                              className="min-h-[44px]"
                            />
                          </div>
                          <div className="md:col-span-3 grid gap-1">
                            <Label htmlFor={`price-${l.key}`} className="text-xs text-muted-foreground md:hidden">Harga (Rp)</Label>
                            <Input
                              id={`price-${l.key}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step="any"
                              value={l.price}
                              onChange={(e) => updateLine(l.key, { price: e.target.value })}
                              aria-label={`Harga ${l.description}`}
                              className="min-h-[44px]"
                            />
                          </div>
                          <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2">
                            <span className="text-xs text-muted-foreground md:hidden">Jumlah:</span>
                            <span className="text-sm font-semibold whitespace-nowrap">{formatIDR(lineTotal)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden md:inline-flex h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => removeLine(l.key)}
                              aria-label={`Hapus ${l.description}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pengaturan */}
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-5 pt-4 pb-3">
                <CardTitle className="text-sm">Pengaturan</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-5 pb-4 grid sm:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="inv-discount">Diskon (Rp)</Label>
                  <Input
                    id="inv-discount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="any"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="inv-tax">PPN (%)</Label>
                  <Input
                    id="inv-tax"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="inv-due">Jatuh Tempo</Label>
                  <Input
                    id="inv-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    aria-label="Tanggal jatuh tempo"
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="inv-notes">Catatan</Label>
                  <Textarea
                    id="inv-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan untuk pelanggan (opsional)"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ringkasan */}
          <div className="lg:sticky lg:top-6 self-start space-y-3">
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-5 pt-4 pb-3">
                <CardTitle className="text-sm">Ringkasan</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-5 pb-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Diskon</span>
                  <span className={discNum > 0 ? 'text-red-600' : undefined}>-{formatIDR(discNum)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">PPN ({rateNum > 0 ? `${rateNum}%` : '0%'})</span>
                  <span>{formatIDR(taxAmount)}</span>
                </div>
                <Separator className="my-2" />

                {invType === 'DP' ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">Total Pesanan</span>
                      <span className="font-bold text-xl">{formatIDR(total)}</span>
                    </div>
                    <div className="grid gap-1.5 py-1">
                      <Label htmlFor="inv-dp">Jumlah DP (Rp)</Label>
                      <Input
                        id="inv-dp"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step="any"
                        value={dpInput}
                        onChange={(e) => setDpInput(e.target.value)}
                        aria-label="Jumlah DP dalam Rupiah"
                        placeholder="0"
                        className="min-h-[44px]"
                      />
                      {dpInvalid && (
                        <p className="text-xs text-red-600">
                          DP tidak boleh melebihi total pesanan.
                        </p>
                      )}
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Jumlah DP</span>
                      <span className="text-emerald-700 font-medium">{formatIDR(dpNum)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">Sisa Tagihan</span>
                      <span
                        className={cn(
                          'font-bold text-xl',
                          dpSisa > 0 ? 'text-amber-700' : 'text-emerald-700'
                        )}
                      >
                        {formatIDR(dpSisa)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      Status otomatis LUNAS bila DP sama dengan total pesanan.
                    </p>
                    <div className="grid gap-2 pt-3">
                      <Button
                        disabled={busy || dpInvalid}
                        onClick={() => void handleSaveDp()}
                        className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                      >
                        {saving === 'DP' && <Loader2 className="h-4 w-4 animate-spin" />}
                        Simpan Invoice DP
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-xl">{formatIDR(total)}</span>
                    </div>
                    <div className="grid gap-2 pt-3">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleSaveReguler('LUNAS')}
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 min-h-[44px]"
                      >
                        {saving === 'LUNAS' && <Loader2 className="h-4 w-4 animate-spin" />}
                        Simpan &amp; Lunas
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => void handleSaveReguler('BELUM_BAYAR')}
                        className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                      >
                        {saving === 'BELUM_BAYAR' && <Loader2 className="h-4 w-4 animate-spin" />}
                        Simpan Invoice
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            {invType === 'REGULER' && (
              <p className="text-xs text-muted-foreground px-1">
                &quot;Simpan Invoice&quot; membuat invoice berstatus Belum Bayar. Gunakan &quot;Simpan &amp; Lunas&quot;
                jika pembayaran diterima langsung.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
