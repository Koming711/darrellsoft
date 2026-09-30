'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, ChevronDown, PackageSearch, PackagePlus, Loader2 } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { toast } from 'sonner';
import type { DocumentItem } from '@/lib/types';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface BarangOption {
  id: string;
  name: string;
  unit: string;
  standardPrice: number;
  hpp: number | null;
  /** Qty dari Master Barang — otomatis mengisi Qty item saat dipilih. */
  qty: number;
}

export interface PaperOption {
  id: string;
  name: string;
  grammage: number | null;
  width: number | null;
  height: number | null;
  pricePerRim: number;
  /** Nama suplier (dari Master Harga Kertas) — ditampilkan agar harga
   *  kertas yang sama antar suplier mudah dibedakan. */
  suplier?: string | null;
}

/** Susun deskripsi item dari data kertas, contoh: "duplek 270gsm 90x120cm". */
export function paperDeskripsi(p: PaperOption): string {
  let s = p.name || '';
  if (p.grammage) s += ` ${p.grammage}gsm`;
  if (p.width && p.height) s += ` ${p.width}x${p.height}cm`;
  return s;
}

interface ItemsFieldsProps {
  items: DocumentItem[];
  onChange: (items: DocumentItem[]) => void;
  showPrice?: boolean;
  showModal?: boolean; // input harga modal per item (snapshot untuk laporan rugi laba)
  /**
   * Mode barang (dipakai Buat Invoice): jika disediakan, kotak Nama Barang
   * menjadi kotak besar yang BISA diketik manual, dilengkapi tombol dropdown
   * berisi daftar barang milik customer terpilih (dari Master Barang per
   * pelanggan). Memilih dari dropdown otomatis mengisi Nama Barang, Qty (dari
   * master), Satuan, Harga Satuan & Harga Modal.
   */
  barangOptions?: BarangOption[];
  /** Pesan saat daftar barang kosong untuk customer terpilih. */
  emptyBarangMessage?: string;
  /** Dipanggil saat user memilih barang dari dropdown untuk item ke-N. */
  onPickBarang?: (itemIndex: number, barang: BarangOption) => void;
  /**
   * Tambah barang BARU ke Master Barang dari halaman Buat Invoice (tombol
   * "Tambah Barang" di header Item → popup tambah barang). Barang otomatis
   * terdaftar untuk customer terpilih (API /api/items + customerId).
   * Return BarangOption yang berhasil dibuat, atau null jika gagal.
   * Jika TIDAK disediakan (customer belum dipilih), klik tombol hanya
   * menampilkan toast "Pilih customer terlebih dahulu".
   */
  onCreateBarang?: (input: { name: string; unit: string; standardPrice: number; hpp: number; qty: number }) => Promise<BarangOption | null>;
  /** Catatan kecil di popup tambah barang, mis. "Barang akan terdaftar untuk customer: Budi". */
  createBarangNote?: string;
  /**
   * Mode kertas (dipakai Buat Purchase Order): jika disediakan, kotak Nama
   * Barang menjadi kotak besar yang BISA diketik manual, dilengkapi tombol
   * dropdown berisi daftar kertas dari Master Harga Kertas. Memilih dari
   * dropdown otomatis mengisi Nama Barang ("duplek 270gsm 90x120cm"),
   * Satuan ("lembar") & Harga/Lembar (harga per rim ÷ 500).
   */
  paperOptions?: PaperOption[];
  /**
   * Kunci Harga Satuan & Harga Modal (read-only) — permintaan owner: harga
   * hanya boleh diubah di Master Barang, tidak di halaman Buat Invoice.
   */
  lockPrices?: boolean;
}

