"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock,
  Hash,
  Info,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { AdminGate, AdminShell } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, SubscriptionApiError } from "@/lib/subscription-client";
import { formatDuration, formatRupiah } from "@/lib/subscription-format";
import { cn } from "@/lib/utils";

/* ===================== Tipe data ===================== */

type AdminPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthlyPrice: number;
  originalPrice: number | null;
  features: string[];
  maxAccounts: number;
  durationDays: number;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
  activeSubscribers: number;
};

type PlanFormState = {
  name: string;
  description: string;
  monthlyPrice: string;
  originalPrice: string;
  durationDays: string;
  maxAccounts: string;
  featuresText: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: string;
};

const EMPTY_FORM: PlanFormState = {
  name: "",
  description: "",
  monthlyPrice: "0",
  originalPrice: "",
  durationDays: "30",
  maxAccounts: "3",
  featuresText: "",
  isPopular: false,
  isActive: true,
  sortOrder: "0",
};

/* ===================== Halaman ===================== */

export default function PaketPage() {
  return (
    <AdminShell>
      <AdminGate>
        <PaketContent />
      </AdminGate>
    </AdminShell>
  );
}

function PaketContent() {
  const { toast } = useToast();

  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Dialog form create/edit
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPlan | null>(null);

  // Hapus
  const [deleting, setDeleting] = useState<AdminPlan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ plans: AdminPlan[] }>("/api/panel-admin/plans");
      setPlans(res.plans);
    } catch (e) {
      setPlans([]);
      toast({
        variant: "destructive",
        title: "Gagal memuat paket",
        description: e instanceof Error ? e.message : "Coba lagi nanti.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans, reloadKey]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(plan: AdminPlan) {
    setEditing(plan);
    setFormOpen(true);
  }

  async function handleToggleActive(plan: AdminPlan, next: boolean) {
    if (togglingId) return;
    setTogglingId(plan.id);
    try {
      await apiFetch("/api/panel-admin/plans", {
        method: "PUT",
        json: { id: plan.id, isActive: next },
      });
      toast({
        title: "Berhasil",
        description: `Paket ${plan.name} ${next ? "diaktifkan" : "dinonaktifkan"}.`,
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Gagal mengubah status paket",
        description: e instanceof Error ? e.message : "Coba lagi nanti.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        deleted?: boolean;
        deactivated?: boolean;
        message?: string;
      }>(`/api/panel-admin/plans?id=${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });
      if (res.deactivated) {
        // Paket punya riwayat — server menonaktifkan alih-alih menghapus
        toast({
          title: "Paket dinonaktifkan",
          description: res.message ?? "Paket memiliki riwayat tagihan sehingga hanya dinonaktifkan.",
        });
      } else {
        toast({ title: "Berhasil", description: `Paket ${deleting.name} dihapus.` });
      }
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Paket tidak bisa dihapus",
        description: e instanceof Error ? e.message : "Coba lagi nanti.",
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kelola Paket</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atur paket langganan, harga, dan fitur yang ditawarkan kepada pelanggan.
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Mengubah harga paket TIDAK mengubah tagihan yang sudah dibuat — harga tersimpan
            sebagai snapshot di tagihan.
          </p>
        </div>
        <Button className="min-h-[44px] gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Tambah Paket
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="p-6">
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <ReceiptText className="size-8 opacity-50" />
            <p className="text-sm">
              Belum ada paket. Klik “Tambah Paket” untuk membuat paket pertama.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const discount =
              plan.originalPrice && plan.originalPrice > plan.monthlyPrice && plan.monthlyPrice > 0
                ? Math.round((1 - plan.monthlyPrice / plan.originalPrice) * 100)
                : null;
            return (
              <Card
                key={plan.id}
                className={cn("flex flex-col gap-0", !plan.isActive && "opacity-75")}
              >
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  {/* Baris nama + badge */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-base font-semibold">{plan.name}</h2>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {plan.slug}
                    </Badge>
                    {plan.isPopular && (
                      <Badge className="gap-1 border-transparent bg-amber-100 text-amber-900 hover:bg-amber-100">
                        <Star className="size-3 fill-amber-500 text-amber-500" />
                        Terpopuler
                      </Badge>
                    )}
                    {plan.slug === "trial" && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Trial
                      </Badge>
                    )}
                    {!plan.isActive && (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        Nonaktif
                      </Badge>
                    )}
                  </div>

                  {/* Harga */}
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {formatRupiah(plan.monthlyPrice)}
                    </span>
                    {plan.originalPrice !== null && plan.originalPrice > plan.monthlyPrice && (
                      <>
                        <span className="text-sm text-muted-foreground line-through tabular-nums">
                          {formatRupiah(plan.originalPrice)}
                        </span>
                        {discount !== null && (
                          <Badge className="border-transparent bg-amber-100 text-amber-900 hover:bg-amber-100">
                            Hemat {discount}%
                          </Badge>
                        )}
                      </>
                    )}
                  </div>

                  <p className="line-clamp-2 text-sm text-muted-foreground">{plan.description}</p>

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {formatDuration(plan.durationDays)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      Hingga {plan.maxAccounts} akun
                    </span>
                  </div>

                  {/* Fitur */}
                  {plan.features.length > 0 && (
                    <ul className="space-y-1.5">
                      {plan.features.slice(0, 6).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span className="min-w-0">{f}</span>
                        </li>
                      ))}
                      {plan.features.length > 6 && (
                        <li className="pl-6 text-xs text-muted-foreground">
                          dan {plan.features.length - 6} fitur lainnya
                        </li>
                      )}
                    </ul>
                  )}

                  {/* Footer kartu: riwayat + switch */}
                  <div className="mt-auto space-y-3 border-t pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {plan.activeSubscribers} pelanggan
                      </span>
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        Aktif
                        <Switch
                          checked={plan.isActive}
                          disabled={togglingId === plan.id}
                          onCheckedChange={(v) => void handleToggleActive(plan, v)}
                          aria-label={`Aktifkan paket ${plan.name}`}
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {plan.activeSubscribers === 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleting(plan)}
                        >
                          <Trash2 className="size-4" />
                          Hapus
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Dinonaktifkan saja (punya riwayat)
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] gap-2"
                        onClick={() => openEdit(plan)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog form create/edit */}
      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => {
          setFormOpen(false);
          setReloadKey((k) => k + 1);
        }}
      />

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus paket {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Paket akan dihapus permanen dan tidak bisa dikembalikan. Paket yang sudah memiliki
              riwayat tagihan tidak dapat dihapus — server akan menonaktifkannya saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteBusy && <Loader2 className="size-4 animate-spin" />}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ===================== Dialog form paket ===================== */

function PlanFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminPlan | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Prefill saat membuka dialog
  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description,
        monthlyPrice: String(editing.monthlyPrice),
        originalPrice: editing.originalPrice === null ? "" : String(editing.originalPrice),
        durationDays: String(editing.durationDays),
        maxAccounts: String(editing.maxAccounts),
        featuresText: editing.features.join("\n"),
        isPopular: editing.isPopular,
        isActive: editing.isActive,
        sortOrder: String(editing.sortOrder),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editing]);

  function set<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (saving) return;

    // ===== Validasi client (mengikuti kontrak /api/panel-admin/plans) =====
    const errors: Record<string, string> = {};
    const name = form.name.trim();
    const description = form.description.trim();
    const monthlyPrice = Number(form.monthlyPrice);
    const originalRaw = form.originalPrice.trim();
    const durationDays = Number(form.durationDays);
    const maxAccounts = Number(form.maxAccounts);
    const sortOrder = Number(form.sortOrder === "" ? "0" : form.sortOrder);
    const features = form.featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (name.length < 2 || name.length > 50) errors.name = "Nama paket 2–50 karakter";
    if (description.length < 5 || description.length > 300) {
      errors.description = "Deskripsi 5–300 karakter";
    }
    if (!Number.isInteger(monthlyPrice) || monthlyPrice < 0) {
      errors.monthlyPrice = "Harga harus bilangan bulat ≥ 0";
    }
    if (originalRaw !== "" && (!Number.isInteger(Number(originalRaw)) || Number(originalRaw) < 0)) {
      errors.originalPrice = "Harga asli harus bilangan bulat ≥ 0";
    }
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
      errors.durationDays = "Durasi 1–3650 hari";
    }
    if (!Number.isInteger(maxAccounts) || maxAccounts < 1 || maxAccounts > 10000) {
      errors.maxAccounts = "Batas akun 1–10000";
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
      errors.sortOrder = "Urutan 0–999";
    }
    if (features.length > 30) errors.featuresText = "Maksimal 30 fitur";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name,
        description,
        monthlyPrice,
        originalPrice: originalRaw === "" ? null : Number(originalRaw),
        features,
        maxAccounts,
        durationDays,
        isActive: form.isActive,
        isPopular: form.isPopular,
        sortOrder,
      };
      // Slug dibuat otomatis server (dari nama) — tidak dikirim dari form.
      const res = editing
        ? await apiFetch<{ success: boolean; plan: AdminPlan }>("/api/panel-admin/plans", {
            method: "PUT",
            json: { id: editing.id, ...payload },
          })
        : await apiFetch<{ success: boolean; plan: AdminPlan }>("/api/panel-admin/plans", {
            method: "POST",
            json: payload,
          });
      toast({
        title: "Berhasil",
        description: res.plan?.name
          ? editing
            ? `Paket ${res.plan.name} diperbarui.`
            : `Paket ${res.plan.name} ditambahkan.`
          : editing
            ? "Paket diperbarui."
            : "Paket ditambahkan.",
      });
      onSaved();
    } catch (e) {
      if (
        e instanceof SubscriptionApiError &&
        e.fieldErrors &&
        Object.keys(e.fieldErrors).length > 0
      ) {
        setFieldErrors(e.fieldErrors);
      }
      toast({
        variant: "destructive",
        title: editing ? "Gagal memperbarui paket" : "Gagal menambah paket",
        description: e instanceof Error ? e.message : "Coba lagi nanti.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Paket: ${editing.name}` : "Tambah Paket"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Perubahan harga tidak memengaruhi tagihan lama (snapshot)."
              : "Buat paket langganan baru untuk katalog pelanggan."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nama Paket" error={fieldErrors.name} htmlFor="plan-name">
            <Input
              id="plan-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Paket Pro"
            />
          </FormField>
          {/* Slug hanya tampil saat edit — dibuat otomatis server dari nama */}
          {editing ? (
            <FormField label="Slug (otomatis)" htmlFor="plan-slug">
              <div className="flex items-center gap-2">
                <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  id="plan-slug"
                  value={editing.slug}
                  disabled
                  className="font-mono"
                  aria-readonly
                />
              </div>
            </FormField>
          ) : (
            <div aria-hidden className="hidden sm:block" />
          )}
          <FormField
            label="Deskripsi"
            error={fieldErrors.description}
            htmlFor="plan-description"
            className="sm:col-span-2"
          >
            <Textarea
              id="plan-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Untuk usaha percetakan yang sedang berkembang…"
              rows={3}
            />
          </FormField>
          <FormField
            label="Harga Berlaku (Rp)"
            error={fieldErrors.monthlyPrice}
            htmlFor="plan-price"
          >
            <Input
              id="plan-price"
              type="number"
              min={0}
              value={form.monthlyPrice}
              onChange={(e) => set("monthlyPrice", e.target.value)}
            />
          </FormField>
          <FormField
            label="Harga Asli (Rp, kosongkan bila tidak ada)"
            error={fieldErrors.originalPrice}
            htmlFor="plan-original-price"
          >
            <Input
              id="plan-original-price"
              type="number"
              min={0}
              value={form.originalPrice}
              onChange={(e) => set("originalPrice", e.target.value)}
              placeholder="Misal 299000"
            />
          </FormField>
          <FormField label="Durasi (hari)" error={fieldErrors.durationDays} htmlFor="plan-duration">
            <Input
              id="plan-duration"
              type="number"
              min={1}
              value={form.durationDays}
              onChange={(e) => set("durationDays", e.target.value)}
            />
          </FormField>
          <FormField
            label="Batas Akun"
            error={fieldErrors.maxAccounts}
            htmlFor="plan-max-accounts"
          >
            <Input
              id="plan-max-accounts"
              type="number"
              min={1}
              value={form.maxAccounts}
              onChange={(e) => set("maxAccounts", e.target.value)}
            />
          </FormField>
          <FormField
            label="Fitur (satu fitur per baris)"
            error={fieldErrors.featuresText}
            htmlFor="plan-features"
            className="sm:col-span-2"
          >
            <Textarea
              id="plan-features"
              value={form.featuresText}
              onChange={(e) => set("featuresText", e.target.value)}
              placeholder={"Kasir & invoice\nManajemen stok\nLaporan penjualan"}
              rows={5}
            />
          </FormField>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="plan-is-popular">Terpopuler</Label>
              <p className="text-xs text-muted-foreground">
                Ditandai di halaman pilih paket (satu paket saja)
              </p>
            </div>
            <Switch
              id="plan-is-popular"
              checked={form.isPopular}
              onCheckedChange={(v) => set("isPopular", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="plan-is-active">Aktif</Label>
              <p className="text-xs text-muted-foreground">
                Paket nonaktif tidak muncul di halaman pilih paket
              </p>
            </div>
            <Switch
              id="plan-is-active"
              checked={form.isActive}
              onCheckedChange={(v) => set("isActive", v)}
            />
          </div>
          <FormField label="Urutan Tampil" error={fieldErrors.sortOrder} htmlFor="plan-sort">
            <Input
              id="plan-sort"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
              className="max-w-32"
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Simpan Perubahan" : "Tambah Paket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
