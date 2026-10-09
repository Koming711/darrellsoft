'use client';

// ADMIN → PENGATURAN PEMBAYARAN
// Atur rekening transfer, QRIS, petunjuk pembayaran, batas waktu, dan
// aktif/nonaktif metode. Info ini otomatis tampil di checkout pelanggan.

import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Save, Landmark, QrCode, Upload, X, RefreshCw, ImageIcon, Clock } from 'lucide-react';
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch';

interface PaymentSettings {
  id?: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrisProviderName: string;
  qrisImageUrl: string;
  paymentInstructions: string;
  paymentDeadlineHours: number;
  bankTransferEnabled: boolean;
  qrisEnabled: boolean;
  isActive: boolean;
}

export default function PengaturanPembayaranPage() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const qrisInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/payment-manual/settings', { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok && data.settings) setSettings(data.settings);
      else if (res.ok) {
        setSettings({
          bankName: '', accountName: '', accountNumber: '', qrisProviderName: '', qrisImageUrl: '',
          paymentInstructions: '', paymentDeadlineHours: 24, bankTransferEnabled: true, qrisEnabled: true, isActive: true,
        });
      } else toast.error(data.error || 'Gagal memuat pengaturan');
    } catch {
      toast.error('Gagal memuat pengaturan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleQrisFile = (f: File | null) => {
    if (!f || !settings) return;
    if (!f.type.startsWith('image/')) { toast.error('QRIS harus berupa gambar (PNG/JPG)'); return; }
    if (f.size > 1024 * 1024) { toast.error('Ukuran gambar QRIS maksimal 1MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setSettings({ ...settings, qrisImageUrl: String(reader.result) });
    reader.readAsDataURL(f);
  };

  const save = async () => {
    if (!settings) return;
    if (settings.bankTransferEnabled && (!settings.bankName.trim() || !settings.accountNumber.trim() || !settings.accountName.trim())) {
      toast.error('Nama bank, nomor rekening, dan nama pemilik wajib diisi bila Transfer Bank aktif');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/payment-manual/settings', {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Gagal menyimpan'); return; }
      toast.success('Pengaturan pembayaran tersimpan — tampil otomatis di checkout pelanggan');
      setSettings(data.settings);
    } catch {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <DashboardLayout title="Pengaturan Pembayaran">
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Pengaturan Pembayaran" subtitle="Rekening transfer & QRIS untuk pembayaran manual">
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
        {/* ===== Transfer Bank ===== */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">Transfer Bank</h3>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.bankTransferEnabled}
                onChange={(e) => setSettings({ ...settings, bankTransferEnabled: e.target.checked })}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              Aktifkan metode
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <Label className="text-xs font-semibold">Nama Bank *</Label>
              <Input value={settings.bankName} onChange={(e) => setSettings({ ...settings, bankName: e.target.value })} placeholder="Contoh: Bank BCA" className="h-10 mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Nama Pemilik Rekening *</Label>
              <Input value={settings.accountName} onChange={(e) => setSettings({ ...settings, accountName: e.target.value })} placeholder="Contoh: Darrell Soft" className="h-10 mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold">Nomor Rekening *</Label>
              <Input value={settings.accountNumber} onChange={(e) => setSettings({ ...settings, accountNumber: e.target.value })} placeholder="Contoh: 1234567890" className="h-10 mt-1 font-mono" />
            </div>
          </div>
        </div>

        {/* ===== QRIS ===== */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">QRIS Manual</h3>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.qrisEnabled}
                onChange={(e) => setSettings({ ...settings, qrisEnabled: e.target.checked })}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              Aktifkan metode
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold">Nama Penyedia QRIS</Label>
              <Input value={settings.qrisProviderName} onChange={(e) => setSettings({ ...settings, qrisProviderName: e.target.value })} placeholder="Contoh: QRIS Darrell Soft" className="h-10 mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1.5">Gambar QRIS maksimal 1MB (PNG/JPG).</p>
              <input ref={qrisInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => handleQrisFile(e.target.files?.[0] ?? null)} />
              <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => qrisInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Unggah Gambar QRIS
              </Button>
            </div>
            <div className="flex items-start justify-center">
              {settings.qrisImageUrl ? (
                <div className="relative">
                  { }
                  <img src={settings.qrisImageUrl} alt="QRIS" className="max-h-44 rounded-xl border bg-white p-2" />
                  <button
                    onClick={() => setSettings({ ...settings, qrisImageUrl: '' })}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                    aria-label="Hapus QRIS"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="h-44 w-36 rounded-xl border border-dashed flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <span className="text-[11px]">Belum ada gambar</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Petunjuk & batas waktu ===== */}
        <div className="rounded-xl border bg-card p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Petunjuk & Batas Waktu</h3>
          </div>
          <div>
            <Label className="text-xs font-semibold">Petunjuk Pembayaran (tampil di checkout)</Label>
            <textarea
              value={settings.paymentInstructions}
              onChange={(e) => setSettings({ ...settings, paymentInstructions: e.target.value })}
              rows={3}
              className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Silakan transfer sesuai nominal yang tertera. Setelah transfer, unggah bukti pembayaran untuk diverifikasi oleh admin Darrellsoft."
            />
          </div>
          <div className="max-w-[220px]">
            <Label className="text-xs font-semibold">Batas Waktu Pembayaran (jam)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={settings.paymentDeadlineHours}
              onChange={(e) => setSettings({ ...settings, paymentDeadlineHours: Number(e.target.value) })}
              className="h-10 mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Transaksi melewati batas waktu berstatus Kedaluwarsa.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pb-4">
          <Button variant="outline" onClick={load} disabled={saving} className="gap-1.5"><RefreshCw className="w-4 h-4" /> Reset</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5 font-bold min-w-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Simpan Pengaturan</>}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
