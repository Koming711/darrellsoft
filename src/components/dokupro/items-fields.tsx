'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Plus, Trash2, ChevronDown, PackageSearch, PackagePlus } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { BarangFormDialog, type BarangCustomerOption, type BarangFormSavedItem, type BarangPickOption } from '@/components/views/barang-form-dialog';
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
  /** Harga khusus customer yang aktif & berlaku (dari BarangCustomer) — null = tidak ada. */
  customerPrice?: number | null;
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
   * Tombol "Tambah Barang" (header Item, Buat Invoice) membuka popup
   * BarangFormDialog — SAMA PERSIS dengan popup Tambah/Edit di halaman
   * Master Barang (foto, Untuk Pelanggan, satuan select, qty, harga jual*,
   * modal + profit, keterangan). Daftar pelanggan untuk select popup.
   */
  barangFormCustomers?: BarangCustomerOption[];
  /** 'all' = bebas pilih pelanggan di popup; id spesifik = select terkunci mengikuti customer invoice. */
  barangFormCustomerFilter?: string;
  /** Teks bantuan select pelanggan terkunci di popup (default = teks Master Barang). */
  barangFormLockedNote?: string;
  /** Daftar LENGKAP barang master utk dropdown "Nama Barang" di popup —
   *  perilaku SAMA dengan popup di halaman Harga Customer: pilih barang
   *  existing → simpan = daftarkan harga khusus customer; opsi
   *  "+ Barang baru" → membuat barang baru. Kosong/tidak diisi → Nama
   *  Barang input teks bebas (perilaku lama, dipakai PO & Surat Jalan). */
  barangFormBarangOptions?: BarangPickOption[];
  /** "Untuk Pelanggan" di ATAS "Nama Barang" di popup (gaya halaman Harga
   *  Customer — pelanggan dikenali dulu sebelum memilih barang). Default
   *  false = posisi lama setelah Foto Barang. */
  barangFormCustomerFieldFirst?: boolean;
  /** Dipanggil setelah barang berhasil disimpan dari popup (untuk memperbarui daftar dropdown). */
  onBarangCreated?: (item: BarangFormSavedItem | null, customerId: string) => void;
  /**
   * Mode kertas (dipakai Buat Purchase Order): jika disediakan, kotak Nama
   * Barang menjadi kotak besar yang BISA diketik manual, dilengkapi tombol
   * dropdown berisi daftar kertas dari Master Harga Kertas. Memilih dari
   * dropdown otomatis mengisi Nama Barang ("duplek 270gsm 90x120cm"),
   * Satuan ("lembar") & Harga/Lembar (harga per rim ÷ 500).
   */
  paperOptions?: PaperOption[];
  /** Pesan saat daftar kertas kosong (mode PO) — mis. saat difilter per suplier. */
  emptyPaperMessage?: string;
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
  barangFormCustomers,
  barangFormCustomerFilter,
  barangFormLockedNote,
  barangFormBarangOptions,
  barangFormCustomerFieldFirst = false,
  onBarangCreated,
  lockPrices = false,
  paperOptions,
  emptyPaperMessage = 'Belum ada data kertas di Master Bahan',
}: ItemsFieldsProps) {
  const [openBarangIndex, setOpenBarangIndex] = useState<number | null>(null);
  const [openPaperIndex, setOpenPaperIndex] = useState<number | null>(null);
  // Popup "Tambah Barang" (BarangFormDialog — sama persis dgn Master Barang):
  // dibuka dari tombol header Item.
  const [addOpen, setAddOpen] = useState(false);
  // Popup Daftar Barang DI BAWAH TOMBOL TAMBAH (mode barang / Buat Invoice):
  // klik Tambah → baris baru ditambahkan & popup daftar barang LANGSUNG
  // muncul tepat di bawah tombol Tambah (permintaan owner), bukan menempel
  // di baris baru yang posisinya jauh di bawah saat baris sudah banyak.
  const [tambahPopupOpen, setTambahPopupOpen] = useState(false);
  const isBarangMode = Array.isArray(barangOptions);
  const isPaperMode = Array.isArray(paperOptions);
  // Tombol "Tambah Barang" SELALU aktif — klik langsung memunculkan popup,
  // SAMA seperti tombol "Tambah Barang" di halaman Harga Customer (permintaan
  // owner). Saat customer invoice belum dikenali (filter 'all'), select
  // "Untuk Pelanggan" di popup bebas dipilih; saat sudah dikenali, select
  // terkunci mengikuti customer invoice.

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
    // Klik Tambah → mode kertas (Buat PO): dropdown pilihan kertas langsung
    // terbuka di baris baru. Mode barang (Buat Invoice): popup Daftar Barang
    // muncul DI BAWAH TOMBOL TAMBAH (permintaan owner) — barang yang dipilih
    // di popup mengisi baris yang baru ditambahkan (baris paling akhir).
    if (isBarangMode) {
      setOpenBarangIndex(null);
      setTambahPopupOpen(true);
    }
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
    // Nama barang BISA dipakai berkali-kali di baris berbeda (permintaan
    // owner) — tidak ada pembatasan duplikat; pilihan selalu diterima.
    setOpenBarangIndex(null);
    setTambahPopupOpen(false);
    if (onPickBarang) {
      onPickBarang(index, barang);
      return;
    }
    // Fallback tanpa onPickBarang: isi langsung (Qty ikut dari master bila > 0).
    // HARGA CUSTOMER: harga khusus aktif & berlaku prioritas di atas harga standar.
    onChange(
      items.map((item, i) =>
        i === index
          ? {
              ...item,
              deskripsi: barang.name,
              satuan: barang.unit || item.satuan || 'pcs',
              qty: barang.qty > 0 ? barang.qty : item.qty,
              harga: (barang.customerPrice ?? barang.standardPrice) || 0,
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

  // Daftar pilihan barang (mode barang / Buat Invoice) — dipakai dua popup
  // sekaligus: (1) popup DI BAWAH TOMBOL TAMBAH (target = baris paling
  // akhir, yaitu baris yang baru ditambahkan klik Tambah) dan (2) dropdown
  // chevron di tiap baris (target = baris tsb).
  const renderBarangPilihan = (targetIndex: number) => {
    if (!barangOptions || barangOptions.length === 0) {
      return (
        <div className="px-3 py-4 text-sm text-slate-400 text-center flex flex-col items-center gap-1.5">
          <PackageSearch className="w-5 h-5 text-slate-300" />
          {emptyBarangMessage}
        </div>
      );
    }
    const target = items[targetIndex];
    return (
      <div>
        <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">
          Daftar Barang
        </div>
        {barangOptions.map((b) => (
          <button
            key={b.id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); pickBarang(targetIndex, b); }}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${target?.deskripsi === b.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
          >
            <span className="block truncate">
              {b.name}
            </span>
            {showPrice && (
              <span className="block text-[11px] text-slate-400">
                {/* Harga EFEKTIF: khusus customer bila ada & berlaku,
                    selain itu harga standar Master Produk. */}
                {formatRupiah(b.customerPrice ?? b.standardPrice)} / {b.unit || 'pcs'}
                {b.customerPrice != null && b.customerPrice !== b.standardPrice && (
                  <span className="text-emerald-600 font-medium"> · harga khusus</span>
                )}
                {b.qty > 0 ? ` · ${b.qty.toLocaleString('id-ID')} ${b.unit || 'pcs'}` : ''}
              </span>
            )}
          </button>
        ))}
      </div>
    );
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
               BarangFormDialog SAMA PERSIS dengan popup Tambah Barang di
               halaman Harga Customer; SELALU bisa diklik (popup langsung
               muncul, tidak lagi menunggu customer dipilih). Barang baru
               otomatis masuk daftar dropdown nama barang setelah disimpan. */
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-7 text-xs"
            >
              <PackagePlus className="mr-1 h-3 w-3" />
              Tambah Barang
            </Button>
          )}
          {isBarangMode ? (
            /* Tombol Tambah (Buat Invoice) — klik = tambah baris baru & popup
               Daftar Barang LANGSUNG muncul DI BAWAH TOMBOL TAMBAH (permintaan
               owner), bukan menempel di baris baru yang jauh di bawah.
               Memilih barang di popup mengisi baris yang baru ditambahkan
               (baris paling akhir). */
            <Popover open={tambahPopupOpen} onOpenChange={setTambahPopupOpen}>
              <PopoverAnchor asChild>
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs" disabled={!hasAnyData}>
                  <Plus className="mr-1 h-3 w-3" />
                  Tambah
                </Button>
              </PopoverAnchor>
              <PopoverContent
                align="end"
                className="p-0 w-72 max-h-60 overflow-y-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {renderBarangPilihan(items.length - 1)}
              </PopoverContent>
            </Popover>
          ) : (
            <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs" disabled={!hasAnyData}>
              <Plus className="mr-1 h-3 w-3" />
              Tambah
            </Button>
          )}
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
                          Master Bahan
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
                        {emptyPaperMessage}
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
                        onClick={() => {
                          setTambahPopupOpen(false);
                          setOpenBarangIndex(openBarangIndex === index ? null : index);
                        }}
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
                    {renderBarangPilihan(index)}
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

      {/* Popup "Tambah Barang" (mode barang / Buat Invoice) — komponen
          bersama BarangFormDialog: isi & perilaku SAMA PERSIS dengan popup
          Tambah/Edit di halaman Master Barang. Barang yang disimpan untuk
          customer terpilih langsung masuk daftar dropdown nama barang
          (lewat onBarangCreated). */}
      <BarangFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        customers={barangFormCustomers}
        customerFilter={barangFormCustomerFilter}
        lockedCustomerNote={barangFormLockedNote}
        barangOptions={barangFormBarangOptions}
        customerFieldFirst={barangFormCustomerFieldFirst}
        onSaved={onBarangCreated}
      />
    </div>
  );
}