export function ItemsFields({
  items,
  onChange,
  showPrice = true,
  showModal = false,
  barangOptions,
  emptyBarangMessage = 'Belum ada barang untuk customer ini',
  onPickBarang,
  onCreateBarang,
  createBarangNote,
  lockPrices = false,
  paperOptions,
}: ItemsFieldsProps) {
  const [openBarangIndex, setOpenBarangIndex] = useState<number | null>(null);
  const [openPaperIndex, setOpenPaperIndex] = useState<number | null>(null);
  // Popup "Tambah Barang" (Master Barang) — mode barang / Buat Invoice.
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('pcs');
  const [newQty, setNewQty] = useState('');
  const [newHarga, setNewHarga] = useState('');
  const [newHpp, setNewHpp] = useState('');
  const isBarangMode = Array.isArray(barangOptions);
  const isPaperMode = Array.isArray(paperOptions);

  const addItem = () => {
    const newIndex = items.length;
    onChange([
      ...items,
      {
        id: generateId(),
        deskripsi: '',
        qty: 1,
        satuan: 'pcs',
        harga: 0,
        ...(showModal ? { modal: 0 } : {}),
      },
    ]);
    // Klik Tambah → dropdown pilihan langsung terbuka di baris baru, jadi
    // daftar barang dari Master Barang per customer (mode Buat Invoice) atau
    // daftar kertas Master Harga Kertas (mode Buat PO) LANGSUNG tampil tanpa
    // perlu klik tombol chevron lagi.
    if (isBarangMode) setOpenBarangIndex(newIndex);
    if (isPaperMode) setOpenPaperIndex(newIndex);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    onChange(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof DocumentItem, value: string | number) => {
    onChange(
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const pickBarang = (index: number, barang: BarangOption) => {
    setOpenBarangIndex(null);
    if (onPickBarang) {
      onPickBarang(index, barang);
      return;
    }
    // Fallback tanpa onPickBarang: isi langsung (Qty ikut dari master bila > 0)
    onChange(
      items.map((item, i) =>
        i === index
          ? {
              ...item,
              deskripsi: barang.name,
              satuan: barang.unit || item.satuan || 'pcs',
              qty: barang.qty > 0 ? barang.qty : item.qty,
              harga: barang.standardPrice || 0,
              ...(showModal ? { modal: barang.hpp ?? 0 } : {}),
            }
          : item
      )
    );
  };

  const pickPaper = (index: number, paper: PaperOption) => {
    setOpenPaperIndex(null);
    // Nama barang ikut format kertas: "duplek 270gsm 90x120cm".
    // Permintaan owner: di kotak item Buat PO, harga satuan = HARGA PER LEMBAR
    // (harga per rim ÷ 500) & satuan "lembar" — konsisten dengan alur
    // referensi Potong Kertas yang juga memakai harga per lembar.
    // Qty tidak diubah.
    onChange(
      items.map((item, i) =>
        i === index
          ? {
              ...item,
              deskripsi: paperDeskripsi(paper),
              satuan: 'lembar',
              harga: Math.round((paper.pricePerRim || 0) / 500),
            }
          : item
      )
    );
  };

  // Disable Tambah if no item has meaningful data yet
  const hasAnyData = items.some((item) => item.deskripsi.trim() !== '' || (showPrice && item.harga > 0));

  // ===== Popup "Tambah Barang" (Master Barang, mode Buat Invoice) =====
  const parseNominal = (s: string) => {
    const raw = s.replace(/\./g, '').replace(/,/g, '').trim();
    return raw === '' ? 0 : (Number(raw) || 0);
  };

  const resetNewBarangForm = () => {
    setNewName('');
    setNewUnit('pcs');
    setNewQty('');
    setNewHarga('');
    setNewHpp('');
  };

  const openAddBarang = () => {
    if (!onCreateBarang) {
      toast.error('Pilih customer terlebih dahulu');
      return;
    }
    resetNewBarangForm();
    setAddOpen(true);
  };

  const submitNewBarang = async () => {
    if (!onCreateBarang || creating) return;
    const name = newName.trim();
    if (!name) {
      toast.error('Nama barang wajib diisi');
      return;
    }
    setCreating(true);
    const created = await onCreateBarang({
      name,
      unit: newUnit.trim() || 'pcs',
      standardPrice: parseNominal(newHarga),
      hpp: parseNominal(newHpp),
      qty: parseNominal(newQty),
    });
    setCreating(false);
    if (created) {
      toast.success(`"${name}" ditambahkan ke Master Barang`);
      setAddOpen(false);
      resetNewBarangForm();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Item
        </h3>
        <div className="flex items-center gap-1.5">
          {isBarangMode && (
            /* Tombol Tambah Master Barang (Buat Invoice) — buka popup
               tambah barang; barang otomatis terdaftar utk customer terpilih
               dan LANGSUNG muncul di dropdown nama barang. */
            <Button variant="outline" size="sm" onClick={openAddBarang} className="h-7 text-xs">
              <PackagePlus className="mr-1 h-3 w-3" />
              Tambah Barang
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs" disabled={!hasAnyData}>
            <Plus className="mr-1 h-3 w-3" />
            Tambah
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="relative rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-400 mt-1 shrink-0">#{index + 1}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => removeItem(item.id)}
                disabled={items.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nama Barang</Label>
              {isPaperMode ? (
                /* MODE KERTAS (Buat Purchase Order) — kotak besar & bisa
                   diketik manual, plus tombol dropdown berisi daftar kertas
                   dari Master Harga Kertas (auto-isi nama "duplek 270gsm
                   90x120cm", satuan lembar & harga per lembar). */
                <Popover
                  open={openPaperIndex === index}
                  onOpenChange={(open) => setOpenPaperIndex(open ? index : null)}
                >
                  <PopoverAnchor asChild>
                    <div className="relative">
                      <Textarea
                        value={item.deskripsi}
                        onChange={(e) => updateItem(item.id, 'deskripsi', e.target.value)}
                        placeholder="Ketik nama barang atau pilih lewat tombol dropdown"
                        className="text-sm min-h-[84px] pr-11"
                        rows={3}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenPaperIndex(openPaperIndex === index ? null : index)}
                        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-input bg-slate-50 shadow-xs outline-none cursor-pointer transition-colors hover:bg-slate-100 ${openPaperIndex === index ? 'text-slate-700' : 'text-slate-400'}`}
                        aria-label="Pilih barang dari daftar"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${openPaperIndex === index ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    align="start"
                    className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    {paperOptions!.length > 0 ? (
                      <div>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">
                          Master Harga Kertas
                        </div>
                        {paperOptions!.map((p) => {
                          const detailParts: string[] = [];
                          if (p.grammage) detailParts.push(`${p.grammage} gsm`);
                          if (p.width && p.height) detailParts.push(`${p.width} × ${p.height} cm`);
                          detailParts.push(`Harga/Lembar ${formatRupiah(p.pricePerRim / 500)}`);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); pickPaper(index, p); }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${item.deskripsi === paperDeskripsi(p) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                            >
                              <span className="block truncate">
                                {p.name}
                                {p.suplier && (
                                  <span className="text-[11px] text-slate-400 ml-1.5">· {p.suplier}</span>
                                )}
                              </span>
                              <span className="block text-[11px] text-slate-400">{detailParts.join(' · ')}</span>
                              {showPrice && (
                                <span className="block text-[11px] text-slate-400">{formatRupiah(p.pricePerRim)} / rim</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-sm text-slate-400 text-center flex flex-col items-center gap-1.5">
                        <PackageSearch className="w-5 h-5 text-slate-300" />
                        Belum ada data kertas di Master Harga Kertas
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              ) : isBarangMode ? (
                /* MODE BARANG (Buat Invoice) — kotak besar & bisa diketik
                   manual, plus tombol dropdown untuk memilih barang milik
                   customer (auto-isi nama, qty dari master, satuan, harga
                   satuan & modal). */
                <Popover
                  open={openBarangIndex === index}
                  onOpenChange={(open) => setOpenBarangIndex(open ? index : null)}
                >
                  <PopoverAnchor asChild>
                    <div className="relative">
                      <Textarea
                        value={item.deskripsi}
                        onChange={(e) => updateItem(item.id, 'deskripsi', e.target.value)}
                        placeholder="Ketik nama barang atau pilih lewat tombol dropdown"
                        className="text-sm min-h-[84px] pr-11"
                        rows={3}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenBarangIndex(openBarangIndex === index ? null : index)}
                        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-input bg-slate-50 shadow-xs outline-none cursor-pointer transition-colors hover:bg-slate-100 ${openBarangIndex === index ? 'text-slate-700' : 'text-slate-400'}`}
                        aria-label="Pilih barang dari daftar customer"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${openBarangIndex === index ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    align="start"
                    className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    {barangOptions!.length > 0 ? (
                      <div>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">
                          Master Barang Customer
                        </div>
                        {barangOptions!.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); pickBarang(index, b); }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${item.deskripsi === b.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                          >
                            <span className="block truncate">{b.name}</span>
                            {showPrice && (
                              <span className="block text-[11px] text-slate-400">
                                {formatRupiah(b.standardPrice)} / {b.unit || 'pcs'}
                                {b.qty > 0 ? ` · ${b.qty.toLocaleString('id-ID')} ${b.unit || 'pcs'}` : ''}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-sm text-slate-400 text-center flex flex-col items-center gap-1.5">
                        <PackageSearch className="w-5 h-5 text-slate-300" />
                        {emptyBarangMessage}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              ) : (
                <Textarea
                  value={item.deskripsi}
                  onChange={(e) => updateItem(item.id, 'deskripsi', e.target.value)}
                  placeholder="Nama barang"
                  className="text-sm min-h-[60px]"
                  rows={2}
                />
              )}
            </div>
            <div className={`grid gap-2 ${showPrice ? (showModal ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3') : 'grid-cols-1'}`}>
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={item.qty ? item.qty.toLocaleString('id-ID') : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                    updateItem(item.id, 'qty', raw === '' ? 0 : Number(raw) || 0)
                  }}
                  className="text-sm"
                />
              </div>
              {showPrice && (
                <div className="space-y-1">
                  {/* Mode kertas (PO): label "Harga/Lembar" — harga satuan diisi
                      harga per lembar saat memilih kertas dari dropdown. */}
                  <Label className="text-xs">{isPaperMode ? 'Harga/Lembar' : 'Harga Satuan'}</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    readOnly={lockPrices}
                    title={lockPrices ? 'Harga hanya bisa diubah di Master Barang' : undefined}
                    value={item.harga ? item.harga.toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      if (lockPrices) return
                      const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                      updateItem(item.id, 'harga', raw === '' ? 0 : Number(raw) || 0)
                    }}
                    className={`text-sm ${lockPrices ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                </div>
              )}
              {showPrice && showModal && (
                <div className="space-y-1">
                  <Label className="text-xs">Harga Modal</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    readOnly={lockPrices}
                    title={lockPrices ? 'Harga hanya bisa diubah di Master Barang' : undefined}
                    value={item.modal ? item.modal.toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      if (lockPrices) return
                      const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                      updateItem(item.id, 'modal', raw === '' ? 0 : Number(raw) || 0)
                    }}
                    className={`text-sm ${lockPrices ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                </div>
              )}
              {showPrice && (
                <div className="space-y-1">
                  <Label className="text-xs">Total Harga</Label>
                  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-medium text-emerald-700">
                    {(item.qty * item.harga).toLocaleString('id-ID')}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Popup "Tambah Barang" (mode barang / Buat Invoice) — tombol header
          Item. Barang baru otomatis terdaftar utk customer terpilih (lewat
          onCreateBarang → POST /api/items + customerId) sehingga LANGSUNG
          bisa dipilih di dropdown nama barang. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-3">
            <DialogTitle className="text-base">Tambah Master Barang</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 space-y-2.5">
            {createBarangNote && (
              <p className="rounded-md bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-700">{createBarangNote}</p>
            )}
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nama barang *"
              className="h-9 text-sm"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="Satuan (pcs)"
                className="h-9 text-sm"
              />
              <Input
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                placeholder="Qty stok"
                inputMode="numeric"
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={newHarga}
                onChange={(e) => setNewHarga(e.target.value)}
                placeholder="Harga jual (Rp)"
                inputMode="numeric"
                className="h-9 text-sm"
              />
              <Input
                value={newHpp}
                onChange={(e) => setNewHpp(e.target.value)}
                placeholder="Harga modal (Rp)"
                inputMode="numeric"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setAddOpen(false)} disabled={creating}>
                Batal
              </Button>
              <Button className="flex-1" disabled={creating || !newName.trim()} onClick={submitNewBarang}>
                {creating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Tambahkan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
