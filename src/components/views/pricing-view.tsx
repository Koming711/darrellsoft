'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent, Check, ChevronDown, Loader2, Search, Undo2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, priceDelta } from '@/lib/format'
import type { Customer, PriceRow, SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

export default function PricingView({ user }: { user: SessionUser }) {
  const canManage = user.role !== 'KASIR'

  const [customers, setCustomers] = useState<Customer[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)

  const [rows, setRows] = useState<PriceRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [initialDrafts, setInitialDrafts] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')

  const [saving, setSaving] = useState(false)
  const [pendingPick, setPendingPick] = useState<Customer | null>(null)

  useEffect(() => {
    let cancelled = false
    // API saat ini mengembalikan array customer langsung
    apiFetch<Customer[]>('/api/customers')
      .then((d) => {
        if (!cancelled) setCustomers(Array.isArray(d) ? d : [])
      })
      .catch((e) => toast.error(errText(e)))
    return () => {
      cancelled = true
    }
  }, [])

  const applyPick = useCallback(async (c: Customer) => {
    setSelected(c)
    setDrafts({})
    setInitialDrafts({})
    setFilter('')
    setRowsLoading(true)
    try {
      const data = await apiFetch<{ customer: { id: string; code: string; name: string }; rows: PriceRow[] }>(
        `/api/prices?customerId=${encodeURIComponent(c.id)}`
      )
      setRows(data.rows)
      const init: Record<string, string> = {}
      data.rows.forEach((r) => {
        init[r.itemId] = r.customPrice != null ? String(r.customPrice) : ''
      })
      setDrafts(init)
      setInitialDrafts(init)
    } catch (e) {
      toast.error(errText(e))
      setSelected(null)
      setRows([])
    } finally {
      setRowsLoading(false)
    }
  }, [])

  // Baris yang berubah (draft ≠ nilai awal)
  const dirtyEntries = useMemo(() => {
    const map = new Map<string, { row: PriceRow; draft: string }>()
    if (!selected) return map
    rows.forEach((r) => {
      const draft = drafts[r.itemId] ?? ''
      const original = r.customPrice != null ? String(r.customPrice) : ''
      if (draft !== original) map.set(r.itemId, { row: r, draft })
    })
    return map
  }, [rows, drafts, selected])

  const onPick = (c: Customer) => {
    setPickerOpen(false)
    if (selected && c.id === selected.id) return
    if (canManage && dirtyEntries.size > 0) {
      setPendingPick(c)
      return
    }
    void applyPick(c)
  }

  const customCount = useMemo(
    () => rows.filter((r) => (drafts[r.itemId] ?? '') !== '').length,
    [rows, drafts]
  )

  const visibleRows = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(f) || r.code.toLowerCase().includes(f)
    )
  }, [rows, filter])

  const resetRow = (itemId: string) => {
    setDrafts((d) => ({ ...d, [itemId]: initialDrafts[itemId] ?? '' }))
  }

  const handleSave = async () => {
    if (!selected) return
    const invalid = [...dirtyEntries.values()].some(({ draft }) => {
      if (draft.trim() === '') return false
      const n = Number(draft)
      return !Number.isFinite(n) || n < 0
    })
    if (invalid) {
      toast.error('Ada nilai harga yang tidak valid (minimal 0)')
      return
    }
    const entries = [...dirtyEntries.values()].map(({ row, draft }) => ({
      itemId: row.itemId,
      price: draft.trim() === '' ? null : Number(draft),
    }))
    if (entries.length === 0) {
      toast.error('Tidak ada perubahan untuk disimpan')
      return
    }
    setSaving(true)
    try {
      const data = await apiFetch<{ saved: number }>('/api/prices', {
        method: 'PUT',
        body: JSON.stringify({ customerId: selected.id, entries }),
      })
      toast.success(`${data.saved} harga khusus tersimpan`)
      await applyPick(selected)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Harga Khusus per Pelanggan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Atur harga jual khusus untuk pelanggan tertentu. Kosongkan harga khusus untuk memakai harga standar.
        </p>
      </div>

      {/* Langkah 1 — pilih pelanggan */}
      <div className="space-y-2">
        <p className="text-sm font-medium">1. Pilih Pelanggan</p>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              aria-label="Pilih pelanggan"
              className="w-full sm:w-80 justify-between min-h-[44px]"
            >
              {selected ? (
                <span className="truncate">
                  {selected.name} <span className="text-muted-foreground font-mono text-xs">({selected.code})</span>
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
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.code}`}
                    onSelect={() => onPick(c)}
                    className="min-h-[44px]"
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4 shrink-0', selected?.id === c.id ? 'opacity-100 text-emerald-600' : 'opacity-0')}
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
      </div>

      {/* Langkah 2 — atur harga */}
      {selected && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm font-medium">2. Atur Harga</p>
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter nama / kode barang…"
                aria-label="Filter barang"
                className="pl-9 min-h-[44px]"
              />
            </div>
          </div>

          {rowsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
              <BadgePercent className="h-10 w-10 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-medium">Tidak ada barang yang cocok</p>
              <p className="text-xs text-muted-foreground mt-1">Coba ubah kata kunci filter.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-emerald-700">{customCount} harga khusus</span> aktif untuk {selected.name}
              </p>

              {/* Desktop table */}
              <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-stone-50">
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead>Barang</TableHead>
                        <TableHead className="text-right">Harga Standar</TableHead>
                        <TableHead>Harga Khusus</TableHead>
                        <TableHead>Selisih</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((r) => {
                        const draft = drafts[r.itemId] ?? ''
                        const hasCustom = draft.trim() !== ''
                        const num = Number(draft)
                        const effective = hasCustom && Number.isFinite(num) ? num : null
                        const delta = effective != null ? priceDelta(effective, r.standardPrice) : null
                        return (
                          <TableRow key={r.itemId} className={hasCustom ? 'bg-emerald-50/50' : undefined}>
                            <TableCell>
                              <p className="font-medium">{r.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{r.code} · {r.unit}</p>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">{formatIDR(r.standardPrice)}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step="any"
                                value={draft}
                                onChange={(e) => setDrafts((d) => ({ ...d, [r.itemId]: e.target.value }))}
                                placeholder={formatIDR(r.standardPrice)}
                                aria-label={`Harga khusus ${r.name}`}
                                className="w-36"
                              />
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {effective != null && delta != null ? (
                                <span className={cn(
                                  'text-sm font-medium',
                                  delta < 0 ? 'text-emerald-700' : delta > 0 ? 'text-red-600' : 'text-muted-foreground'
                                )}>
                                  {formatIDR(effective)}{' '}
                                  <span className="text-xs">({delta > 0 ? '+' : ''}{delta}%)</span>
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {hasCustom ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                  onClick={() => resetRow(r.itemId)}
                                  aria-label={`Kembalikan harga standar untuk ${r.name}`}
                                  title="Pakai harga standar"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {visibleRows.map((r) => {
                  const draft = drafts[r.itemId] ?? ''
                  const hasCustom = draft.trim() !== ''
                  const num = Number(draft)
                  const effective = hasCustom && Number.isFinite(num) ? num : null
                  const delta = effective != null ? priceDelta(effective, r.standardPrice) : null
                  return (
                    <Card key={r.itemId} className="p-0 gap-0">
                      <CardContent className={cn('p-4 space-y-2', hasCustom && 'bg-emerald-50/50')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{r.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{r.code} · {r.unit}</p>
                          </div>
                          {hasCustom && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => resetRow(r.itemId)}
                              aria-label={`Kembalikan harga standar untuk ${r.name}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Harga standar: <span className="font-medium text-stone-700">{formatIDR(r.standardPrice)}</span>
                        </p>
                        <div className="grid gap-1">
                          <Label htmlFor={`price-${r.itemId}`} className="text-xs text-muted-foreground">Harga Khusus</Label>
                          <Input
                            id={`price-${r.itemId}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step="any"
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [r.itemId]: e.target.value }))}
                            placeholder={formatIDR(r.standardPrice)}
                            className="min-h-[44px]"
                          />
                        </div>
                        {effective != null && delta != null ? (
                          <p className={cn(
                            'text-sm font-medium',
                            delta < 0 ? 'text-emerald-700' : delta > 0 ? 'text-red-600' : 'text-muted-foreground'
                          )}>
                            Selisih: {formatIDR(effective)} ({delta > 0 ? '+' : ''}{delta}%)
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Pakai harga standar</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Belum ada pelanggan dipilih */}
      {!selected && !rowsLoading && (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <BadgePercent className="h-10 w-10 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-medium">Pilih pelanggan terlebih dahulu</p>
          <p className="text-xs text-muted-foreground mt-1">
            Harga khusus hanya berlaku untuk pelanggan yang dipilih.
          </p>
        </div>
      )}

      {/* Bar aksi mengambang */}
      {selected && dirtyEntries.size > 0 && canManage && (
        <div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-xs font-medium flex-1 min-w-0">
              {dirtyEntries.size} perubahan belum disimpan
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground"
              onClick={() => setDrafts(initialDrafts)}
              aria-label="Buang semua perubahan"
              title="Buang perubahan"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] shrink-0"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Simpan Perubahan
            </Button>
          </div>
        </div>
      )}

      {/* AlertDialog buang perubahan saat ganti pelanggan */}
      <AlertDialog open={!!pendingPick} onOpenChange={(o) => { if (!o) setPendingPick(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang perubahan?</AlertDialogTitle>
            <AlertDialogDescription>
              Ada perubahan harga yang belum disimpan. Jika lanjut, perubahan tersebut akan hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={(e) => {
                e.preventDefault()
                const c = pendingPick
                setPendingPick(null)
                if (c) void applyPick(c)
              }}
            >
              Buang &amp; Lanjut
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
