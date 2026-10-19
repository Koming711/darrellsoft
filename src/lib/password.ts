// src/lib/password.ts
// Helper hash password — bcryptjs (murni JS, kompatibel runtime Bun/Node).
//
// KOMPATIBILITAS DATA LAMA:
// - Akun lama masih menyimpan password PLAINTEXT di DB (Pengguna/CalonPembeli).
// - verifyPassword() menerima KEDUA format: hash bcrypt ($2a$/$2b$/$2y$) ATAU
//   plaintext legacy — jadi login akun lama tetap berfungsi tanpa migrasi massal.
// - Semua penulisan password BARU wajib lewat hashPassword() (register, reset,
//   admin set password, dsb).

import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

/** Hash password plaintext → bcrypt hash ($2b$...). */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS)
}

/**
 * Verifikasi password terhadap nilai tersimpan.
 * - Nilai tersimpan berformat bcrypt hash → bcrypt.compare.
 * - Nilai tersimpan plaintext (data lama) → perbandingan biasa.
 * Selalu mengembalikan boolean (tidak melempar).
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  if (isBcryptHash(stored)) {
    try {
      return bcrypt.compareSync(plain, stored)
    } catch {
      return false
    }
  }
  // Legacy: baris lama masih plaintext
  return plain === stored
}

/** Deteksi format bcrypt hash ($2a$ / $2b$ / $2y$ + 53 char). */
export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)
}
