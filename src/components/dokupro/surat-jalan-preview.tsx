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
    <div
      data-document-preview
      className="a5-page bg-white text-black print:shadow-none print:border-0 print:p-0 print:mb-0"
      style={{
        width: '148mm',
        minHeight: '210mm',
        padding: '8mm 10mm',
        fontSize: '9pt',
        lineHeight: '1.35',
        fontFamily: 'var(--font-space-grotesk), Arial, Helvetica, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* === HEADER === */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3mm' }}>
        {/* Company info */}
        <div style={{ display: 'flex', gap: '2mm', alignItems: 'flex-start' }}>
          <div
            className="print-logo-box"
            style={{
              width: '10mm',
              height: '10mm',
              border: data.company.logo ? 'none' : '2px solid #000',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '12pt',
              flexShrink: 0,
              color: data.company.logo ? 'inherit' : '#000',
            }}
          >
            {data.company.logo ? (
              <img src={data.company.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span>{companyInitials}</span>
            )}
          </div>
          <div className="company-info">
            <p className="company-name" style={{ fontSize: '11pt', fontWeight: 'bold', color: '#000', margin: 0 }}>
              {data.company.nama || ''}
            </p>
            {data.company.alamat && (
              <p style={{ fontSize: '7pt', color: '#555', margin: '0.5mm 0 0' }}>{data.company.alamat}</p>
            )}
            {(data.company.telepon || data.company.email) && (
              <p style={{ fontSize: '7pt', color: '#555', margin: '0.3mm 0 0' }}>
                {data.company.telepon && <span>{data.company.telepon}</span>}
                {data.company.telepon && data.company.email && <span> | </span>}
                {data.company.email && <span>{data.company.email}</span>}
              </p>
            )}
            {(data.company.bankName || data.company.bankName2) && (
              <p style={{ fontSize: '6.5pt', color: '#555', margin: '0.3mm 0 0' }}>
                {data.company.bankName && (
                  <span>{data.company.bankName} {data.company.bankAccount} a.n. {data.company.bankHolder}</span>
                )}
                {data.company.bankName2 && (
                  <span style={{ marginLeft: '3mm' }}>{data.company.bankName2} {data.company.bankAccount2} a.n. {data.company.bankHolder2}</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Surat Jalan title */}
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '12pt', fontWeight: 'bold', margin: 0, color: '#000' }}>SURAT JALAN</h2>
          <p style={{ fontSize: '7pt', fontWeight: '600', color: '#555', letterSpacing: '1px', textTransform: 'uppercase', margin: '0.5mm 0 0' }}>Pengiriman Barang</p>
        </div>
      </div>

      {/* === DIVIDER === */}
      <div className="print-divider" style={{ borderBottom: '2px solid #000', marginBottom: '2mm' }} />

      {/* === PENERIMA + DOC INFO === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2mm', marginBottom: '2mm' }}>
        <div className="doc-recipient">
          <p style={{ fontSize: '7.5pt', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#666', margin: '0 0 0.5mm' }}>
            Kepada Yth :
          </p>
          <p style={{ fontSize: '9pt', fontWeight: '500', color: '#000', margin: 0 }}>
            {data.penerima.nama || '-'}
          </p>
          {data.penerima.kontak && (
            <p style={{ fontSize: '7.5pt', color: '#555', margin: '0.3mm 0 0' }}>{data.penerima.kontak}</p>
          )}
          {data.penerima.alamat && (
            <p style={{ fontSize: '7.5pt', color: '#555', margin: '0.3mm 0 0' }}>{data.penerima.alamat}</p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="doc-detail" style={{ display: 'inline-block', textAlign: 'left' }}>
            <p style={{ fontSize: '7.5pt', color: '#666', margin: 0 }}>No. Surat Jalan</p>
            <p style={{ fontSize: '9pt', fontWeight: '500', color: '#000', margin: 0 }}>{data.nomor}</p>
            <p style={{ fontSize: '7.5pt', color: '#666', margin: '0.5mm 0 0' }}>Tanggal</p>
            <p style={{ fontSize: '9pt', color: '#000', margin: 0 }}>{formatTanggal(data.tanggal)}</p>
            {data.referensi && (
              <>
                <p style={{ fontSize: '7.5pt', color: '#666', margin: '0.5mm 0 0' }}>Ref.</p>
                <p style={{ fontSize: '9pt', fontWeight: '500', color: '#000', margin: 0 }}>{data.referensi}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* === VEHICLE INFO === */}
      <div style={{ display: 'flex', gap: '6mm', marginBottom: '2mm', fontSize: '7.5pt' }}>
        <div>
          <p style={{ color: '#666', margin: 0 }}>No. Kendaraan</p>
          <p style={{ fontWeight: '600', color: '#000', margin: 0 }}>{data.noKendaraan || '-'}</p>
        </div>
        <div>
          <p style={{ color: '#666', margin: 0 }}>Pengemudi</p>
          <p style={{ fontWeight: '600', color: '#000', margin: 0 }}>{data.pengemudi || '-'}</p>
        </div>
      </div>

      {/* === ITEMS TABLE === */}
      <table className="print-table-8mm" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <thead>
          <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
            <th style={{ padding: '1.5mm 1mm', textAlign: 'right', fontWeight: '600', width: '10mm' }}>Qty</th>
            <th style={{ padding: '1.5mm 1mm', textAlign: 'left', fontWeight: '600' }}>Nama Barang</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={item.id} style={{ height: '8mm' }}>
              <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'top', color: i < data.items.length ? '#000' : 'transparent' }}>{i < data.items.length ? item.qty : ''}</td>
              <td style={{ padding: '0 1mm', verticalAlign: 'top', color: i < data.items.length ? '#000' : 'transparent', whiteSpace: 'pre-line' }}>{item.deskripsi || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* === NOTES === */}
      {data.catatan && (
        <div style={{
          marginTop: '2mm', marginBottom: '2mm', borderRadius: '2px', padding: '2mm',
          backgroundColor: '#f5f5f5', fontSize: '7.5pt', color: '#000',
        }}>
          <p style={{ fontWeight: '600', margin: '0 0 0.5mm', color: '#000' }}>Catatan:</p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.catatan}</p>
        </div>
      )}

      {/* === SIGNATURES === */}
      <div className="print-sig-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm',
        marginTop: '3mm', textAlign: 'center', fontSize: '8pt',
      }}>
        <div>
          <p style={{ fontWeight: '600', marginBottom: '12mm', color: '#000', margin: '0 0 12mm' }}>Penerima</p>
          <div className="print-sig-line" style={{ borderBottom: '1px solid #000', margin: '0 auto', width: '60%' }} />
        </div>
        <div>
          <p style={{ fontWeight: '600', marginBottom: '12mm', color: '#000', margin: '0 0 12mm' }}>Pengirim</p>
          <div className="print-sig-line" style={{ borderBottom: '1px solid #000', margin: '0 auto', width: '60%' }} />
        </div>
      </div>

      {/* === FOOTER === */}
      <p style={{
        fontSize: '6pt', textAlign: 'center', marginTop: '3mm',
        fontStyle: 'italic', color: '#888', margin: '3mm 0 0',
      }}>
        Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.
      </p>
    </div>
  );
}
