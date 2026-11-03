/**
 * Filter pencarian "contains" yang konsisten antar engine database.
 *
 * MASALAH: Prisma `contains` memakai LIKE engine masing-masing DB —
 * - SQLite (lokal): LIKE sudah case-INsensitive (ASCII) → pencarian "budi"
 *   cocok dengan "Budi Susanto".
 * - PostgreSQL (produksi): LIKE case-SENSITIVE → "budi" TIDAK cocok dengan
 *   "Budi Susanto" → kotak pencarian terasa "tidak berfungsi" di online.
 *
 * SOLUSI: di PostgreSQL tambahkan `mode: 'insensitive'` (ILIKE). Mode ini
 * TIDAK didukung connector SQLite (validasi Prisma error bila dipaksa),
 * jadi hanya disisipkan bila DATABASE_URL menunjuk ke PostgreSQL.
 *
 * Pemakaian: ganti `{ field: { contains: q } }` → `{ field: containsI(q) }`.
 */
function isPostgreSQL(): boolean {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgres') || url.startsWith('postgresql')
}

export function containsI(
  q: string
): { contains: string; mode?: 'insensitive' } {
  return isPostgreSQL()
    ? { contains: q, mode: 'insensitive' as const }
    : { contains: q }
}
