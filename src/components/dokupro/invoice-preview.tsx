'use client';

import type { InvoiceData } from '@/lib/types';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';

interface InvoicePreviewProps {
  data: InvoiceData;
  showPelunasanLabel?: boolean;
  /** Override DP amount — when set, DP stays fixed regardless of total changes (used in pelunasan editor) */
  dpAmountOverride?: number;
}

const MAX_ROWS = 8;

export function InvoicePreview({ data, showPelunasanLabel, dpAmountOverride }: InvoicePreviewProps) {
  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (data.ppn / 100);
  const total = subtotal + ppnAmount;
  const dpPercent = data.dp || 0;
  // Priority: dpAmountOverride > data.dpAmount (saved) > originalTotal * dpPercent > total * dpPercent
  const originalTotalForDp = data.originalTotal !== undefined ? data.originalTotal : total;
  const dpAmount = dpAmountOverride !== undefined
    ? dpAmountOverride
    : data.dpAmount !== undefined
      ? data.dpAmount
      : originalTotalForDp * (dpPercent / 100);
  const sisa = total - dpAmount;
  const companyInitials = (data.company.nama || 'C').split(/\s+/).map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2);

  // Pad items to MAX_ROWS
  const rows = [...data.items];
  while (rows.length < MAX_ROWS) {
    rows.push({ id: `empty-${rows.length}`, deskripsi: '', qty: 0, satuan: '', harga: 0 });
  }

  return (
    <div data-document-preview className="rounded-lg border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6 print:shadow-none print:border-0 print:p-0 print:text-[10px] print:mb-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 print:mb-[1.5mm]">
        <div className="flex items-start gap-3">
          <div
            className="print-logo-box flex h-12 w-12 shrink-0 items-center justify-center rounded border-[3px] font-bold text-lg print:h-9 print:w-9 print:text-[14px]"
            style={{ borderColor: data.company.logo ? 'transparent' : '#000000', color: data.company.logo ? 'inherit' : '#000000' }}
          >
            {data.company.logo ? (
              <img
                src={data.company.logo}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <span>{companyInitials}</span>
            )}
          </div>
          <div className="company-info">
            <p className="company-name text-[17px] font-bold print:text-[17px] text-black">
              {data.company.nama || ''}
            </p>
            {data.company.alamat && (
              <p className="text-[12px] print:text-[12px] text-neutral-600">{data.company.alamat}</p>
            )}
            {(data.company.telepon || data.company.email) && (
              <div className="flex gap-4 text-[12px] print:text-[12px] text-neutral-600">
                {data.company.telepon && <span>{data.company.telepon}</span>}
                {data.company.email && <span>{data.company.email}</span>}
              </div>
            )}
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
          <h2 className="text-lg font-bold print:text-[13px] text-black">INVOICE</h2>
          {showPelunasanLabel && (
            <p className="text-[11px] font-bold print:text-[10px] text-amber-700 tracking-wider">PELUNASAN</p>
          )}
          {/* LUNAS stamp */}
          {data.lunas && (
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 border-2 border-green-500 print:bg-green-50 print:border-green-600">
              <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              <span className="text-[10px] font-black text-green-700 print:text-green-800 tracking-wider">LUNAS</span>
            </div>
          )}
          {data.tanggalJatuhTempo && !data.lunas && (
            <div className="flex items-center justify-end gap-1 mt-1">
              <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[9px] font-semibold text-amber-700">Jatuh Tempo: {new Date(data.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="print-divider mb-3 print:mb-[1mm]" style={{ borderBottom: '2px solid #000000' }} />

      {/* Client info */}
      <div className="mb-3 print:mb-[1mm] grid grid-cols-2 gap-3 print:gap-1.5">
        <div className="doc-recipient">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5 print:text-[9px] text-neutral-600">
            Kepada Yth :
          </p>
          <p className="text-xs font-medium print:text-[11px] text-black">
            {data.client.nama || '-'}
          </p>
          {data.client.kontak && (
            <p className="text-[10px] print:text-[9px] text-neutral-600">{data.client.kontak}</p>
          )}
          {data.client.alamat && (
            <p className="text-[10px] print:text-[9px] text-neutral-600">{data.client.alamat}</p>
          )}
        </div>
        <div className="text-right">
          <div className="inline-block text-left doc-detail">
            <p className="text-[10px] print:text-[8px] text-neutral-600">No. Invoice</p>
            <p className="text-xs font-medium print:text-[10px] text-black">{data.nomor}</p>
            <p className="text-[10px] mt-0.5 print:text-[8px] text-neutral-600">Tanggal</p>
            <p className="text-xs print:text-[10px] text-black">{formatTanggal(data.tanggal)}</p>
            {data.referensi && (
              <>
                <p className="text-[10px] mt-0.5 print:text-[8px] text-neutral-600">Ref.</p>
                <p className="text-xs font-medium print:text-[10px] text-black">{data.referensi}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Payment Info Row */}
      {data.caraPembayaran && (
        <div className="mb-3 print:mb-[1mm] flex items-center gap-3 print:gap-1.5 text-[10px] print:text-[9px]">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-emerald-600 print:w-3 print:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            <span className="text-neutral-600">Cara Bayar:</span>
            <span className="font-semibold text-black uppercase">{data.caraPembayaran === 'giro' ? 'Giro' : data.caraPembayaran === 'transfer' ? 'Transfer' : 'Cash'}</span>
            {data.caraPembayaran === 'giro' && data.tanggalGiro && (
              <span className="text-neutral-500 ml-0.5">(Tgl: {new Date(data.tanggalGiro).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })})</span>
            )}
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="overflow-x-auto mb-3 print:mb-[1mm]">
        <table className="w-full text-[10px] print:text-[9px] print-table-8mm">
          <thead>
            <tr style={{ borderTop: '2px solid #000000', borderBottom: '2px solid #000000' }}>
              <th className="py-1.5 px-1 text-right font-semibold text-black w-10 print:py-0">Qty</th>
              <th className="py-1.5 px-1 text-left font-semibold text-black print:py-0">Nama Barang</th>
              <th className="py-1.5 px-1 text-right font-semibold text-black w-[80px] print:py-0">Harga Satuan</th>
              <th className="py-1.5 px-4 text-right font-semibold text-black w-[105px] print:py-0">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr
                key={item.id}
              >
                <td className="py-1.5 px-1 text-right print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{i < data.items.length ? item.qty : ''}</td>
                <td className="py-1.5 px-1 print:py-0 whitespace-pre-line" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{item.deskripsi || ''}</td>
                <td className="py-1.5 px-1 text-right print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top', paddingRight: '11px' }}>{i < data.items.length ? formatRupiah(item.harga) : ''}</td>
                <td className="py-1.5 px-4 text-right font-medium print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>
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
          {dpPercent > 0 && (
            <>
              <div className="flex justify-between text-neutral-600 mt-1">
                <span>DP ({dpPercent}%)</span>
                <span>{formatRupiah(dpAmount)}</span>
              </div>
              <div
                className="flex justify-between pt-0.5 font-bold text-black"
                style={{ fontSize: '12px', borderTop: '1px solid #000000' }}
              >
                <span>SISA PEMBAYARAN</span>
                <span style={{ fontSize: '13px' }}>{formatRupiah(sisa)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Terbilang */}
      <div className="mb-2 print:mb-[0.5mm]">
        <p className="text-[9px] italic text-neutral-600 print:text-[9px]">
          Terbilang: {terbilang(dpPercent > 0 ? sisa : total)} rupiah
        </p>
      </div>

      {/* Notes */}
      {data.catatan && (
        <div className="mb-3 rounded p-2 text-[11px] print:text-[9px] print:p-1 print:mb-[0.5mm]" style={{ backgroundColor: '#F5F5F5', color: '#000000' }}>
          <p className="font-semibold mb-0.5 text-black">Catatan:</p>
          <p className="whitespace-pre-wrap">{data.catatan}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="print-sig-grid grid grid-cols-2 gap-6 mt-3 text-[12px] text-center print:text-[10px] print:mt-[1mm] print:gap-2">
        <div>
          <p className="font-semibold mb-4 print:mb-3 text-black">Diterima Oleh</p>
          <div className="mx-auto w-3/5 pb-0.5" style={{ borderBottom: '1px solid #000000' }} />
        </div>
        <div>
          <p className="font-semibold mb-4 print:mb-3 text-black">Hormat Kami</p>
          <div className="mx-auto w-3/5 pb-0.5" style={{ borderBottom: '1px solid #000000' }} />
        </div>
      </div>

      <p className="text-[8px] text-center mt-4 italic print:text-[7px] print:mt-[2mm] text-neutral-600">
        Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.
      </p>
    </div>
  );
}
