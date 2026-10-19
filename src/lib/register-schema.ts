/**
 * Validasi pendaftaran akun (alur /daftar baru) — zod.
 * Normalisasi nomor mengikuti @/lib/phone agar konsisten dengan data
 * RegisterOtp & pemeriksaan duplikat yang sudah ada.
 */
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

/** Normalisasi nomor HP Indonesia → 62xxxxxxxxxx. '' bila tidak valid. */
function toNormalizedPhone(raw: string): string {
  const trimmed = (raw || "").trim();
  const compact = trimmed.replace(/[\s\-()]/g, "");
  const normalized = normalizePhone(compact);
  if (!normalized) return "";
  // Harus diawali 62 dan diikuti 8 (seluler) — total 10–15 digit.
  if (!/^62\d{8,13}$/.test(normalized)) return "";
  if (!normalized.startsWith("628")) return "";
  return normalized;
}

/** Tampilkan kembali dalam format 08xx agar mudah dibaca. */
export function displayPhone(normalized: string): string {
  if (normalized.startsWith("62")) return "0" + normalized.slice(2);
  return normalized;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Nomor WhatsApp wajib diisi")
  .transform((v) => toNormalizedPhone(v))
  .refine((v): v is string => v !== "", {
    message: "Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx",
  });

export const sendOtpSchema = z.object({
  whatsapp: phoneSchema,
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "Nama lengkap minimal 3 karakter")
      .max(80, "Nama lengkap terlalu panjang"),
    companyName: z
      .string()
      .trim()
      .min(2, "Nama perusahaan/usaha minimal 2 karakter")
      .max(100, "Nama perusahaan terlalu panjang"),
    whatsapp: phoneSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ message: "Format email tidak valid" })),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(
        z
          .string()
          .min(3, "Username minimal 3 karakter")
          .max(20, "Username maksimal 20 karakter")
          .regex(
            /^[a-z0-9_.]+$/,
            "Username hanya boleh huruf, angka, titik, dan underscore"
          )
      ),
    password: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .max(72, "Password terlalu panjang")
      .regex(/[a-zA-Z]/, "Password harus mengandung huruf")
      .regex(/\d/, "Password harus mengandung angka"),
    confirmPassword: z.string(),
    otp: z.string().trim().regex(/^\d{6}$/, "Kode OTP harus 6 digit angka"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Konfirmasi password tidak sama dengan password",
    path: ["confirmPassword"],
  });

/** Ambil pesan kesalahan pertama dari zod error. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Data tidak valid";
}

/** Kumpulkan field error dari zod untuk ditampilkan per input. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
