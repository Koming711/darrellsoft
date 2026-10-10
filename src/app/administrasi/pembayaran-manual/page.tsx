'use client';

// ADMIN → PEMBAYARAN MANUAL
// Tabel transaksi pembayaran manual + filter status + pencarian
// (nama / email / nomor transaksi) + verifikasi (SETUJUI / TOLAK dengan alasan).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Search, Eye, X, Check, Ban, Landmark, QrCode, RefreshCw, FileWarning } from 'lucide-react';
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch';
import { formatRupiahClient, statusLabel } from '@/components/payment-manual/proof-upload-form';

interface Confirmation {
  id: string;
  senderName: string;
  senderBank: string;
  transferAmount: number;
  transferDate: string;
  customerNote: string;
  verificationStatus: string;
  rejectionReason: string;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
}

interface Tx {
  id: string;
  transactionNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
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

const FILTERS = [
  { key: 'SEMUA', label: 'Semua' },
  { key: 'UNPAID', label: 'Menunggu Pembayaran' },
  { key: 'WAITING_VERIFICATION', label: 'Menunggu Verifikasi' },
  { key: 'PAID', label: 'Disetujui' },
  { key: 'REJECTED', label: 'Ditolak' },
  { key: 'EXPIRED', label: 'Kedaluwarsa' },
];

function badge(status: string) {
  switch (status) {
    case 'UNPAID': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'WAITING_VERIFICATION': return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';
    case 'PAID': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'REJECTED': return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

export default function PembayaranManualPage() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('SEMUA');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Tx | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'SEMUA') params.set('status', filter);
      if (q.trim()) params.set('q', q.trim());
      const res = await authFetch(`/api/payment-manual/transactions?${params.toString()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setTransactions(data.transactions || []);
      else toast.error(data.error || 'Gagal memuat transaksi');
    } catch {
      toast.error('Gagal memuat transaksi');
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { SEMUA: transactions.length };
    for (const f of FILTERS.slice(1)) c[f.key] = 0;
    // counts computed from full list when filter=SEMUA only (server filters otherwise)
    if (filter === 'SEMUA') {
      for (const t of transactions) c[t.paymentStatus] = (c[t.paymentStatus] || 0) + 1;
      c.SEMUA = transactions.length;
    }
    return c;
  }, [transactions, filter]);

  const verify = async (action: 'approve' | 'reject') => {
    if (!detail) return;
    setProcessing(true);
    try {
      const res = await authFetch('/api/payment-manual/verify', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detail.id, action, reason: action === 'reject' ? rejectReason : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal memverifikasi');
        return;
      }
      toast.success(action === 'approve' ? 'Pembayaran disetujui — langganan diaktifkan' : 'Pembayaran ditolak');
      setDetail(null);
      setRejectOpen(false);
      setApproveOpen(false);
      setRejectReason('');
      load();
    } catch {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <DashboardLayout title="Pembayaran Manual" subtitle="Verifikasi pembayaran transfer bank & QRIS dari pelanggan">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Filter + search */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  filter === f.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/40'
                }`}
              >
                {f.label}
                {filter === 'SEMUA' && f.key === 'SEMUA' && ` (${counts.SEMUA ?? 0})`}
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama, email, no. transaksi..."
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Muat
          </Button>
        </div>

        {/* Tabel */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <FileWarning className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Tidak ada transaksi pada filter ini.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2.5 font-semibold">No. Transaksi</th>
                      <th className="px-3 py-2.5 font-semibold">Tanggal</th>
                      <th className="px-3 py-2.5 font-semibold">Pelanggan</th>
                      <th className="px-3 py-2.5 font-semibold">Paket</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                      <th className="px-3 py-2.5 font-semibold">Metode</th>
                      <th className="px-3 py-2.5 font-semibold">Bukti</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const conf = t.confirmations?.[0];
                      return (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2.5 font-mono text-xs font-bold">{t.transactionNumber}</td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                            {new Date(t.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium leading-tight">{t.customerName}</p>
                            <p className="text-[11px] text-muted-foreground">{t.customerEmail}</p>
                          </td>
                          <td className="px-3 py-2.5 text-xs">{t.planName}<span className="text-muted-foreground"> · {t.durationMonths} bln</span></td>
                          <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{formatRupiahClient(t.totalAmount)}</td>
                          <td className="px-3 py-2.5 text-xs">
                            {t.paymentMethod === 'qris_manual' ? (
                              <span className="inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> QRIS</span>
                            ) : (
                              <span className="inline-flex items-center gap-1"><Landmark className="w-3.5 h-3.5" /> Bank</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {conf ? (
                              <button className="text-primary underline underline-offset-2" onClick={() => setDetail(t)}>
                                Lihat
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${badge(t.paymentStatus)}`}>
                              {statusLabel(t.paymentStatus)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setDetail(t)}>
                              <Eye className="w-3 h-3" /> Detail
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {transactions.map((t) => {
                const conf = t.confirmations?.[0];
                return (
                  <div key={t.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold">{t.transactionNumber}</p>
                        <p className="font-medium text-sm mt-0.5">{t.customerName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{t.customerEmail}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badge(t.paymentStatus)}`}>
                        {statusLabel(t.paymentStatus)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 text-xs">
                      <span className="text-muted-foreground">{t.planName} · {t.durationMonths} bln</span>
                      <span className="font-bold">{formatRupiahClient(t.totalAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[11px] text-muted-foreground">
                        {conf ? `Bukti: ${conf.senderName} (${conf.senderBank})` : 'Belum ada bukti'}
                      </span>
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setDetail(t)}>
                        <Eye className="w-3 h-3" /> Detail
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ===== Dialog verifikasi ===== */}
      {detail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => { setDetail(null); setRejectOpen(false); setApproveOpen(false); }}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold">Verifikasi Pembayaran</h3>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">{detail.transactionNumber}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge(detail.paymentStatus)}`}>
                {statusLabel(detail.paymentStatus)}
              </span>
              <button onClick={() => { setDetail(null); setRejectOpen(false); setApproveOpen(false); }} className="text-muted-foreground hover:text-foreground p-1 -mr-1" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Data pelanggan & tagihan */}
            <div className="space-y-2 text-sm bg-muted/30 rounded-xl p-4">
              <div className="flex justify-between"><span className="text-muted-foreground">Pelanggan</span><span className="font-medium">{detail.customerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium break-all text-right">{detail.customerEmail}</span></div>
              {detail.customerPhone && <div className="flex justify-between"><span className="text-muted-foreground">No. HP</span><span className="font-medium">{detail.customerPhone}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Paket</span><span className="font-medium">{detail.planName} · {detail.durationMonths} bulan</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Tagihan</span><span className="font-bold">{formatRupiahClient(detail.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Metode</span><span className="font-medium">{detail.paymentMethod === 'qris_manual' ? 'QRIS Manual' : 'Transfer Bank'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Batas Waktu</span><span className="font-medium">{new Date(detail.expiresAt).toLocaleString('id-ID')}</span></div>
            </div>

            {/* Bukti transfer */}
            {detail.confirmations?.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Bukti Transfer</h4>
                {(() => {
                  const c = detail.confirmations[0];
                  return (
                    <div className="border rounded-xl overflow-hidden">
                      <div className="bg-muted/30 p-3 space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Nama Pengirim</span><span className="font-medium">{c.senderName}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Bank Asal</span><span className="font-medium">{c.senderBank}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Nominal Dilaporkan</span><span className={`font-bold ${Math.abs(c.transferAmount - detail.totalAmount) > 1 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatRupiahClient(c.transferAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Tanggal Transfer</span><span className="font-medium">{new Date(c.transferDate).toLocaleDateString('id-ID')}</span></div>
                        {c.customerNote && <div className="flex justify-between"><span className="text-muted-foreground">Catatan</span><span className="font-medium text-right">{c.customerNote}</span></div>}
                      </div>
                      {c.proofFileName?.toLowerCase().endsWith('.pdf') ? (
                        <object data={`/api/payment-manual/proof/${c.id}`} type="application/pdf" className="w-full h-72 bg-muted/20">
                          <p className="p-4 text-xs text-muted-foreground text-center">PDF tidak dapat ditampilkan. <a className="underline" href={`/api/payment-manual/proof/${c.id}`} target="_blank">Buka di tab baru</a>.</p>
                        </object>
                      ) : (
                         
                        <img src={`/api/payment-manual/proof/${c.id}`} alt="Bukti transfer" className="w-full max-h-80 object-contain bg-muted/20" />
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="mt-4 text-center text-xs text-muted-foreground bg-muted/30 rounded-xl p-4">
                Pelanggan belum mengirim bukti pembayaran.
              </div>
            )}

            {/* Aksi — hanya untuk WAITING_VERIFICATION */}
            {detail.paymentStatus === 'WAITING_VERIFICATION' && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={() => setApproveOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                  disabled={processing}
                >
                  <Check className="w-4 h-4" /> SETUJUI PEMBAYARAN
                </Button>
                <Button
                  onClick={() => { setRejectOpen(true); setRejectReason(''); }}
                  variant="destructive"
                  className="font-bold gap-2"
                  disabled={processing}
                >
                  <Ban className="w-4 h-4" /> TOLAK PEMBAYARAN
                </Button>
              </div>
            )}

            {detail.paymentStatus === 'PAID' && (
              <p className="mt-4 text-xs text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                Transaksi ini sudah disetujui {detail.verifiedByName ? `oleh ${detail.verifiedByName}` : ''} — langganan aktif.
              </p>
            )}
            {detail.paymentStatus === 'REJECTED' && (
              <p className="mt-4 text-xs text-center text-red-500 font-semibold">
                Transaksi ditolak — menunggu pelanggan mengunggah bukti ulang.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Konfirmasi setujui */}
      {approveOpen && detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setApproveOpen(false)}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold">Setujui Pembayaran?</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {detail.customerName} — {detail.planName} {formatRupiahClient(detail.totalAmount)}.<br />
                  Langganan akan diaktifkan otomatis ({detail.durationMonths} bulan).
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={processing}>Batal</Button>
              <Button onClick={() => verify('approve')} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Setujui'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form alasan tolak */}
      {rejectOpen && detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setRejectOpen(false)}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold">Tolak Pembayaran</h3>
                <p className="text-xs text-muted-foreground mt-1">Alasan wajib diisi — pelanggan akan melihat alasan ini dan dapat mengunggah bukti ulang.</p>
              </div>
            </div>
            <div className="space-y-1.5 mb-1">
              <Label htmlFor="reject-reason" className="text-xs font-semibold">Alasan Penolakan *</Label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Contoh: Nominal transfer tidak sesuai / bukti tidak jelas"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={processing}>Batal</Button>
              <Button onClick={() => verify('reject')} disabled={processing || rejectReason.trim().length < 5} variant="destructive" className="font-bold">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tolak Pembayaran'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
