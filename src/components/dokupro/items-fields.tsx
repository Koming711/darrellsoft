'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Plus, Trash2, ChevronDown, PackageSearch } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
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
  lockPrices = false,
}: ItemsFieldsProps) {
  const [openBarangIndex, setOpenBarangIndex] = useState<number | null>(null);
  const isBarangMode = Array.isArray(barangOptions);

  const addItem = () => {
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

  // Disable Tambah if no item has meaningful data yet
  const hasAnyData = items.some((item) => item.deskripsi.trim() !== '' || (showPrice && item.harga > 0));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Item
        </h3>
        <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs" disabled={!hasAnyData}>
          <Plus className="mr-1 h-3 w-3" />
          Tambah
        </Button>
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
              {isBarangMode ? (
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
                  <Label className="text-xs">Harga Satuan</Label>
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
    </div>
  );
}
