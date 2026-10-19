"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, QrCode, Save, ShieldCheck, Trash2 } from "lucide-react";
import { AdminGate, AdminShell } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/subscription-client";

/* ===================== Tipe data ===================== */

type PaymentSettings = {
  qrisImageUrl: string | null;
  qrisReceiverName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  paymentInstructions: string | null;
  paymentDueHours: number;
  gracePeriodDays: number;
};

const MAX_QRIS_BYTES = 500 * 1024; // 500KB — batas server

/* ===================== Halaman ===================== */

export default function PengaturanPembayaranPage() {
  return (
    <AdminShell>
      <AdminGate>
        <PengaturanContent />
      </AdminGate>
    </AdminShell>
  );
}

function PengaturanContent() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrisData, setQrisData] = useState<string | null>(null);
  const [qrisReceiverName, setQrisReceiverName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [dueHours, setDueHours] = useState("24");
  const [graceDays, setGraceDays] = useState("7");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ settings: PaymentSettings }>(
          "/api/panel-admin/payment-settings"
        );
        if (cancelled) return;
        const s = res.settings;
        setQrisData(s.qrisImageUrl || null);
        setQrisReceiverName(s.qrisReceiverName ?? "");
        setBankName(s.bankName ?? "");
        setBankAccountNumber(s.bankAccountNumber ?? "");
        setBankAccountName(s.bankAccountName ?? "");
        setPaymentInstructions(s.paymentInstructions ?? "");
        setDueHours(String(s.paymentDueHours ?? 24));
        setGraceDays(String(s.gracePeriodDays ?? 7));
      } catch (e) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Gagal memuat pengaturan",
            description: e instanceof Error ? e.message : "Coba lagi nanti.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function handleQrisFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Format tidak didukung",
        description: "QRIS harus berupa gambar (JPG, PNG, atau WEBP).",
      });
      return;
    }
    if (file.size > MAX_QRIS_BYTES) {
      toast({
        variant: "destructive",
        title: "Ukuran gambar terlalu besar",
        description: "Ukuran gambar QRIS maksimal 500KB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setQrisData(reader.result);
    };
    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "Gagal membaca file",
        description: "Coba pilih gambar lain.",
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (saving) return;

    const hours = Number(dueHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      setFormError("Batas waktu pembayaran harus 1–720 jam.");
      return;
    }
    const grace = Number(graceDays);
    if (!Number.isInteger(grace) || grace < 0 || grace > 90) {
      setFormError("Masa tenggang harus 0–90 hari.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch<{ success: boolean; settings: PaymentSettings }>(
        "/api/panel-admin/payment-settings",
        {
          method: "PUT",
          json: {
            qrisImageUrl: qrisData ?? "",
            qrisReceiverName: qrisReceiverName.trim(),
            bankName: bankName.trim(),
            bankAccountNumber: bankAccountNumber.replace(/\s/g, ""),
            bankAccountName: bankAccountName.trim(),
            paymentInstructions,
            paymentDueHours: hours,
            gracePeriodDays: grace,
          },
        }
      );
      toast({ title: "Berhasil", description: "Pengaturan pembayaran tersimpan." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan pengaturan",
        description: e instanceof Error ? e.message : "Coba lagi nanti.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-40 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan Pembayaran</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur QRIS, rekening bank, instruksi, dan batas waktu pembayaran tagihan pelanggan.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ===== QRIS ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="size-4 text-primary" />
              QRIS
            </CardTitle>
            <CardDescription>
              Gambar QRIS ditampilkan ke pelanggan saat memilih metode pembayaran QRIS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qrisData ? (
              <div className="space-y-3">
                <img
                  src={qrisData}
                  alt="Gambar QRIS"
                  className="h-40 rounded-lg border object-contain"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-[44px] gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageUp className="size-4" />
                    Ganti Gambar
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-[44px] gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setQrisData(null)}
                  >
                    <Trash2 className="size-4" />
                    Hapus QRIS
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ImageUp className="size-6" />
                Unggah gambar QRIS (maksimal 500KB)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleQrisFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <div className="space-y-1.5">
              <Label htmlFor="qris-receiver">Nama Penerima QRIS</Label>
              <Input
                id="qris-receiver"
                value={qrisReceiverName}
                onChange={(e) => setQrisReceiverName(e.target.value)}
                placeholder="CV Darrellsoft Digital"
                maxLength={120}
              />
            </div>
          </CardContent>
        </Card>

        {/* ===== Bank + aturan ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rekening Bank &amp; Aturan Tagihan</CardTitle>
            <CardDescription>
              Ditampilkan pada halaman instruksi pembayaran transfer bank.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank-name">Nama Bank</Label>
              <Input
                id="bank-name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="BCA"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-number">Nomor Rekening</Label>
              <Input
                id="bank-number"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="1234567890"
                inputMode="numeric"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-holder">Nama Pemilik Rekening</Label>
              <Input
                id="bank-holder"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                placeholder="CV Darrellsoft Digital"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-instructions">Instruksi Pembayaran</Label>
              <Textarea
                id="payment-instructions"
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                placeholder="Contoh: Transfer sesuai nominal tagihan (termasuk kode unik), lalu unggah bukti pembayaran (file JPG/PNG)."
                rows={4}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                Ditampilkan pada halaman pembayaran pelanggan (maksimal 2000 karakter).
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="unique-code">Kode Unik Tagihan</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Kode unik selalu aktif — 3 digit ditambahkan ke total transfer agar mudah
                    dikenali.
                  </p>
                </div>
                <Switch id="unique-code" checked disabled aria-readonly />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due-hours">Batas Waktu Pembayaran (jam)</Label>
              <Input
                id="due-hours"
                type="number"
                min={1}
                max={720}
                value={dueHours}
                onChange={(e) => setDueHours(e.target.value)}
                className="max-w-40"
              />
              <p className="text-xs text-muted-foreground">
                Batas waktu pembayaran tagihan (jam), 1–720 jam.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grace-days" className="gap-1.5">
                <ShieldCheck className="size-3.5 text-muted-foreground" />
                Masa Tenggang (hari)
              </Label>
              <Input
                id="grace-days"
                type="number"
                min={0}
                max={90}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                className="max-w-40"
              />
              <p className="text-xs text-muted-foreground">
                Toleransi akses setelah langganan kedaluwarsa (0–90 hari).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div className="flex justify-end">
        <Button
          className="min-h-[44px] gap-2"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
