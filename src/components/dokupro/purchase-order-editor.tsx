'use client';

import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDokuproStore } from '@/lib/store';
import { CompanyFields } from './company-fields';
import { ItemsFields } from './items-fields';
import { PurchaseOrderPreview } from './purchase-order-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { HistoryTable } from './history-table';
import { DocumentActionButtons } from './document-action-buttons';
import { formatRupiah } from '@/lib/format';
import type { PurchaseOrderData } from '@/lib/types';

export function PurchaseOrderEditor() {
  const po = useDokuproStore((s) => s.purchaseOrder);
  const setPurchaseOrder = useDokuproStore((s) => s.setPurchaseOrder);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);

  useEffect(() => { loadCompanyFromAPI() }, [loadCompanyFromAPI]);

  const updateCompany = (company: typeof po.company) => {
    setPurchaseOrder({ ...po, company });
  };

  const updatePemasok = (field: string, value: string) => {
    setPurchaseOrder({
      ...po,
      pemasok: { ...po.pemasok, [field]: value },
    });
  };

  const subtotal = po.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (po.ppn / 100);
  const total = subtotal + ppnAmount;

  const handleLoad = (data: unknown) => {
    setPurchaseOrder(data as PurchaseOrderData);
  };

  return (
    <>
      <DocumentEditorLayout
        title="Purchase Order"
        previewContent={<PurchaseOrderPreview data={po} />}
        actions={
          <DocumentActionButtons
            docType="purchase-order"
            documentLabel="Purchase Order"
            currentData={po}
            onReset={() => resetDocument('purchase-order')}
          />
        }
      >
        <CompanyFields company={po.company} onChange={updateCompany} />

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">No. Purchase Order</Label>
              <Input
                value={po.nomor}
                onChange={(e) => setPurchaseOrder({ ...po, nomor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={po.tanggal}
                onChange={(e) => setPurchaseOrder({ ...po, tanggal: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Referensi (opsional)</Label>
            <Input
              value={po.referensi}
              onChange={(e) => setPurchaseOrder({ ...po, referensi: e.target.value })}
              placeholder="Referensi lain"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Pemasok
          </h3>
          <div className="space-y-2">
            <Label className="text-xs">Nama</Label>
            <Input
              value={po.pemasok.nama}
              onChange={(e) => updatePemasok('nama', e.target.value)}
              placeholder="Nama pemasok / perusahaan"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Kontak</Label>
            <Input
              value={po.pemasok.kontak}
              onChange={(e) => updatePemasok('kontak', e.target.value)}
              placeholder="No. telepon / email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={po.pemasok.alamat}
              onChange={(e) => updatePemasok('alamat', e.target.value)}
              placeholder="Alamat pemasok"
            />
          </div>
        </div>

        <ItemsFields
          items={po.items}
          onChange={(items) => setPurchaseOrder({ ...po, items })}
          showPrice
        />

        <div className="space-y-2">
          <Label className="text-xs">PPN (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={po.ppn}
            onChange={(e) => setPurchaseOrder({ ...po, ppn: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            Total: <span className="font-bold">{formatRupiah(total)}</span>
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Catatan
          </h3>
          <Textarea
            value={po.catatan}
            onChange={(e) => setPurchaseOrder({ ...po, catatan: e.target.value })}
            placeholder="Catatan tambahan..."
            rows={3}
          />
        </div>
      </DocumentEditorLayout>

      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <HistoryTable
          docType="purchase-order"
          documentLabel="Purchase Order"
          onLoad={handleLoad}
        />
      </div>
    </>
  );
}
