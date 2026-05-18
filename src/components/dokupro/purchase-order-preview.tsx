'use client';

import type { PurchaseOrderData } from '@/lib/types';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';

interface PurchaseOrderPreviewProps {
  data: PurchaseOrderData;
}

const MAX_ROWS = 10;

export function PurchaseOrderPreview({ data }: PurchaseOrderPreviewProps) {
  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (data.ppn / 100);
  const total = subtotal + ppnAmount;
  const companyInitial = (data.company.nama || 'C').charAt(0).toUpperCase();

  const rows = [...data.items];
  while (rows.length < MAX_ROWS) {
    rows.push({ id: `empty-${rows.length}`, deskripsi: '', qty: 0, satuan: '', harga: 0 });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6 print:shadow-none print:border-0 print:p-0 print:text-[10px] print:mb-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 print:mb-[1.5mm]">
        <div className="flex items-start gap-3">
          <div
            className="print-logo-box flex h-12 w-12 shrink-0 items-center justify-center rounded font-bold text-lg print:h-9 print:w-9 print:text-[14px]"
            style={{ backgroundColor: data.company.logo ? 'transparent' : '#000000' }}
          >
            {data.company.logo ? (
              <img
                src={data.company.logo}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-white">{companyInitial}</span>
            )}
          </div>
          <div className="company-info">
            <p className="company-name text-[17px] font-bold print:text-[17px] text-black">
              {data.company.nama || 'Nama Perusahaan'}
            </p>
            <p className="text-[12px] print:text-[12px] text-neutral-600">{data.company.alamat}</p>
            <div className="flex gap-4 text-[12px] print:text-[12px] text-neutral-600">
              <span>{data.company.telepon}</span>
              <span>{data.company.email}</span>
            </div>
            {(data.company.bankName || data.company.bankName2) && (
              <div className="text-[10px] print:text-[9px] text-neutral-600 mt-0.5">
                {data.company.bankName && (
                  <span>{data.company.bankName} {data.company.bankAccount} a.n. {data.company.bankHolder}</span>
                )}
                {data.company.bankName2 && (
                  <span className="ml-3">{data.company.bankName2} {data.company.bankAccount2} a.n. {data.company.bankHolder2}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold print:text-[13px] text-black">PURCHASE ORDER</h2>
          <p className="text-[10px] font-medium uppercase tracking-wider print:text-[8px] text-neutral-600">
            Pesanan Pembelian
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="print-divider mb-3 print:mb-[1mm]" style={{ borderBottom: '2px solid #000000' }} />

      {/* Pemasok */}
      <div className="mb-3 print:mb-[1mm] grid grid-cols-2 gap-3 print:gap-1.5">
        <div className="doc-recipient">
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5 print:text-[8px] text-neutral-600">
            KEPADA YTH :
          </p>
          <p className="text-xs font-medium print:text-[10px] text-black">{data.pemasok.nama || '-'}</p>
          {data.pemasok.kontak && (
            <p className="text-[10px] print:text-[9px] text-neutral-600">{data.pemasok.kontak}</p>
          )}
          {data.pemasok.alamat && (
            <p className="text-[10px] print:text-[8px] text-neutral-600">{data.pemasok.alamat}</p>
          )}
        </div>
        <div className="text-right">
          <div className="inline-block text-left doc-detail">
            <p className="text-[10px] print:text-[8px] text-neutral-600">No. PO</p>
            <p className="text-xs font-medium print:text-[10px] text-black">{data.nomor}</p>
            <p className="text-[10px] mt-0.5 print:text-[8px] text-neutral-600">Tanggal</p>
            <p className="text-xs print:text-[10px] text-black">{formatTanggal(data.tanggal)}</p>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto mb-3 print:mb-[1mm]">
        <table className="w-full text-[10px] print:text-[9px] print-table-8mm">
          <thead>
            <tr style={{ backgroundColor: '#000000' }}>
              <th className="py-1.5 px-1 text-right font-semibold text-white w-10 print:py-0">Qty</th>
              <th className="py-1.5 px-1 text-left font-semibold text-white print:py-0">Nama Barang</th>
              <th className="py-1.5 px-1 text-right font-semibold text-white w-[72px] print:py-0">Harga Satuan</th>
              <th className="py-1.5 px-1 text-right font-semibold text-white w-[72px] print:py-0">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr
                key={item.id}
                style={{
                  backgroundColor: i % 2 === 1 ? '#F5F5F5' : '#FFFFFF',
                }}
              >
                <td className="py-1.5 px-1 text-right print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{i < data.items.length ? item.qty : ''}</td>
                <td className="py-1.5 px-1 print:py-0 whitespace-pre-line" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{item.deskripsi || ''}</td>
                <td className="py-1.5 px-1 text-right print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{i < data.items.length ? formatRupiah(item.harga) : ''}</td>
                <td className="py-1.5 px-1 text-right font-medium print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>
                  {i < data.items.length ? formatRupiah(item.qty * item.harga) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mb-3 print:mb-[0.5mm] flex justify-end">
        <div className="print-totals w-52 space-y-0.5 text-[10px] print:text-[12px] print:w-48">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          {data.ppn > 0 && (
            <div className="flex justify-between text-neutral-600">
              <span>PPN ({data.ppn}%)</span>
              <span>{formatRupiah(ppnAmount)}</span>
            </div>
          )}
          <div
            className="print-total-border flex justify-between pt-0.5 font-bold text-black"
            style={{ fontSize: '12px', borderTop: '2px solid #000000' }}
          >
            <span>TOTAL</span>
            <span style={{ fontSize: '13px' }}>{formatRupiah(total)}</span>
          </div>
        </div>
      </div>

      {/* Terbilang */}
      <div className="mb-2 print:mb-[0.5mm]">
        <p className="text-[9px] italic text-neutral-600 print:text-[9px]">
          Terbilang: {terbilang(total)} rupiah
        </p>
      </div>

      {/* Notes */}
      {data.catatan && (
        <div className="mb-3 print:mb-[0.5mm] rounded p-2 text-[11px] print:text-[9px] print:p-1" style={{ backgroundColor: '#F5F5F5', color: '#000000' }}>
          <p className="font-semibold mb-0.5 text-black">Catatan:</p>
          <p className="whitespace-pre-wrap">{data.catatan}</p>
        </div>
      )}

      {/* Signatures - 3 columns */}
      <div className="print-sig-grid grid grid-cols-3 gap-3 mt-3 text-[10px] text-center print:text-[8px] print:mt-[1mm]">
        <div>
          <p className="font-semibold mb-4 print:mb-4 text-black">Disetujui Oleh</p>
          <div className="mx-auto w-3/5 pb-0.5" style={{ borderBottom: '1px solid #000000' }} />
        </div>
        <div>
          <p className="font-semibold mb-4 print:mb-4 text-black">Diketahui</p>
          <div className="mx-auto w-3/5 pb-0.5" style={{ borderBottom: '1px solid #000000' }} />
        </div>
        <div>
          <p className="font-semibold mb-4 print:mb-4 text-black">Pemasok</p>
          <div className="mx-auto w-3/5 pb-0.5" style={{ borderBottom: '1px solid #000000' }} />
        </div>
      </div>

      <p className="text-[8px] text-center mt-7 italic print:text-[7px] print:mt-[3mm] text-neutral-600">
        Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.
      </p>
    </div>
  );
}
