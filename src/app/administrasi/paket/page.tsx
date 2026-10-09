'use client';

// ADMIN → PENGATURAN PAKET
// Kelola paket berlangganan: nama, harga, durasi, diskon, jumlah akun,
// daftar fitur, aktif/nonaktif. Harga & durasi TIDAK permanen di kode.

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, X, RefreshCw } from 'lucide-react';
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch';

interface Plan {
  id: string;
  planName: string;
  price: number;
  discountPercent: number;
  durationMonths: number;
  maxAccounts: number;
  features: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm = {
  id: '',
  planName: '',
  price: '',
  durationMonths: '1',
  maxAccounts: '2',
  discountPercent: '0',
  featuresText: '',
  isActive: true,
  sortOrder: '10',
};

export default function PengaturanPaketPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/payment-manual/plans?all=1', { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setPlans(data.plans || []);
      else toast.error(data.error || 'Gagal memuat paket');
    } catch {
      toast.error('Gagal memuat paket');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (p: Plan) => {
    let features: string[] = [];
    try { features = JSON.parse(p.features || '[]'); } catch {}
    setForm({
      id: p.id,
      planName: p.planName,
      price: String(p.price),
      durationMonths: String(p.durationMonths),
      maxAccounts: String(p.maxAccounts),
      discountPercent: String(p.discountPercent),
      featuresText: features.join('\n'),
      isActive: p.isActive,
      sortOrder: String(p.sortOrder),
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.planName.trim()) { toast.error('Nama paket wajib diisi'); return; }
    if (!Number(form.price) || Number(form.price) <= 0) { toast.error('Harga harus lebih dari 0'); return; }
    if (!Number(form.durationMonths) || Number(form.durationMonths) <= 0) { toast.error('Durasi harus lebih dari 0'); return; }

    setSaving(true);
    try {
      const payload = {
        planName: form.planName.trim(),
        price: Number(form.price),
        durationMonths: Number(form.durationMonths),
        maxAccounts: Number(form.maxAccounts) || 2,
        discountPercent: Number(form.discountPercent) || 0,
        features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 10,
      };
      const res = form.id
        ? await authFetch(`/api/payment-manual/plans/${form.id}`, { method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await authFetch('/api/payment-manual/plans', { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal menyimpan paket');
        return;
      }
      toast.success(form.id ? 'Paket diperbarui' : 'Paket dibuat');
      setFormOpen(false);
      load();
    } catch {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/payment-manual/plans/${deleteTarget.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal menghapus paket');
        return;
      }
      toast.success(data.message || 'Paket dihapus');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Pengaturan Paket" subtitle="Kelola paket berlangganan Darrellsoft">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted-foreground">Harga & durasi di sini dipakai di halaman Paket dan checkout pelanggan.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Muat</Button>
            <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Tambah Paket</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : plans.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16">Belum ada paket. Klik Tambah Paket.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => {
              let features: string[] = [];
              try { features = JSON.parse(p.features || '[]'); } catch {}
              return (
                <div key={p.id} className={`rounded-xl border bg-card p-4 ${!p.isActive ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold">{p.planName}</h3>
                        {!p.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">Nonaktif</span>}
                        {p.discountPercent > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Diskon {p.discountPercent}%</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.durationMonths} bulan · {p.maxAccounts} akun · {features.length} fitur
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 max-w-md">
                        {features.join(' • ') || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right mr-1">
                        <p className="font-extrabold">Rp {p.price.toLocaleString('id-ID')}</p>
                        <p className="text-[10px] text-muted-foreground">harga dasar</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => openEdit(p)}>
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-red-600 hover:text-red-700" onClick={() => setDeleteTarget(p)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog form paket */}
      {formOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setFormOpen(false)}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">{form.id ? 'Edit Paket' : 'Tambah Paket'}</h3>
              <button onClick={() => setFormOpen(false)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Tutup"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <Label className="text-xs font-semibold">Nama Paket *</Label>
                <Input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} placeholder="Contoh: Tahunan" className="h-10 mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Harga (Rp) *</Label>
                  <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="h-10 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Durasi (bulan) *</Label>
                  <Input type="number" min={1} value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: e.target.value })} className="h-10 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Jumlah Akun</Label>
                  <Input type="number" min={1} value={form.maxAccounts} onChange={(e) => setForm({ ...form, maxAccounts: e.target.value })} className="h-10 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Diskon (%)</Label>
                  <Input type="number" min={0} max={90} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} className="h-10 mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Fitur yang Diperoleh <span className="text-muted-foreground font-normal">(satu per baris)</span></Label>
                <textarea
                  value={form.featuresText}
                  onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
                  rows={5}
                  placeholder={'Semua fitur akuntansi\nPriority support'}
                  className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label className="text-xs font-semibold">Urutan Tampil</Label>
                  <Input type="number" min={1} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="h-10 mt-1" />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-2">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-[var(--primary)] w-4 h-4" />
                  Paket aktif (tampil ke pelanggan)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Batal</Button>
                <Button onClick={save} disabled={saving} className="font-bold">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Paket'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card border rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">Hapus paket &ldquo;{deleteTarget.planName}&rdquo;?</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Jika paket sudah dipakai transaksi, paket hanya akan dinonaktifkan agar riwayat transaksi tetap utuh.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>Batal</Button>
              <Button variant="destructive" onClick={doDelete} disabled={saving} className="font-bold">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
