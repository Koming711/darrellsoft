'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DarrellLogo } from "@/components/darrellsoft/logo";
import { SiteFooter } from "@/components/darrellsoft/site-footer";
import { StepIndicator } from "@/components/darrellsoft/step-indicator";
import { PasswordInput } from "@/components/auth/password-input";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/use-session";
import { setAuthUser } from "@/lib/auth";
import { notifyDataChange } from "@/lib/data-sync";
import { apiFetch, SubscriptionApiError } from "@/lib/subscription-client";

type FormValues = {
  fullName: string;
  companyName: string;
  whatsapp: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};

type FieldErrors = Partial<Record<keyof FormValues | "otp", string>>;

type OtpSendResponse = {
  ok: boolean;
  message: string;
  demoCode?: string;
  expiresInMinutes?: number;
};

type RegisterPermissions = {
  features: Record<string, boolean>;
  subPermissions: Record<string, Record<string, boolean>>;
};

type RegisterResponse = {
  ok: boolean;
  message?: string;
  redirect: string;
  id: string;
  username: string;
  name: string;
  role: string;
  sessionId: string;
  permissions?: RegisterPermissions;
};

const WHATSAPP_PATTERN = /^(\+62|62|0)8\d{7,12}$/;

const BENEFITS = [
  "Kasir, invoice, dan stok bahan dalam satu aplikasi",
  "Laporan penjualan otomatis setiap hari",
  "Dukungan multi-pengguna untuk tim percetakan Anda",
];

