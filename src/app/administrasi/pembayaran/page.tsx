"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  ExternalLink,
  FileText,
  Loader2,
  ReceiptText,
  Search,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, SubscriptionApiError } from "@/lib/subscription-client";
import {
  formatDate,
  formatDateTime,
  formatRupiah,
  formatUniqueCode,
} from "@/lib/subscription-format";
import { cn } from "@/lib/utils";

/* ===================== Tipe data ===================== */

type StatusFilter = "ALL" | "menunggu_verifikasi" | "disetujui" | "ditolak";

type AdminPayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  planName: string;
  invoiceAmount: number;
  uniqueCode: number | null;
  isPlanChange: boolean;
  userId: string;
  customer: {
    username: string;
    namaLengkap: string;
    email: string;
    nomorHP: string;
  } | null;
  paymentMethod: string;
  amount: number;
  senderName: string | null;
  transferDate: string | null;
  proofFileName: string | null;
  hasProof: boolean;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

type AuditLogEntry = {
  id: string;
  userId: string | null;
  invoiceId: string | null;
  action: string;
  oldStatus: string;
  newStatus: string;
  performedBy: string;
  notes: string;
  createdAt: string;
  customer: { id: string; username: string; namaLengkap: string } | null;
};

type ProofData = { proofFileUrl: string; proofFileName: string | null };

/* ===================== Konstanta tampilan ===================== */

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "menunggu_verifikasi", label: "Menunggu Verifikasi" },
  { value: "disetujui", label: "Disetujui" },
  { value: "ditolak", label: "Ditolak" },
];

const AUDIT_LABELS: Record<string, string> = {
  invoice_created: "Tagihan dibuat",
  payment_submitted: "Bukti pembayaran dikirim",
  payment_approved: "Disetujui",
  payment_rejected: "Ditolak",
  subscription_activated: "Langganan aktif",
  plan_created: "Paket dibuat",
  plan_updated: "Paket diubah",
  settings_updated: "Pengaturan diubah",
};

function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

