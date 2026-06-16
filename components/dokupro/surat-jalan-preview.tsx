'use client';

import type { SuratJalanData } from '@/lib/types';
import { formatTanggal } from '@/lib/format';

interface SuratJalanPreviewProps {
  data: SuratJalanData;
}

const MAX_ROWS = 10;

export function SuratJalanPreview({ data }: SuratJalanPreviewProps) {
  const companyInitials = (data.company.nama || 'C').split(/\s+/).map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2);

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
            className="print-logo-box flex h-12 w-12 shrink-0 items-center justify-center rounded border-[3px] font-bold text-lg print:h-9 print:w-9 print:text-[13px]"
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
            <p className="company-name text-[17px] font-bold print:text-[16px] text-black">
              {data.company.nama || ''}
            </p>
            {data.company.alamat && (
              <p className="text-[12px] print:text-[11px] text-neutral-600">{data.company.alamat}</p>
            )}
            {(data.company.telepon || data.company.email) && (
              <div className="flex gap-4 text-[12px] print:text-[11px] text-neutral-600">
                {data.company.telepon && <span>{data.company.telepon}</span>}
                {data.company.email && <span>{data.company.email}</span>}
              </div>
            )}
            {(data.company.bankName || data.company.bankName2) && (
              <div className="text-[10px] print:text-[8px] text-neutral-600 mt-0.5">
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
          <h2 className="text-lg font-bold print:text-[12px] text-black">SURAT JALAN</h2>
          <p className="text-[10px] font-medium uppercase tracking-wider print:text-[7px] text-neutral-600">
            Pengiriman Barang
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="print-divider mb-3 print:mb-[1mm]" />

      {/* Penerima */}
      <div className="mb-3 print:mb-[1mm] grid grid-cols-2 gap-3 print:gap-1.5">
        <div className="doc-recipient">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5 print:text-[8px] text-neutral-600">
            Kepada Yth :
          </p>
          <p className="text-xs font-medium print:text-[10px] text-black">{data.penerima.nama || '-'}</p>
          {data.penerima.kontak && (
            <p className="text-[10px] print:text-[8px] text-neutral-600">{data.penerima.kontak}</p>
          )}
          {data.penerima.alamat && (
            <p className="text-[10px] print:text-[8px] text-neutral-600">{data.penerima.alamat}</p>
          )}
        </div>
        <div className="text-right">
          <div className="inline-block text-left doc-detail">
            <p className="text-[10px] print:text-[7px] text-neutral-600">No. Surat Jalan</p>
            <p className="text-xs font-medium print:text-[9px] text-black">{data.nomor}</p>
            <p className="text-[10px] mt-0.5 print:text-[7px] text-neutral-600">Tanggal</p>
            <p className="text-xs print:text-[9px] text-black">{formatTanggal(data.tanggal)}</p>
            {data.referensi && (
              <>
                <p className="text-[10px] mt-0.5 print:text-[7px] text-neutral-600">Ref.</p>
                <p className="text-xs font-medium print:text-[9px] text-black">{data.referensi}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Vehicle info */}
      <div className="mb-3 print:mb-[0.5mm] flex gap-6 text-[13px] print:text-[10px]">
        <div>
          <p className="text-[12px] print:text-[10px] text-neutral-600">No. Kendaraan</p>
          <p className="font-medium text-black">{data.noKendaraan || '-'}</p>
        </div>
        <div>
          <p className="text-[12px] print:text-[10px] text-neutral-600">Pengemudi</p>
          <p className="font-medium text-black">{data.pengemudi || '-'}</p>
        </div>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto mb-3 print:mb-[1mm]">
        <table className="w-full text-[10px] print:text-[8px] print-table-8mm">
          <thead>
            <tr style={{ borderTop: '2px solid #000000', borderBottom: '2px solid #000000' }}>
              <th className="py-1.5 px-1 text-right font-semibold text-black w-10 print:py-0">Qty</th>
              <th className="py-1.5 px-1 text-left font-semibold text-black print:py-0">Nama Barang</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr
                key={item.id}
              >
                <td className="py-1.5 px-1 text-right print:py-0" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{i < data.items.length ? item.qty : ''}</td>
                <td className="py-1.5 px-1 print:py-0 whitespace-pre-line" style={{ color: i < data.items.length ? '#000000' : '#CCCCCC', verticalAlign: 'top' }}>{item.deskripsi || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {data.catatan && (
        <div className="mb-3 print:mb-[0.5mm] rounded p-2 text-[11px] print:text-[8px] print:p-1" style={{ backgroundColor: '#F5F5F5', color: '#000000' }}>
          <p className="font-semibold mb-0.5 text-black">Catatan:</p>
          <p className="whitespace-pre-wrap">{data.catatan}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="print-sig-grid grid grid-cols-2 gap-6 mt-3 text-[12px] text-center print:text-[9px] print:mt-[1mm] print:gap-2">
        <div>
          <p className="font-semibold mb-4 print:mb-3 text-black">Penerima</p>
          <div className="print-sig-line mx-auto w-3/5 pb-0.5" />
        </div>
        <div>
          <p className="font-semibold mb-4 print:mb-3 text-black">Pengirim</p>
          <div className="print-sig-line mx-auto w-3/5 pb-0.5" />
        </div>
      </div>

      <p className="text-[8px] text-center mt-4 italic print:text-[6px] print:mt-[2mm] text-neutral-600">
        Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.
      </p>
    </div>
  );
}