export default function DaftarPage() {
  const { user, loading: sessionLoading } = useSession();
  const { toast } = useToast();

  const [form, setForm] = useState<FormValues>({
    fullName: "",
    companyName: "",
    whatsapp: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [otp, setOtp] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);

  // Ref guard: setelah pendaftaran sukses, setAuthUser membuat `user` terisi —
  // jangan biarkan efek redirect umum membawa user ke /pembukaan dan
  // mengalahkan redirect ke /pilih-paket.
  const skipAuthRedirectRef = useRef(false);

  // Sudah login? Tidak perlu daftar lagi — arahkan ke beranda aplikasi.
  useEffect(() => {
    if (!sessionLoading && user && !skipAuthRedirectRef.current) {
      window.location.assign("/pembukaan");
    }
  }, [sessionLoading, user]);

  // Countdown kirim ulang OTP.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const cleanWhatsapp = form.whatsapp.replace(/[^\d+]/g, "");
  const whatsappValid = WHATSAPP_PATTERN.test(cleanWhatsapp);

  function updateField(name: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function handleSendOtp() {
    setFormError(null);
    if (!whatsappValid) {
      setFieldErrors((prev) => ({
        ...prev,
        whatsapp: "Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx",
      }));
      return;
    }

    setSendingOtp(true);
    try {
      const res = await apiFetch<OtpSendResponse>("/api/auth/otp/send", {
        method: "POST",
        json: { whatsapp: form.whatsapp.trim() },
      });
      setOtpSent(true);
      setOtpSentTo(res.message);
      setDemoCode(res.demoCode ?? null);
      setCooldown(60);
      setCopied(false);
      setFieldErrors((prev) => {
        if (!prev.whatsapp) return prev;
        const next = { ...prev };
        delete next.whatsapp;
        return next;
      });
      toast({
        title: "Kode OTP terkirim",
        description: res.message,
      });
    } catch (err) {
      const apiError = err instanceof SubscriptionApiError ? err : null;
      const message =
        apiError?.message ?? "Gagal mengirim kode OTP. Silakan coba lagi.";
      if (apiError?.fieldErrors?.whatsapp) {
        const waError = apiError.fieldErrors.whatsapp;
        setFieldErrors((prev) => ({ ...prev, whatsapp: waError }));
      }
      setFormError(message);
      toast({
        variant: "destructive",
        title: "Gagal mengirim OTP",
        description: message,
      });
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleCopyCode() {
    if (!demoCode) return;
    try {
      await navigator.clipboard.writeText(demoCode);
      setCopied(true);
      toast({ title: "Kode OTP disalin", description: "Tempel di kolom kode OTP." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal menyalin",
        description: "Salin kode secara manual dari kotak berwarna.",
      });
    }
  }

  function validateAll(): FieldErrors {
    const errors: FieldErrors = {};
    if (form.fullName.trim().length < 3) {
      errors.fullName = "Nama lengkap minimal 3 karakter";
    }
    if (form.companyName.trim().length < 2) {
      errors.companyName = "Nama perusahaan/usaha minimal 2 karakter";
    }
    if (!whatsappValid) {
      errors.whatsapp = "Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx";
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      errors.email = "Format email tidak valid";
    }
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(form.username.trim())) {
      errors.username =
        "Username 3-20 karakter, hanya huruf, angka, titik, dan underscore";
    }
    if (
      form.password.length < 8 ||
      !/[a-zA-Z]/.test(form.password) ||
      !/\d/.test(form.password)
    ) {
      errors.password =
        "Password minimal 8 karakter dan mengandung huruf serta angka";
    }
    if (!form.confirmPassword || form.confirmPassword !== form.password) {
      errors.confirmPassword = "Konfirmasi password tidak sama dengan password";
    }
    if (!/^\d{6}$/.test(otp)) {
      errors.otp = "Masukkan 6 digit kode OTP";
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validateAll();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Periksa kembali data yang ditandai merah.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        json: {
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim(),
          whatsapp: form.whatsapp.trim(),
          email: form.email.trim(),
          username: form.username.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword,
          otp,
        },
      });

      // ===== Pendaftaran berhasil — sesi langsung aktif =====
      skipAuthRedirectRef.current = true;
      try {
        notifyDataChange("calon-pembeli");
      } catch {}
      toast({
        title: "Pendaftaran berhasil",
        description: res.message ?? "Akun Anda telah dibuat.",
      });

      setAuthUser({
        id: res.id,
        username: res.username,
        name: res.name,
        role: res.role,
        sessionId: res.sessionId,
      });

      // Wajib isi Data Perusahaan setelah masuk (sama seperti alur lama).
      localStorage.setItem("companyDataRequired", "true");

      if (res.permissions) {
        const allPerms: Record<
          string,
          RegisterPermissions
        > = {};
        allPerms[res.role] = res.permissions;
        try {
          const existing = localStorage.getItem("permissions");
          if (existing) {
            const parsed = JSON.parse(existing) as Record<string, RegisterPermissions>;
            Object.assign(allPerms, parsed);
          }
        } catch {}
        localStorage.setItem("permissions", JSON.stringify(allPerms));
      }

      // Hard navigation setelah toast terlihat: memastikan cookie sesi terbawa
      // dan tidak ada race antara router.push dan router.refresh.
      window.setTimeout(() => {
        window.location.assign(res.redirect || "/pilih-paket");
      }, 1200);
    } catch (err) {
      const apiError = err instanceof SubscriptionApiError ? err : null;
      if (apiError) {
        const serverFieldErrors = apiError.fieldErrors;
        if (serverFieldErrors && Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...serverFieldErrors }));
          setFormError("Periksa kembali data yang ditandai merah.");
        } else {
          setFormError(apiError.message);
        }
        toast({
          variant: "destructive",
          title: "Pendaftaran gagal",
          description: apiError.message,
        });
      } else {
        const message = "Terjadi kesalahan tak terduga. Silakan coba lagi.";
        setFormError(message);
        toast({
          variant: "destructive",
          title: "Pendaftaran gagal",
          description: message,
        });
      }
    } finally {
      // Saat pendaftaran sukses, biarkan spinner "Mengarahkan…" yang tampil
      // (jangan reset submitting agar tombol tidak aktif kembali).
      if (!skipAuthRedirectRef.current) {
        setSubmitting(false);
      }
    }
  }

  if (sessionLoading || user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {user ? "Mengarahkan…" : "Memeriksa sesi…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <StepIndicator step={1} className="mb-6 sm:mb-10" />

          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            {/* Panel brand — hanya tampil di desktop */}
            <aside
              aria-hidden="true"
              className="relative hidden flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-teal-800 via-teal-700 to-teal-900 p-8 text-white lg:flex"
            >
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
              <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-amber-400/10 blur-2xl" />

              <div className="relative">
                <DarrellLogo light size="lg" />
              </div>

              <div className="relative my-10">
                <h2 className="text-2xl font-bold leading-snug">
                  Mulai kelola percetakan Anda hari ini.
                </h2>
                <ul className="mt-6 space-y-4">
                  {BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3 text-sm text-teal-50">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                      </span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>

            </aside>

            {/* Kartu form */}
            <Card className="w-full py-8">
              <CardHeader>
                <div className="lg:hidden">
                  <Link href="/" aria-label="Beranda Darrellsoft">
                    <DarrellLogo size="sm" />
                  </Link>
                </div>
                <CardTitle className="text-xl">Buat Akun Baru</CardTitle>
                <CardDescription>
                  Lengkapi data berikut untuk memulai Trial gratis 14 hari.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  {formError && (
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" aria-hidden="true" />
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nama Lengkap</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      autoComplete="name"
                      placeholder="cth: Budi Santoso"
                      className="h-11"
                      value={form.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.fullName}
                    />
                    {fieldErrors.fullName && (
                      <p className="text-xs text-destructive">{fieldErrors.fullName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyName">Nama Perusahaan / Usaha</Label>
                    <Input
                      id="companyName"
                      name="companyName"
                      autoComplete="organization"
                      placeholder="cth: Percetakan Maju Jaya"
                      className="h-11"
                      value={form.companyName}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.companyName}
                    />
                    {fieldErrors.companyName && (
                      <p className="text-xs text-destructive">{fieldErrors.companyName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">Nomor WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      name="whatsapp"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="08xxxxxxxxxx"
                      className="h-11"
                      value={form.whatsapp}
                      onChange={(e) => updateField("whatsapp", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.whatsapp}
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: 08xxxxxxxxxx — kode OTP akan dikirim ke nomor ini.
                    </p>
                    {fieldErrors.whatsapp && (
                      <p className="text-xs text-destructive">{fieldErrors.whatsapp}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="cth: budi@majujaya.id"
                      className="h-11"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.email}
                    />
                    {fieldErrors.email && (
                      <p className="text-xs text-destructive">{fieldErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      placeholder="cth: budicetak"
                      className="h-11"
                      value={form.username}
                      onChange={(e) => updateField("username", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.username}
                    />
                    <p className="text-xs text-muted-foreground">
                      3-20 karakter, huruf/angka/titik/underscore
                    </p>
                    {fieldErrors.username && (
                      <p className="text-xs text-destructive">{fieldErrors.username}</p>
                    )}
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <PasswordInput
                        id="password"
                        name="password"
                        autoComplete="new-password"
                        placeholder="Min. 8 karakter"
                        className="h-11"
                        value={form.password}
                        onChange={(e) => updateField("password", e.target.value)}
                        disabled={submitting}
                        aria-invalid={!!fieldErrors.password}
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimal 8 karakter, ada huruf &amp; angka.
                      </p>
                      {fieldErrors.password && (
                        <p className="text-xs text-destructive">{fieldErrors.password}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
                      <PasswordInput
                        id="confirmPassword"
                        name="confirmPassword"
                        autoComplete="new-password"
                        placeholder="Ulangi password"
                        className="h-11"
                        value={form.confirmPassword}
                        onChange={(e) => updateField("confirmPassword", e.target.value)}
                        disabled={submitting}
                        aria-invalid={!!fieldErrors.confirmPassword}
                      />
                      {fieldErrors.confirmPassword && (
                        <p className="text-xs text-destructive">
                          {fieldErrors.confirmPassword}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* OTP */}
                  <div className="space-y-2">
                    <Label htmlFor="otp">Kode OTP</Label>
                    <div className="flex flex-wrap items-center gap-3">
                      <InputOTP
                        maxLength={6}
                        value={otp}
                        onChange={(value) => {
                          setOtp(value);
                          setFieldErrors((prev) => {
                            if (!prev.otp) return prev;
                            const next = { ...prev };
                            delete next.otp;
                            return next;
                          });
                        }}
                        disabled={submitting}
                        aria-invalid={!!fieldErrors.otp}
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="h-11 w-9 sm:w-10" />
                          <InputOTPSlot index={1} className="h-11 w-9 sm:w-10" />
                          <InputOTPSlot index={2} className="h-11 w-9 sm:w-10" />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} className="h-11 w-9 sm:w-10" />
                          <InputOTPSlot index={4} className="h-11 w-9 sm:w-10" />
                          <InputOTPSlot index={5} className="h-11 w-9 sm:w-10" />
                        </InputOTPGroup>
                      </InputOTP>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 px-4"
                        onClick={handleSendOtp}
                        disabled={sendingOtp || cooldown > 0 || submitting}
                      >
                        {sendingOtp ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            Mengirim…
                          </>
                        ) : cooldown > 0 ? (
                          `Kirim ulang (${cooldown}s)`
                        ) : otpSent ? (
                          "Kirim Ulang"
                        ) : (
                          "Kirim Kode OTP"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {otpSentTo ?? "Masukkan 6 digit kode yang dikirim ke WhatsApp Anda."}
                    </p>
                    {fieldErrors.otp && (
                      <p className="text-xs text-destructive">{fieldErrors.otp}</p>
                    )}
                  </div>

                  {otpSent && demoCode && (
                    <Alert className="border-teal-600/30 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
                      <KeyRound className="size-4" aria-hidden="true" />
                      <AlertTitle>
                        Mode demo: karena gateway WhatsApp belum terhubung, kode OTP
                        Anda:
                      </AlertTitle>
                      <AlertDescription className="text-teal-800 dark:text-teal-200">
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <code className="rounded-md bg-teal-100 px-2.5 py-1 font-mono text-lg font-bold tracking-[0.35em] text-teal-900 dark:bg-teal-900 dark:text-teal-50">
                            {demoCode}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5 border-teal-600/30 bg-white text-teal-900 hover:bg-teal-100 hover:text-teal-900 dark:bg-transparent dark:text-teal-100 dark:hover:bg-teal-900"
                            onClick={handleCopyCode}
                          >
                            {copied ? (
                              <>
                                <Check className="size-3.5" aria-hidden="true" />
                                Tersalin
                              </>
                            ) : (
                              <>
                                <Copy className="size-3.5" aria-hidden="true" />
                                Salin
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="mt-1.5 text-xs text-teal-700 dark:text-teal-300">
                          Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {!otpSent && (
                    <p className="flex items-start gap-2 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
                      <MessageSquareText
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      Isi nomor WhatsApp di atas, lalu klik{" "}
                      <span className="font-medium text-foreground">Kirim Kode OTP</span>{" "}
                      untuk menerima kode verifikasi.
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="h-11 w-full text-base"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        Mendaftarkan…
                      </>
                    ) : (
                      "Daftar"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Masuk
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