function paymentMethodLabel(method: string | null): string {
  if (method === "qris") return "QRIS";
  if (method === "transfer_bank") return "Transfer Bank";
  return method ?? "-";
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "menunggu_verifikasi":
      return (
        <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
          Menunggu Verifikasi
        </Badge>
      );
    case "disetujui":
      return (
        <Badge className="border-transparent bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
          Disetujui
        </Badge>
      );
    case "ditolak":
      return <Badge variant="destructive">Ditolak</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function emptyMessage(tab: StatusFilter, searching: boolean): string {
  if (searching) return "Tidak ada pembayaran yang cocok dengan pencarian.";
  switch (tab) {
    case "menunggu_verifikasi":
      return "Tidak ada pembayaran yang menunggu verifikasi.";
    case "disetujui":
      return "Belum ada pembayaran yang disetujui.";
    case "ditolak":
      return "Belum ada pembayaran yang ditolak.";
    default:
      return "Belum ada pembayaran masuk.";
  }
}

/* ===================== Halaman ===================== */

export default function PembayaranPage() {
  return (
    <AdminShell>
      <AdminGate>
        <PembayaranContent />
      </AdminGate>
    </AdminShell>
  );
}

function PembayaranContent() {
  const { toast } = useToast();

  const [tab, setTab] = useState<StatusFilter>("menunggu_verifikasi");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminPayment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Dialog detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AdminPayment | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [auditScope, setAuditScope] = useState<"invoice" | "user">("invoice");
  const [auditLoading, setAuditLoading] = useState(false);
  const [proof, setProof] = useState<ProofData | null>(null);
  const [proofState, setProofState] = useState<"idle" | "loading" | "error">("idle");
  const [proofObjectUrl, setProofObjectUrl] = useState<string | null>(null);

  // Aksi approve / reject
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const requestSeq = useRef(0);

  // Debounce pencarian 400ms
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Satu fetch tanpa filter — hitung tab & pencarian di sisi klien
  const loadList = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const res = await apiFetch<{ payments: AdminPayment[] }>(
        "/api/panel-admin/payments?limit=100"
      );
      if (seq !== requestSeq.current) return;
      setRows(res.payments);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setRows([]);
      toast({
        variant: "destructive",
        title: "Gagal memuat pembayaran",
        description: e instanceof Error ? e.message : "Coba lagi nanti.",
      });
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadList();
  }, [loadList, reloadKey]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      ALL: all.length,
      menunggu_verifikasi: all.filter((r) => r.status === "menunggu_verifikasi").length,
      disetujui: all.filter((r) => r.status === "disetujui").length,
      ditolak: all.filter((r) => r.status === "ditolak").length,
    } as Record<StatusFilter, number>;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const all = rows ?? [];
    const q = search.toLowerCase();
    return all.filter((r) => {
      if (tab !== "ALL" && r.status !== tab) return false;
      if (!q) return true;
      return (
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.planName.toLowerCase().includes(q) ||
        (r.customer?.namaLengkap ?? "").toLowerCase().includes(q) ||
        (r.customer?.username ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search]);

  function openDetail(row: AdminPayment) {
    setDetailOpen(true);
    setDetail(row);
    setAudit([]);
    setAuditScope("invoice");
    setAuditLoading(true);
    setProof(null);
    setProofObjectUrl(null);
    setProofState("idle");
    void loadAudit(row);
    void loadProof(row);
  }

  async function loadAudit(row: AdminPayment) {
    try {
      const res = await apiFetch<{ logs: AuditLogEntry[] }>(
        `/api/panel-admin/audit-logs?userId=${encodeURIComponent(row.userId)}&limit=50`
      );
      const invoiceLogs = res.logs.filter((l) => l.invoiceId === row.invoiceId);
      if (invoiceLogs.length > 0) {
        setAudit(invoiceLogs);
        setAuditScope("invoice");
      } else {
        // Tidak ada log untuk tagihan ini — tampilkan riwayat terbaru pelanggan
        setAudit(res.logs.slice(0, 8));
        setAuditScope("user");
      }
    } catch {
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadProof(row: AdminPayment) {
    if (!row.hasProof) return;
    setProofState("loading");
    try {
      const p = await apiFetch<ProofData>(`/api/subscription/proof/${row.id}`);
      if (!p.proofFileUrl) {
        setProofState("error");
        return;
      }
      setProof(p);
      setProofState("idle");
    } catch {
      setProofState("error");
    }
  }

  // Buat object URL untuk bukti PDF (window.open data: URL diblokir browser)
  useEffect(() => {
    if (!proof || !proof.proofFileUrl.startsWith("data:application/pdf")) return;
    let url: string | null = null;
    let cancelled = false;
    fetch(proof.proofFileUrl)
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setProofObjectUrl(url);
      })
      .catch(() => setProofState("error"));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [proof]);

  async function handleApprove() {
    if (!detail || approving) return;
    setApproving(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        message: string;
        newEndDate: string | null;
        planName: string | null;
        isPlanChange: boolean;
      }>("/api/panel-admin/payments/review", {
        method: "POST",
        json: { paymentId: detail.id, action: "approve" },
      });
      toast({
        title: "Berhasil",
        description: res.newEndDate
          ? `${res.message} Langganan aktif hingga ${formatDate(res.newEndDate)}.`
          : res.message,
      });
      setApproveOpen(false);
      setDetailOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      if (e instanceof SubscriptionApiError && e.payload.idempotent === true) {
        // Pembayaran sudah diproses sebelumnya — bukan error bagi admin
        toast({ title: "Info", description: e.message });
        setApproveOpen(false);
        setDetailOpen(false);
        setReloadKey((k) => k + 1);
      } else {
        toast({
          variant: "destructive",
          title: "Gagal menyetujui",
          description: e instanceof Error ? e.message : "Coba lagi nanti.",
        });
      }
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!detail || rejecting) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setRejectError("Alasan penolakan minimal 5 karakter.");
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(
        "/api/panel-admin/payments/review",
        { method: "POST", json: { paymentId: detail.id, action: "reject", reason } }
      );
      toast({ title: "Berhasil", description: res.message ?? "Pembayaran ditolak." });
      setRejectOpen(false);
      setRejectReason("");
      setDetailOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      if (e instanceof SubscriptionApiError && e.payload.idempotent === true) {
        toast({ title: "Info", description: e.message });
        setRejectOpen(false);
        setDetailOpen(false);
        setReloadKey((k) => k + 1);
      } else {
        toast({
          variant: "destructive",
          title: "Gagal menolak",
          description: e instanceof Error ? e.message : "Coba lagi nanti.",
        });
      }
    } finally {
      setRejecting(false);
    }
  }

  const searching = search.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Verifikasi Pembayaran</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Periksa bukti transfer pelanggan, lalu setujui untuk mengaktifkan atau memperpanjang
          langganan mereka.
        </p>
      </div>

      {/* Filter status + pencarian */}
      <div className="space-y-3">
        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {STATUS_TABS.map((s) => {
            const active = tab === s.value;
            const count = counts[s.value] ?? 0;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setTab(s.value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nomor tagihan, nama, username, atau paket…"
            className="pl-9"
            aria-label="Cari pembayaran"
          />
        </div>
      </div>

      {/* Tabel pembayaran */}
      <Card className="gap-0 py-0">
        <div className="scrollbar-thin max-h-[70vh] overflow-auto">
          <div className="min-w-[960px]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <TableRow>
                  <TableHead>Nomor Tagihan</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead className="text-right">Harga Tagihan</TableHead>
                  <TableHead className="text-right">Kode Unik</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 10 }).map((__, j) => (
                        <TableCell key={`skeleton-${i}-${j}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ReceiptText className="size-8 opacity-50" />
                        <p className="text-sm">{emptyMessage(tab, searching)}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                        {row.invoiceNumber}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {row.customer?.namaLengkap ?? "-"}
                        </div>
                        {row.customer?.username && (
                          <div className="text-xs text-muted-foreground">
                            @{row.customer.username}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.planName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                        {formatRupiah(row.invoiceAmount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">
                        {formatUniqueCode(row.uniqueCode)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                        {formatRupiah(row.amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {paymentMethodLabel(row.paymentMethod)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openDetail(row)}>
                          Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      {/* ================= Dialog detail pembayaran ================= */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {!detail ? (
            <div className="space-y-4 py-2">
              <DialogTitle className="sr-only">Detail pembayaran</DialogTitle>
              <DialogDescription className="sr-only">
                Memuat detail pembayaran, mohon tunggu.
              </DialogDescription>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-mono text-base">
                  {detail.invoiceNumber}
                  <StatusBadge status={detail.status} />
                  {detail.isPlanChange && (
                    <Badge variant="secondary" className="font-normal">
                      Ganti Paket
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Dibuat {formatDateTime(detail.createdAt)} · Transfer{" "}
                  {formatDate(detail.transferDate)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {/* Info pelanggan & pembayaran */}
                <div className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                  <InfoItem label="Pelanggan" value={detail.customer?.namaLengkap ?? "-"} />
                  <InfoItem
                    label="Username"
                    value={detail.customer?.username ? `@${detail.customer.username}` : "-"}
                  />
                  <InfoItem label="Email" value={detail.customer?.email ?? "-"} />
                  <InfoItem label="No. HP" value={detail.customer?.nomorHP ?? "-"} />
                  <InfoItem label="Paket" value={detail.planName} />
                  <InfoItem
                    label="Jenis Tagihan"
                    value={detail.isPlanChange ? "Ganti paket" : "Aktivasi / perpanjangan"}
                  />
                  <InfoItem
                    label="Nominal Tagihan"
                    value={formatRupiah(detail.invoiceAmount)}
                  />
                  <InfoItem
                    label="Kode Unik"
                    value={formatUniqueCode(detail.uniqueCode)}
                    mono
                  />
                  <InfoItem
                    label="Nominal Dilaporkan"
                    value={formatRupiah(detail.amount)}
                    strong
                  />
                  <InfoItem
                    label="Metode Pembayaran"
                    value={paymentMethodLabel(detail.paymentMethod)}
                  />
                  <InfoItem label="Nama Pengirim" value={detail.senderName ?? "-"} />
                  <InfoItem
                    label="Tanggal Transfer"
                    value={detail.transferDate ? formatDate(detail.transferDate) : "-"}
                  />
                  {detail.reviewedBy && (
                    <InfoItem
                      label="Diverifikasi Oleh"
                      value={
                        detail.reviewedAt
                          ? `${detail.reviewedBy}, ${formatDateTime(detail.reviewedAt)}`
                          : detail.reviewedBy
                      }
                    />
                  )}
                </div>

                {/* Peringatan nominal berbeda */}
                {detail.amount !== detail.invoiceAmount && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                    <p className="font-semibold text-amber-900">Nominal dilaporkan berbeda</p>
                    <p className="mt-1 text-amber-900/80">
                      Pelanggan melaporkan transfer {formatRupiah(detail.amount)}, sedangkan
                      nominal tagihan {formatRupiah(detail.invoiceAmount)}.
                    </p>
                  </div>
                )}

                {/* Bukti pembayaran */}
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold">Bukti pembayaran</p>
                  {!detail.hasProof ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pelanggan belum mengunggah bukti pembayaran.
                    </p>
                  ) : proofState === "loading" ? (
                    <Skeleton className="mt-2 h-48 w-full" />
                  ) : proofState === "error" || !proof ? (
                    <p className="mt-2 text-sm text-muted-foreground">Bukti tidak tersedia.</p>
                  ) : proof.proofFileUrl.startsWith("data:application/pdf") ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="size-4" />
                        {proof.proofFileName ?? "Dokumen PDF"}
                      </p>
                      <Button
                        variant="outline"
                        className="w-fit gap-2"
                        onClick={() => {
                          if (proofObjectUrl) window.open(proofObjectUrl, "_blank", "noopener");
                        }}
                        disabled={!proofObjectUrl}
                      >
                        <ExternalLink className="size-4" />
                        Buka bukti PDF
                      </Button>
                    </div>
                  ) : (
                    <img
                      src={proof.proofFileUrl}
                      alt={`Bukti pembayaran ${detail.invoiceNumber}`}
                      className="mt-2 max-h-96 w-full rounded-lg border object-contain"
                    />
                  )}
                </div>

                {detail.rejectionReason && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm font-semibold text-destructive">Alasan penolakan</p>
                    <p className="mt-1 text-sm">{detail.rejectionReason}</p>
                  </div>
                )}

                {/* Riwayat (audit) */}
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold">Riwayat</p>
                  {auditScope === "user" && audit.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Belum ada riwayat untuk tagihan ini — menampilkan riwayat terbaru pelanggan.
                    </p>
                  )}
                  {auditLoading ? (
                    <Skeleton className="mt-3 h-24 w-full" />
                  ) : audit.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Belum ada riwayat.</p>
                  ) : (
                    <ol className="mt-3 space-y-0">
                      {audit.map((entry, i) => (
                        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {i < audit.length - 1 && (
                            <span
                              aria-hidden
                              className="absolute left-[5px] top-4 h-full w-px bg-border"
                            />
                          )}
                          <span
                            aria-hidden
                            className={cn(
                              "relative mt-1 size-2.5 shrink-0 rounded-full border-2 border-background",
                              entry.action === "payment_approved" && "bg-primary",
                              entry.action === "payment_rejected" && "bg-destructive",
                              entry.action === "subscription_activated" && "bg-emerald-500",
                              entry.action !== "payment_approved" &&
                                entry.action !== "payment_rejected" &&
                                entry.action !== "subscription_activated" &&
                                "bg-muted-foreground/50"
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{auditLabel(entry.action)}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.performedBy}
                              {entry.notes ? ` — ${entry.notes}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground/80">
                              {formatDateTime(entry.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              {/* Aksi verifikasi */}
              {detail.status === "menunggu_verifikasi" && (
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setRejectReason("");
                      setRejectError(null);
                      setRejectOpen(true);
                    }}
                  >
                    Tolak Pembayaran
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => setApproveOpen(true)}
                    disabled={approving}
                  >
                    {approving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-4" />
                    )}
                    Setujui Pembayaran
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= Konfirmasi setujui ================= */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui pembayaran ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Aktifkan/perpanjang langganan pelanggan? Tindakan ini akan menerapkan durasi paket
              sesuai tagihan {detail?.invoiceNumber ?? ""} dan tidak dapat diulang untuk tagihan
              yang sama.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleApprove();
              }}
              disabled={approving}
              className="gap-2"
            >
              {approving && <Loader2 className="size-4 animate-spin" />}
              Ya, Setujui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================= Dialog tolak ================= */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak pembayaran</DialogTitle>
            <DialogDescription>
              Jelaskan alasan penolakan. Pelanggan akan melihat alasan ini dan dapat mengirim ulang
              bukti pembayaran.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Alasan penolakan</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Contoh: Nominal transfer tidak sesuai dengan total tagihan."
              rows={4}
              aria-invalid={!!rejectError}
            />
            {rejectError && <p className="text-sm text-destructive">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={rejecting || rejectReason.trim().length < 5}
            >
              {rejecting && <Loader2 className="size-4 animate-spin" />}
              Tolak Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "break-words",
          mono && "font-mono",
          strong ? "text-base font-semibold" : "text-sm font-medium"
        )}
      >
        {value}
      </p>
    </div>
  );
}
