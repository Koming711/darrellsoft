'use client';

import type { InvoiceData } from '@/lib/types';
import { DEFAULT_COMPANY } from '@/lib/types';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';

interface InvoicePreviewProps {
  data: InvoiceData;
  showPelunasanLabel?: boolean;
  /** Override DP amount — when set, DP stays fixed regardless of total changes (used in pelunasan editor) */
  dpAmountOverride?: number;
}

export function InvoicePreview({ data, showPelunasanLabel, dpAmountOverride }: InvoicePreviewProps) {
  // Fallback defensif: data lama/backup lama bisa tanpa key `company`
  const company = data.company ?? { ...DEFAULT_COMPANY };
  const items = Array.isArray(data.items) ? data.items : [];
  const client = data.client ?? { nama: '', kontak: '', alamat: '' };
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (data.ppn / 100);
  const total = subtotal + ppnAmount;
  const dpPercent = data.dp || 0;
  const dpAmount = dpAmountOverride !== undefined
    ? dpAmountOverride
    : data.dpAmount !== undefined
      ? data.dpAmount
      : total * (dpPercent / 100);
  const sisa = total - dpAmount;
  // Invoice DP: entah DP diisi sebagai persen (dp) maupun nominal (dpAmount) —
  // keduanya wajib menampilkan baris DP + SISA PEMBAYARAN (sisa = piutang).
  const isDp = dpPercent > 0 || dpAmount > 0;
  const companyInitials = (company.nama || 'C').split(/\s+/).map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2);

  const itemCount = items.length;

  // Semua row tabel tinggi tetap 8mm (30.24px @96dpi), konten center vertikal.
  const ROW_H = '8mm';
  // Jumlah row pengisian invoice: tabel item selalu menampilkan 10 row
  // (item terisi + baris pengisi kosong). Bila item > 10, semua item tetap tampil.
  const TOTAL_ITEM_ROWS = 10;

  return (
    <div
      data-document-preview
      className="a5-page doc-margin-invoice bg-white text-black print:shadow-none print:border-0 print:p-0 print:mb-0"
      style={{
        width: '148mm',
        minHeight: '210mm',
        // Margin seragam 10mm keempat sisi (kiri/kanan/atas/bawah rata semua)
        padding: '10mm',
        // Font SERAGAM 9pt untuk seluruh tulisan invoice
        fontSize: '9pt',
        lineHeight: '1.25',
        fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* === HEADER === */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2mm' }}>
        {/* Company info */}
        <div style={{ display: 'flex', gap: '2mm', alignItems: 'flex-start' }}>
          <div
            className="print-logo-box"
            style={{
              width: '10mm',
              height: '10mm',
              border: company.logo ? 'none' : '2px solid #000',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '9pt',
              flexShrink: 0,
              color: '#000',
            }}
          >
            {company.logo ? (
              <img src={company.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span>{companyInitials}</span>
            )}
          </div>
          <div className="company-info">
            <p className="company-name" style={{ fontSize: '9pt', fontWeight: 'bold', color: '#000', margin: 0 }}>
              {company.nama || ''}
            </p>
            {company.alamat && (
              <p style={{ fontSize: '9pt', color: '#000', margin: '0.5mm 0 0' }}>{company.alamat}</p>
            )}
            {(company.telepon || company.email) && (
              <p style={{ fontSize: '9pt', color: '#000', margin: '0.3mm 0 0' }}>
                {company.telepon && <span>{company.telepon}</span>}
                {company.telepon && company.email && <span> | </span>}
                {company.email && <span>{company.email}</span>}
              </p>
            )}
            {(company.bankName || company.bankName2) && (
              <p style={{ fontSize: '9pt', color: '#000', margin: '0.3mm 0 0' }}>
                {company.bankName && (
                  <span>{company.bankName} {company.bankAccount} a.n. {company.bankHolder}</span>
                )}
                {company.bankName2 && (
                  <span style={{ marginLeft: '3mm' }}>{company.bankName2} {company.bankAccount2} a.n. {company.bankHolder2}</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Invoice title */}
        <div style={{ textAlign: 'right' }}>
          {showPelunasanLabel ? (
            <>
              <h2 style={{ fontSize: '9pt', fontWeight: 'bold', margin: 0, color: '#000' }}>INVOICE</h2>
              <p style={{ fontSize: '9pt', fontWeight: 'bold', color: '#000', letterSpacing: '1.5px', margin: '0.5mm 0 0' }}>PELUNASAN</p>
            </>
          ) : isDp ? (
            <>
              <h2 style={{ fontSize: '9pt', fontWeight: 'bold', margin: 0, color: '#000', lineHeight: 1.2 }}>INVOICE</h2>
              <p style={{ fontSize: '9pt', fontWeight: 'bold', color: '#000', letterSpacing: '1.5px', margin: '0.5mm 0 0' }}>DOWN PAYMENT</p>
            </>
          ) : (
            <h2 style={{ fontSize: '9pt', fontWeight: 'bold', margin: 0, color: '#000' }}>INVOICE</h2>
          )}

          {data.lunas && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '1mm',
              marginTop: '1mm', padding: '0.5mm 2mm', borderRadius: '10px',
              backgroundColor: '#dcfce7', border: '1.5px solid #22c55e',
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
              <span style={{ fontSize: '9pt', fontWeight: '900', color: '#000', letterSpacing: '1px' }}>LUNAS</span>
            </div>
          )}
          {data.tanggalJatuhTempo && !data.lunas && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1mm', marginTop: '1mm' }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span style={{ fontSize: '9pt', fontWeight: '600', color: '#000' }}>
                Jatuh Tempo: {new Date(data.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* === DIVIDER === */}
      <div className="print-divider" style={{ borderBottom: '2px solid #000', marginBottom: '1.5mm' }} />

      {/* === CLIENT + DOC INFO === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2mm', marginBottom: '1.5mm' }}>
        <div className="doc-recipient">
          <p style={{ fontSize: '9pt', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#000', margin: '0 0 0.5mm' }}>
            Kepada Yth :
          </p>
          <p style={{ fontSize: '9pt', fontWeight: '500', color: '#000', margin: 0 }}>
            {client.nama || '-'}
          </p>
          {client.kontak && (
            <p style={{ fontSize: '9pt', color: '#000', margin: '0.3mm 0 0' }}>{client.kontak}</p>
          )}
          {client.alamat && (
            <p style={{ fontSize: '9pt', color: '#000', margin: '0.3mm 0 0' }}>{client.alamat}</p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="doc-detail" style={{ display: 'inline-block', textAlign: 'left' }}>
            <p style={{ fontSize: '9pt', color: '#000', margin: 0 }}>No. Invoice</p>
            <p style={{ fontSize: '9pt', fontWeight: '500', color: '#000', margin: 0 }}>{data.nomor}</p>
            <p style={{ fontSize: '9pt', color: '#000', margin: '0.5mm 0 0' }}>Tanggal</p>
            <p style={{ fontSize: '9pt', color: '#000', margin: 0 }}>{formatTanggal(data.tanggal)}</p>
            {showPelunasanLabel && data.referensiInvoiceNomor && (
              <>
                <p style={{ fontSize: '9pt', color: '#000', margin: '0.5mm 0 0' }}>Ref.</p>
                <p style={{ fontSize: '9pt', fontWeight: '500', color: '#000', margin: 0 }}>{data.referensiInvoiceNomor}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* === PAYMENT INFO === */}
      {data.caraPembayaran && (
        <div style={{ marginBottom: '2mm', fontSize: '9pt', display: 'flex', alignItems: 'center', gap: '1.5mm' }}>
          <span style={{ color: '#000' }}>Cara Bayar:</span>
          <span style={{ fontWeight: '600', color: '#000', textTransform: 'uppercase' }}>
            {data.caraPembayaran === 'giro' ? 'Giro' : data.caraPembayaran === 'transfer' ? 'Transfer' : 'Cash'}
          </span>
          {data.caraPembayaran === 'giro' && data.tanggalGiro && (
            <span style={{ color: '#000' }}>
              (Tgl: {new Date(data.tanggalGiro).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })})
            </span>
          )}
        </div>
      )}

      {/* === ITEMS TABLE === */}
      {/* Semua row (header, item, pengisi, totals) tinggi 8mm — konten center vertikal */}
      <table className="print-table-8mm" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <thead>
          <tr style={{ height: ROW_H, borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
            <th style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: '600', width: '10mm', color: '#000' }}>Qty</th>
            <th style={{ padding: '0 1mm', textAlign: 'left', verticalAlign: 'middle', fontWeight: '600', color: '#000' }}>Nama Barang</th>
            <th style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: '600', width: '25mm', color: '#000' }}>Harga Satuan</th>
            <th style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: '600', width: '28mm', color: '#000' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} style={{ height: ROW_H }}>
              <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{item.qty}</td>
              <td style={{ padding: '0 1mm', verticalAlign: 'middle', color: '#000', whiteSpace: 'pre-line' }}>{item.deskripsi || ''}</td>
              <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{formatRupiah(item.harga)}</td>
              <td style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{formatRupiah(item.qty * item.harga)}</td>
            </tr>
          ))}
          {/* Baris pengisi kosong — total row pengisian selalu 10 */}
          {Array.from({ length: Math.max(0, TOTAL_ITEM_ROWS - itemCount) }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ height: ROW_H }}>
              <td /><td /><td /><td />
            </tr>
          ))}

          {/* Totals inside table */}
          <tr className="total-row" style={{ height: ROW_H }}>
            <td colSpan={2} />
            <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>Subtotal</td>
            <td style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{formatRupiah(subtotal)}</td>
          </tr>
          {data.ppn > 0 && (
            <tr className="total-row" style={{ height: ROW_H }}>
              <td colSpan={2} />
              <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>PPN ({data.ppn}%)</td>
              <td style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{formatRupiah(ppnAmount)}</td>
            </tr>
          )}
          <tr className="total-row print-total-border" style={{ height: ROW_H, borderTop: '2px solid #000' }}>
            <td colSpan={2} />
            <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#000' }}>TOTAL</td>
            <td style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#000' }}>{formatRupiah(total)}</td>
          </tr>
          {isDp && (
            <>
              <tr className="total-row" style={{ height: ROW_H }}>
                <td colSpan={2} />
                <td style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{dpPercent > 0 ? `DP (${dpPercent}%)` : 'DP'}</td>
                <td style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', color: '#000' }}>{formatRupiah(dpAmount)}</td>
              </tr>
              {/* Label SISA PEMBAYARAN melewati kolom Qty+Nama Barang (colSpan 2,
                  right-aligned); nilai melewati kolom Harga+Jumlah (colSpan 2,
                  right-aligned) — ujung kanan label tepat di batas kolom Harga,
                  nilai rata kanan persis dgn baris total lain. Tidak pernah ketumpuk. */}
              <tr className="total-row print-sisa-border" style={{ height: ROW_H, borderTop: '1px solid #000' }}>
                <td colSpan={2} style={{ padding: '0 1mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#000', whiteSpace: 'nowrap' }}>SISA PEMBAYARAN</td>
                <td colSpan={2} style={{ padding: '0 3mm', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#000' }}>{formatRupiah(sisa)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {/* === TERBILANG === */}
      <div style={{ marginTop: '0.8mm', marginBottom: '0.5mm' }}>
        <p style={{ fontSize: '9pt', fontStyle: 'italic', color: '#000', margin: 0 }}>
          Terbilang: {terbilang(isDp ? sisa : total)} rupiah
        </p>
      </div>

      {/* === NOTES === */}
      {data.catatan && (
        <div style={{
          marginBottom: '2mm', borderRadius: '2px', padding: '2mm',
          backgroundColor: '#f5f5f5', fontSize: '9pt', color: '#000',
        }}>
          <p style={{ fontWeight: '600', margin: '0 0 0.5mm', color: '#000' }}>Catatan:</p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.catatan}</p>
        </div>
      )}

      {/* === SIGNATURES === */}
      {/* marginTop:auto → blok tanda tangan + footer selalu menempel di dasar
          halaman A5 (margin-top auto mengisi sisa ruang di atasnya) */}
      <div className="print-sig-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm',
        marginTop: 'auto', paddingTop: '2mm', textAlign: 'center', fontSize: '9pt',
      }}>
        <div>
          <p style={{ fontWeight: '600', color: '#000', margin: '0 0 7mm' }}>Diterima Oleh</p>
          <div className="print-sig-line" style={{ borderBottom: '1px solid #000', margin: '0 auto', width: '60%' }} />
        </div>
        <div>
          <p style={{ fontWeight: '600', color: '#000', margin: '0 0 7mm' }}>Hormat Kami</p>
          <div className="print-sig-line" style={{ borderBottom: '1px solid #000', margin: '0 auto', width: '60%' }} />
        </div>
      </div>

      {/* === FOOTER === */}
      <p style={{
        fontSize: '9pt', textAlign: 'center',
        fontStyle: 'italic', color: '#000', margin: '1.5mm 0 0',
      }}>
        Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.
      </p>
    </div>
  );
}
