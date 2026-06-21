'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Building2, MapPin, Phone, Mail, Hash, Landmark, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { authFetch } from '@/lib/auth-fetch';

interface CompanyDataPopupProps {
  /** Force open regardless of query param (used when triggered manually) */
  forceOpen?: boolean;
  /** Called when popup is closed (either after save or skip) */
  onClose?: () => void;
}

/**
 * CompanyDataPopup — modal yang memaksa user demo baru mengisi Data Perusahaan.
 *
 * Trigger:
 * - URL berisi query param `?fill_company=1` (dari redirect checkout setelah demo register)
 * - ATAU localStorage `companyDataRequired=true` (persisten sampai diisi)
 *
 * User bisa "Lewati dulu" → popup tutup untuk sesi ini (sessionStorage flag),
 * tapi akan muncul lagi di sesi berikutnya sampai data perusahaan diisi.
 */
export function CompanyDataPopup({ forceOpen = false, onClose }: CompanyDataPopupProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nama: '',
    alamat: '',
    telepon: '',
    email: '',
    npwp: '',
    bankName: '',
    bankAccount: '',
    bankHolder: '',
  });

  // Deteksi trigger: query param ?fill_company=1 atau localStorage flag
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    // Cek query param
    const params = new URLSearchParams(window.location.search);
    const fillCompany = params.get('fill_company');
    // Cek sessionStorage flag (sudah skip sesi ini)
    const skipped = sessionStorage.getItem('companyPopupSkipped') === 'true';
    // Cek localStorage flag (persisten)
    const required = localStorage.getItem('companyDataRequired') === 'true';

    if (fillCompany === '1' && !skipped) {
      setOpen(true);
      // Set persistent flag
      localStorage.setItem('companyDataRequired', 'true');
      // Bersihkan query param dari URL tanpa reload
      params.delete('fill_company');
      const newUrl = pathname + (params.toString() ? `?${params.toString()}` : '');
      router.replace(newUrl);
    } else if (required && !skipped) {
      setOpen(true);
    }
  }, [forceOpen, pathname, router]);

  const handleSave = async () => {
    // Validasi minimal: nama + telepon + alamat
    if (!form.nama.trim()) {
      toast.error('Nama perusahaan wajib diisi');
      return;
    }
    if (!form.telepon.trim()) {
      toast.error('Nomor telepon wajib diisi');
      return;
    }
    if (!form.alamat.trim()) {
      toast.error('Alamat perusahaan wajib diisi');
      return;
    }

    setLoading(true);
    try {
      // Simpan semua field ke settings API
      const settings: Record<string, string> = {
        company_name: form.nama.trim(),
        company_address: form.alamat.trim(),
        company_phone: form.telepon.trim(),
        company_email: form.email.trim(),
        npwp: form.npwp.trim(),
        bank_name: form.bankName.trim(),
        bank_account: form.bankAccount.trim(),
        bank_holder: form.bankHolder.trim(),
      };

      const responses = await Promise.all(
        Object.entries(settings).map(([key, value]) =>
          authFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
          })
        )
      );

      const allOk = responses.every((r) => r.ok);
      if (!allOk) throw new Error('Beberapa pengaturan gagal disimpan');

      // Clear flags
      localStorage.removeItem('companyDataRequired');
      sessionStorage.setItem('companyPopupFilled', 'true');

      toast.success('Data perusahaan berhasil disimpan!');
      setOpen(false);
      if (onClose) onClose();

      // Trigger refresh agar komponen lain (invoice, surat jalan) dapat data terbaru
      window.dispatchEvent(new CustomEvent('company-data-updated'));
    } catch (err) {
      console.error('Save company data error:', err);
      toast.error('Gagal menyimpan data perusahaan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem('companyPopupSkipped', 'true');
    setOpen(false);
    if (onClose) onClose();
    toast.info(' Anda bisa mengisi data perusahaan nanti di menu Pengaturan');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div
        className="relative bg-card rounded-2xl shadow-2xl border border-border max-w-lg w-full my-auto animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-popup-title"
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 sm:p-6 border-b border-border">
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="company-popup-title" className="text-lg font-bold text-foreground flex items-center gap-2">
              Lengkapi Data Perusahaan
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 uppercase">
                <Sparkles className="w-3 h-3" /> Penting
              </span>
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
              Data perusahaan akan dipakai pada invoice, surat jalan, dan dokumen cetakan lainnya. Mohon dilengkapi.
            </p>
          </div>
        </div>

        {/* Body — form */}
        <div className="p-5 sm:p-6 max-h-[60vh] overflow-y-auto">
          <div className="space-y-4">
            {/* Nama Perusahaan * */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-nama" className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                Nama Perusahaan <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cp-nama"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="PT. Contoh Perusahaan"
                autoFocus
              />
            </div>

            {/* Alamat * */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-alamat" className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                Alamat <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="cp-alamat"
                value={form.alamat}
                onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                placeholder="Jl. Contoh No. 123, Kota, Provinsi"
                rows={2}
              />
            </div>

            {/* Telepon * + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-telepon" className="text-sm font-medium flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  Telepon <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="cp-telepon"
                  value={form.telepon}
                  onChange={(e) => setForm({ ...form, telepon: e.target.value })}
                  placeholder="021-1234567"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-email" className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="cp-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="info@perusahaan.com"
                />
              </div>
            </div>

            {/* NPWP */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-npwp" className="text-sm font-medium flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                NPWP
              </Label>
              <Input
                id="cp-npwp"
                value={form.npwp}
                onChange={(e) => setForm({ ...form, npwp: e.target.value })}
                placeholder="01.234.567.8-901.000"
              />
            </div>

            {/* Bank (opsional) */}
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" />
                Rekening Bank (Opsional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-bank-name" className="text-xs font-medium">Nama Bank</Label>
                  <Input
                    id="cp-bank-name"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    placeholder="BCA / Mandiri / BNI"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-bank-account" className="text-xs font-medium">Nomor Rekening</Label>
                  <Input
                    id="cp-bank-account"
                    value={form.bankAccount}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                    placeholder="1234567890"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cp-bank-holder" className="text-xs font-medium">Nama Pemilik Rekening</Label>
                  <Input
                    id="cp-bank-holder"
                    value={form.bankHolder}
                    onChange={(e) => setForm({ ...form, bankHolder: e.target.value })}
                    placeholder="PT. Contoh Perusahaan"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 border-t border-border flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sm:items-center">
          <button
            onClick={handleSkip}
            disabled={loading}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-3 text-center"
          >
            Lewati dulu
          </button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold sm:min-w-[180px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Simpan Data Perusahaan
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
