'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { DocumentItem } from '@/lib/types';

interface ItemsFieldsProps {
  items: DocumentItem[];
  onChange: (items: DocumentItem[]) => void;
  showPrice?: boolean;
}

export function ItemsFields({ items, onChange, showPrice = true }: ItemsFieldsProps) {
  const addItem = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        deskripsi: '',
        qty: 1,
        satuan: 'pcs',
        harga: 0,
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Item
        </h3>
        <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs">
          <Plus className="mr-1 h-3 w-3" />
          Tambah
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="relative rounded-lg border bg-muted/30 p-3 space-y-2">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => removeItem(item.id)}
              disabled={items.length <= 1}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <div className="space-y-1">
              <Label className="text-xs">Nama Barang</Label>
              <Textarea
                value={item.deskripsi}
                onChange={(e) => updateItem(item.id, 'deskripsi', e.target.value)}
                placeholder="Nama barang"
                className="text-sm min-h-[80px]"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.qty}
                  onChange={(e) => updateItem(item.id, 'qty', Number(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
              {showPrice && (
                <div className="space-y-1">
                  <Label className="text-xs">Harga</Label>
                  <Input
                    type="number"
                    min={0}
                    value={item.harga}
                    onChange={(e) => updateItem(item.id, 'harga', Number(e.target.value) || 0)}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
