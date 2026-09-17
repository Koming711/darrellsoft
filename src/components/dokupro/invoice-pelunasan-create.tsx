'use client';

/**
 * Alur PELUNASAN — diporting dari workspace referensi
 * (src/components/views/invoice-create.tsx, mode PELUNASAN) dan diadaptasi
 * ke lapisan data aplikasi ini (DocumentHistory + InvoiceData).
 *
 * Sistem dari file referensi:
 * - Pilih invoice DP yang belum lunas (combobox, bisa dicari, tampil sisa)
 * - Rekap pembayaran: Pelanggan / Total Pesanan / Total DP / Sudah
 *   Dipelunasi / Sisa Tagihan
 * - Nominal pelunasan otomatis terisi sisa tagihan (bayar parsial boleh)
 * - Badge Lunas / Bayar Sebagian
 *
 * Adaptasi ke aplikasi ini:
 * - Sumber data: DocumentHistory docType "invoice" (dp > 0, belum lunas)
 * - Simpan: satu dokumen "invoice-pelunasan" tertaut (PEL/<nomor>) —
 *   PUT bila sudah ada, POST bila belum (konvensi syncLinkedPelunasan)
 * - paidAmount terakumulasi pada parent & dok pelunasan (bayar bertahap)
 * - Setelah simpan → halaman Pratinjau Invoice (label PELUNASAN + Ref.)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { InvoicePreview } from './invoice-preview';
import { formatIDR } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { InvoiceData } from '@/lib/types';
import { DEFAULT_COMPANY } from '@/lib/types';
import { captureElementAsJpg } from '@/lib/capture-jpg';
import { shareJpgToWhatsApp } from '@/lib/share-jpg';
import { Printer, ImageIcon } from 'lucide-react';

interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Parse dataJson → info ringkas (selaras parseDocInfo halaman invoice) ---
function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson) as Record<string, unknown>;
    const items = (parsed.items as Array<{ qty: number; harga: number }> | undefined) || [];
    const subtotal = items.reduce((sum, it) => sum + (it.qty || 0) * (it.harga || 0), 0);
    const ppn = (parsed.ppn as number) || 0;
    const disc = (parsed.discount as number) || 0;
    const base = Math.max(0, subtotal - disc);
    const totalHarga = base + (base * ppn) / 100;
    const dpPercent = (parsed.dp as number) || 0;
    const originalTotal = (parsed.originalTotal as number) !== undefined ? (parsed.originalTotal as number) : totalHarga;
    const dpAmount =
      typeof parsed.dpAmount === 'number' ? parsed.dpAmount : originalTotal * (dpPercent / 100);
    const paidSoFar = (parsed.paidAmount as number) || 0;
    const sisa = Math.max(0, totalHarga - dpAmount - paidSoFar);
    const lunas = parsed.lunas === true;
    return {
      clientNama: ((parsed.client as { nama?: string } | undefined)?.nama) || entry.pihakKedua || '',
      totalHarga,
      dpPercent,
      dpAmount,
      paidSoFar,
      sisa,
      lunas,
    };
  } catch {
    return { clientNama: '', totalHarga: 0, dpPercent: 0, dpAmount: 0, paidSoFar: 0, sisa: 0, lunas: false };
  }
}

// --- Parse dataJson → InvoiceData (selaras parseInvoiceData halaman invoice) ---
function parseInvoiceData(entry: HistoryEntry): InvoiceData {
  try {
    const parsed = JSON.parse(entry.dataJson);
    const company = {
      nama: parsed.company?.nama || DEFAULT_COMPANY.nama,
      telepon: parsed.company?.telepon || DEFAULT_COMPANY.telepon,
      alamat: parsed.company?.alamat || DEFAULT_COMPANY.alamat,
      email: parsed.company?.email || DEFAULT_COMPANY.email,
      npwp: parsed.company?.npwp || '',
      website: parsed.company?.website || '',
      ppn: parsed.company?.ppn ?? parsed.ppn ?? 11,
      logo: parsed.company?.logo || '',
      bankName: parsed.company?.bankName || '',
      bankAccount: parsed.company?.bankAccount || '',
      bankHolder: parsed.company?.bankHolder || '',
      bankName2: parsed.company?.bankName2 || '',
      bankAccount2: parsed.company?.bankAccount2 || '',
      bankHolder2: parsed.company?.bankHolder2 || '',
    };
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }));
    return {
      type: 'invoice',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      client: parsed.client || { nama: '', kontak: '', alamat: '' },
      items,
      ppn: parsed.ppn ?? 11,
      dp: parsed.dp || 0,
      dpAmount: parsed.dpAmount,
      paidAmount: parsed.paidAmount,
      discount: parsed.discount,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
      lunas: parsed.lunas === true,
      tanggalPelunasan: parsed.tanggalPelunasan || '',
      referensiInvoiceId: parsed.referensiInvoiceId || '',
      referensiInvoiceNomor: parsed.referensiInvoiceNomor || '',
      originalTotal: parsed.originalTotal,
      uangCapek: parsed.uangCapek || 0,
    };
  } catch {
    return {
      type: 'invoice',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      client: { nama: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      dp: 0,
      catatan: '',
      tanggalJatuhTempo: '',
      caraPembayaran: '',
      tanggalGiro: '',
      lunas: false,
      tanggalPelunasan: '',
      referensiInvoiceId: '',
      referensiInvoiceNomor: '',
      uangCapek: 0,
    };
  }
}

export function InvoicePelunasanCreate() {
  const [dpOptions, setDpOptions] = useState<HistoryEntry[]>([])
  const [dpOptionsLoading, setDpOptionsLoading] = useState(true)
  const [dpPickOpen, setDpPickOpen] = useState(false)
  const [selectedDp, setSelectedDp] = useState<HistoryEntry | null>(null)
  const [paidInput, setPaidInput] = useState('')
  const [plDueDate, setPlDueDate] = useState('')
  const [plNotes, setPlNotes] = useState('')
  const [saving, setSaving] = useState(false)
  // Pratinjau setelah simpan
  const [showPratinjau, setShowPratinjau] = useState(false)
  const [savedPelData, setSavedPelData] = useState<InvoiceData | null>(null)
  const [generatingJpg, setGeneratingJpg] = useState(false)

  const loadDpOptions = useCallback(async (): Promise<HistoryEntry[]> => {
    setDpOptionsLoading(true)
    try {
      const res = await fetch('/api/history?docType=invoice', { headers: getAuthHeaders(), cache: 'no-store' })
      const json = res.ok ? await res.json() : { data: [] }
      const entries: HistoryEntry[] = json.data || []
      setDpOptions(entries)
      return entries
    } catch {
      toast.error('Gagal memuat daftar invoice DP')
      setDpOptions([])
      return []
    } finally {
      setDpOptionsLoading(false)
    }
  }, [])

  useEffect(() => { void loadDpOptions() }, [loadDpOptions])

  // Hanya invoice DP (dp > 0) yang belum lunas dengan sisa tagihan
  const eligibleDps = useMemo(
    () =>
      dpOptions
        .map((entry) => ({ entry, info: parseDocInfo(entry) }))
        .filter(({ entry, info }) => entry.docType === 'invoice' && info.dpAmount > 0 && !info.lunas && info.sisa > 0),
    [dpOptions]
  )

  const selectedInfo = useMemo(
    () => (selectedDp ? parseDocInfo(selectedDp) : null),
    [selectedDp]
  )

  const paidNum = Number(paidInput) || 0
  const paidInvalid = selectedInfo !== null && paidNum > selectedInfo.sisa + 0.01
  const paidLunas = selectedInfo !== null && paidNum >= selectedInfo.sisa - 0.01

  const selectDpInvoice = (entry: HistoryEntry) => {
    setDpPickOpen(false)
    setSelectedDp(entry)
    const info = parseDocInfo(entry)
    setPaidInput(String(Math.round(info.sisa * 100) / 100))
    setPlDueDate('')
    setPlNotes('')
  }

  const handleSavePelunasan = async () => {
    if (!selectedDp || !selectedInfo) {
      toast.error('Pilih invoice DP terlebih dahulu')
      return
    }
    if (!Number.isFinite(paidNum) || paidNum <= 0) {
      toast.error('Nominal pelunasan harus lebih dari 0')
      return
    }
    if (paidNum > selectedInfo.sisa + 0.01) {
      toast.error('Nominal pelunasan melebihi sisa tagihan')
      return
    }
    setSaving(true)
    try {
      const today = getTodayStr()
      const parentData = parseInvoiceData(selectedDp)
      const paidTotal = Math.round((selectedInfo.paidSoFar + paidNum) * 100) / 100
      const lunas = paidNum >= selectedInfo.sisa - 0.01
      const pelNomor = (selectedDp.nomor || '').replace(/^INV/, 'PEL') || 'PEL'

      const pelunasanData: InvoiceData = {
        ...parentData,
        type: 'invoice-pelunasan',
        nomor: pelNomor,
        tanggal: today,
        lunas,
        tanggalPelunasan: lunas ? today : '',
        tanggalJatuhTempo: plDueDate || parentData.tanggalJatuhTempo,
        catatan: plNotes.trim() || parentData.catatan,
        paidAmount: paidTotal,
        referensiInvoiceId: selectedDp.id,
        referensiInvoiceNomor: selectedDp.nomor,
      }

      // Cari dok pelunasan yang sudah tertaut ke invoice DP ini (PUT, bukan duplikat POST)
      const pelRes = await fetch('/api/history?docType=invoice-pelunasan', { headers: getAuthHeaders(), cache: 'no-store' })
      const pelJson = pelRes.ok ? await pelRes.json() : { data: [] }
      const pelEntries: HistoryEntry[] = pelJson.data || []
      const linked = pelEntries.find((e) => {
        try {
          const p = JSON.parse(e.dataJson)
          return String(p.referensiInvoiceId) === String(selectedDp.id) || p.referensiInvoiceNomor === selectedDp.nomor
        } catch {
          return false
        }
      })

      let pelDocId = linked?.id ?? null
      let needFallbackPut = false
      if (linked) {
        const res = await fetch(`/api/history/${linked.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            nomor: linked.nomor || pelNomor,
            tanggal: today,
            pihakKedua: parentData.client?.nama || '-',
            total: '-',
            dataJson: JSON.stringify(pelunasanData),
          }),
        })
        if (!res.ok) {
          toast.error('Gagal memperbarui pelunasan')
          return
        }
      } else {
        const res = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            docType: 'invoice-pelunasan',
            customNomor: pelNomor,
            tanggal: today,
            pihakKedua: parentData.client?.nama || '-',
            total: '-',
            dataJson: JSON.stringify(pelunasanData),
          }),
        })
        if (res.status === 409) {
          // Konten identik sudah ada — perbarui record lama dengan pembayaran terbaru
          const errData = await res.json().catch(() => ({}))
          if (errData?.id) {
            pelDocId = errData.id
            needFallbackPut = true
          } else {
            toast.error('Data pelunasan sudah ada di riwayat.')
            return
          }
        } else if (res.ok) {
          const saved = await res.json()
          pelDocId = saved.id
        } else {
          toast.error('Gagal menyimpan pelunasan')
          return
        }
      }

      // Bila POST 409: sinkronkan record lama dengan pembayaran terbaru
      if (needFallbackPut && pelDocId) {
        await fetch(`/api/history/${pelDocId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            nomor: pelNomor,
            tanggal: today,
            pihakKedua: parentData.client?.nama || '-',
            total: '-',
            dataJson: JSON.stringify(pelunasanData),
          }),
        })
      }

      // Update parent invoice: akumulasi paidAmount + status lunas
      const parentUpdate: InvoiceData = {
        ...parentData,
        paidAmount: paidTotal,
        lunas: lunas || parentData.lunas === true,
        tanggalPelunasan: lunas ? today : parentData.tanggalPelunasan || '',
      }
      const putRes = await fetch(`/api/history/${selectedDp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          nomor: selectedDp.nomor || '-',
          tanggal: selectedDp.tanggal || parentData.tanggal || '',
          pihakKedua: parentData.client?.nama || '-',
          total: '-',
          dataJson: JSON.stringify(parentUpdate),
        }),
      })
      if (!putRes.ok) {
        toast.error('Pelunasan tersimpan, tetapi gagal memperbarui invoice DP')
      }

      toast.success(`Pelunasan ${pelNomor} tersimpan`)
      window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
      setSavedPelData(pelunasanData)
      setShowPratinjau(true)
    } catch {
      toast.error('Gagal menyimpan pelunasan')
    } finally {
      setSaving(false)
    }
  }

  const backFromPratinjau = async () => {
    setShowPratinjau(false)
    // Muat ulang opsi; pilih ulang parent yang sama agar rekap sisa terbaru
    const entries = await loadDpOptions()
    if (savedPelData?.referensiInvoiceId) {
      const again = entries.find((e) => e.id === savedPelData.referensiInvoiceId)
      if (again) {
        const info = parseDocInfo(again)
        if (!info.lunas && info.sisa > 0) {
          setSelectedDp(again)
          setPaidInput(String(Math.round(info.sisa * 100) / 100))
          return
        }
      }
    }
    setSelectedDp(null)
    setPaidInput('')
    setPlDueDate('')
    setPlNotes('')
  }

  const handleCetak = () => {
    toast.dismiss();
    const origTitle = document.title;
    document.title = ' ';
    setTimeout(() => {
      window.print();
      document.title = origTitle;
    }, 100);
  };

  const handleJpg = async () => {
    if (!savedPelData) return
    setGeneratingJpg(true)
    try {
      const nomor = savedPelData.nomor || 'draft'
      const fileName = `${nomor.replace(/\//g, '-')}.jpg`
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
      if (!previewEl) {
        toast.error('Pratinjau tidak ditemukan')
        return
      }
      const blob = await captureElementAsJpg(previewEl)
      if (!blob || !(blob instanceof Blob)) {
        toast.error('Gagal membuat JPG - blob tidak valid')
        return
      }
      const result = await shareJpgToWhatsApp({
        blob,
        fileName,
        documentLabel: 'Invoice Pelunasan',
        phone: savedPelData.client?.kontak || '',
      })
      if (result.status === 'shared') {
        toast.success('Invoice dibagikan ke WhatsApp')
      } else if (result.status === 'downloaded') {
        toast.success(`${fileName} tersimpan ke perangkat`, {
          description: 'File JPG telah diunduh ke folder Downloads.',
        })
      } else if (result.status !== 'cancelled') {
        toast.error(result.error || 'Gagal memproses JPG')
      }
    } catch {
      toast.error('Gagal membuat JPG. Coba lagi atau gunakan Cetak.')
    } finally {
      setGeneratingJpg(false)
    }
  }

  // ===== HALAMAN PRATINJAU (label PELUNASAN otomatis via data.type) =====
  if (showPratinjau && savedPelData) {
    return (
      <div className="flex flex-col">
        <div className="print:hidden flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void backFromPratinjau()} className="h-9 gap-1.5 text-xs">
            <X className="w-3.5 h-3.5" /> Tutup Pratinjau
          </Button>
          <h2 className="text-sm md:text-base font-bold tracking-tight text-foreground">Pratinjau Pelunasan</h2>
          {savedPelData.nomor && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">{savedPelData.nomor}</span>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button size="sm" onClick={handleCetak} className="bg-emerald-600 hover:bg-emerald-700 h-9">
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Cetak
            </Button>
            <Button size="sm" onClick={() => void handleJpg()} disabled={generatingJpg} className="bg-green-600 hover:bg-green-700 h-9">
              {generatingJpg ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1.5 h-3.5 w-3.5" />}
              {generatingJpg ? 'JPG...' : 'JPG'}
            </Button>
          </div>
        </div>
        <div className="flex items-start justify-center overflow-auto p-4 min-h-0">
          <div data-document-preview>
            <div className="w-fit mx-auto rounded-lg border border-dashed border-stone-400 p-2 print:border-0 print:p-0 print:rounded-none">
              <InvoicePreview data={savedPelData} showPelunasanLabel />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const busy = saving

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Pilih invoice DP */}
      <Card className="p-0 gap-0">
        <CardHeader className="flex-row items-center justify-between px-4 md:px-5 pt-4 pb-3">
          <CardTitle className="text-sm">Invoice DP</CardTitle>
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
                className="w-full justify-between min-h-[44px] font-normal"
              >
                {selectedDp ? (
                  <span className="truncate">
                    {selectedDp.nomor} · {selectedInfo?.clientNama || selectedDp.pihakKedua}{' '}
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      Sisa {formatIDR(selectedInfo?.sisa ?? 0)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Search className="h-4 w-4 opacity-50" /> Pilih invoice DP…
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 max-w-[calc(100vw-2rem)]" align="start">
              <Command>
                <CommandInput placeholder="Cari nomor / pelanggan…" />
                <CommandEmpty>Invoice DP tidak ditemukan.</CommandEmpty>
                <CommandList className="max-h-60 overflow-y-auto">
                  {eligibleDps.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground px-4">
                      {dpOptionsLoading
                        ? 'Memuat daftar invoice DP…'
                        : 'Tidak ada invoice DP dengan sisa tagihan.'}
                    </div>
                  )}
                  {eligibleDps.map(({ entry, info }) => (
                    <CommandItem
                      key={entry.id}
                      value={`${entry.nomor} ${info.clientNama}`}
                      onSelect={() => selectDpInvoice(entry)}
                      className="min-h-[44px]"
                    >
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{entry.nomor}</p>
                          <p className="text-xs text-muted-foreground truncate">{info.clientNama}</p>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                          Sisa {formatIDR(info.sisa)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Hanya invoice DP berstatus Belum Lunas dengan sisa tagihan yang ditampilkan.
          </p>
        </CardContent>
      </Card>

      {dpOptionsLoading && dpOptions.length === 0 ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : selectedDp && selectedInfo ? (
        /* Rekap + input pembayaran */
        <Card className="p-0 gap-0">
          <CardHeader className="px-4 md:px-5 pt-4 pb-3">
            <CardTitle className="text-sm">Rincian Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="px-4 md:px-5 pb-4 space-y-3 text-sm">
            {/* Rekap invoice DP */}
            <div className="rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/60 dark:bg-zinc-900/60 p-3 md:p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Pelanggan</span>
                <span className="font-medium truncate">{selectedInfo.clientNama}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total Pesanan</span>
                <span>{formatIDR(selectedInfo.totalHarga)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total DP</span>
                <span>{formatIDR(selectedInfo.dpAmount)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Sudah Dipelunasi</span>
                <span className="text-emerald-700 dark:text-emerald-400">{formatIDR(selectedInfo.paidSoFar)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">Sisa Tagihan</span>
                <span className="font-bold text-xl text-amber-700 dark:text-amber-400">
                  {formatIDR(selectedInfo.sisa)}
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
                      Bayar Sebagian · sisa {formatIDR(selectedInfo.sisa - paidNum)}
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
                  Nominal tidak boleh melebihi sisa tagihan ({formatIDR(selectedInfo.sisa)}).
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
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Pelunasan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 dark:border-zinc-700 py-10 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Pilih invoice DP di atas untuk mencatat pelunasannya.
          </p>
        </div>
      )}
    </div>
  )
}
