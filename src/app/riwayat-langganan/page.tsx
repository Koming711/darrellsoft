'use client';

// AKUN SAYA → RIWAYAT PEMBAYARAN (langganan)
// Daftar transaksi pembayaran manual milik pelanggan: nomor, tanggal, paket,
// total, metode, status, bukti, tanggal verifikasi, alasan penolakan (jika ada),
// tombol detail + unggah ulang bukti saat DITOLAK.

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Receipt, Eye, Upload, X, RefreshCw } from 'lucide-react';
import { getAuthUser } from '@/lib/auth';
import { ProofUploadForm, formatRupiahClient, statusLabel, statusColor } from '@/components/payment-manual/proof-upload-form';

interface Confirmation {
  id: string;
  senderName: string;
  senderBank: string;
  transferAmount: number;
  transferDate: string;
  verificationStatus: string;
  rejectionReason: string;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  transactionNumber: string;
  planName: string;
  durationMonths: number;
  amount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  expiresAt: string;
  verifiedAt?: string;
  verifiedByName?: string;
  createdAt: string;
  confirmations: Confirmation[];
}

function methodLabel(m: string) {
  return m === 'qris_manual' ? 'QRIS Manual' : 'Transfer Bank';
}

function RiwayatLanggananContent() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [reupload, setReupload] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = getAuthUser();
      if (!auth) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);
      const res = await fetch('/api/payment-manual/transactions', { headers: await import('@/lib/auth').then((m) => m.getAuthHeaders()) });
      const data = await res.json();
      if (res.ok) setTransactions(data.transactions || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const viewProof = (c: Confirmation) => {
    window.open(`/api/payment-manual/proof/${c.id}`, '_blank');
  };

  if (authed === false) {
    return (
      <DashboardLayout title="Riwayat Pembayaran">
        <div className="max-w-md mx-auto text-center py-16">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Silakan login untuk melihat riwayat pembayaran langganan Anda.
          </p>
          <Button className="mt-4" onClick={() => (window.location.href = '/login')}>Masuk</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Riwayat Pembayaran" subtitle="Riwayat pembayaran langganan Anda">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted-foreground">
            Status pembayaran menjadi lunas hanya setelah diverifikasi admin Darrellsoft.
          </p>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Belum ada transaksi pembayaran langganan.</p>
            <Button className="mt-4" onClick={() => (window.location.href = '/paket')}>Lihat Paket</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => {
              const latestConf = t.confirmations?.[0];
              return (
                <div key={t.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm">{t.transactionNumber}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(t.paymentStatus)}`}>
                          {statusLabel(t.paymentStatus)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t.planName} · {t.durationMonths} bulan · {methodLabel(t.paymentMethod)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Dibuat {new Date(t.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {t.verifiedAt && ` · Diverifikasi ${new Date(t.verifiedAt).toLocaleDateString('id-ID')}${t.verifiedByName ? ` oleh ${t.verifiedByName}` : ''}`}
                      </p>
                      {t.paymentStatus === 'REJECTED' && latestConf?.rejectionReason && (
                        <p className="text-[11px] text-red-500 mt-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
                          Alasan penolakan: {latestConf.rejectionReason}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold">{formatRupiahClient(t.totalAmount)}</p>
                      <div className="flex items-center gap-1.5 mt-2 justify-end">
                        {latestConf && (
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => viewProof(latestConf)}>
                            <Eye className="w-3 h-3" /> Bukti
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setDetail(t)}>
                          <Eye className="w-3 h-3" /> Detail
                        </Button>
                        {(t.paymentStatus === 'REJECTED' || t.paymentStatus === 'UNPAID') && (
                          <Button size="sm" className="h-7 gap-1 text-[11px] bg-red-600 hover:bg-red-700 text-white" onClick={() => setReupload(t)}>
                            <Upload className="w-3 h-3" /> {t.paymentStatus === 'REJECTED' ? 'Unggah Ulang' : 'Kirim Bukti'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog detail */}
      {detail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setDetail(null)}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold">Detail Transaksi</h3>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Nomor Transaksi', detail.transactionNumber],
                ['Tanggal', new Date(detail.createdAt).toLocaleString('id-ID')],
                ['Paket', `${detail.planName} (${detail.durationMonths} bulan)`],
                ['Harga Paket', formatRupiahClient(detail.amount)],
                ...(detail.discountAmount > 0 ? [['Diskon', `- ${formatRupiahClient(detail.discountAmount)}`]] : []),
                ['Total Pembayaran', formatRupiahClient(detail.totalAmount)],
                ['Metode', methodLabel(detail.paymentMethod)],
                ['Status', statusLabel(detail.paymentStatus)],
                ['Batas Waktu', new Date(detail.expiresAt).toLocaleString('id-ID')],
                ...(detail.verifiedAt ? [['Tanggal Verifikasi', new Date(detail.verifiedAt).toLocaleString('id-ID')]] : []),
                ...(detail.verifiedByName ? [['Diverifikasi Oleh', detail.verifiedByName]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium text-right">{v}</span>
                </div>
              ))}
            </div>
            {detail.confirmations?.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Bukti Pembayaran</h4>
                <div className="space-y-2">
                  {detail.confirmations.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded-lg p-2.5">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.senderName} · {c.senderBank}</p>
                        <p className="text-muted-foreground">
                          {formatRupiahClient(c.transferAmount)} · {new Date(c.transferDate).toLocaleDateString('id-ID')} · {c.verificationStatus === 'APPROVED' ? 'Disetujui' : c.verificationStatus === 'REJECTED' ? 'Ditolak' : 'Menunggu'}
                        </p>
                        {c.rejectionReason && <p className="text-red-500 mt-0.5">Alasan: {c.rejectionReason}</p>}
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-[11px] shrink-0" onClick={() => viewProof(c)}>
                        <Eye className="w-3 h-3" /> Lihat
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog unggah ulang bukti */}
      {reupload && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setReupload(null)}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold">
                {reupload.paymentStatus === 'REJECTED' ? 'Unggah Ulang Bukti Pembayaran' : 'Kirim Bukti Pembayaran'}
              </h3>
              <button onClick={() => setReupload(null)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ProofUploadForm
              transactionNumber={reupload.transactionNumber}
              totalAmount={reupload.totalAmount}
              compact
              onSubmitted={(msg) => {
                toast.success(msg || 'Bukti pembayaran berhasil dikirim');
                setReupload(null);
                load();
              }}
              onCancel={() => setReupload(null)}
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function RiwayatLanggananPage() {
  return <RiwayatLanggananContent />;
}
