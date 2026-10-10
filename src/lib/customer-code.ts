import { db } from '@/lib/db'

/**
 * Kode customer otomatis (CUST-xxx) — unik per user.
 * Nomor diambil dari kode terbesar yang sudah ada + 1 sehingga tetap aman
 * walaupun customer dengan nomor terbesar sudah dihapus.
 */
export async function nextCustomerCode(userId: string | null): Promise<string> {
  const customers = await db.customer.findMany({
    where: { userId, code: { startsWith: 'CUST-' } },
    select: { code: true },
  })

  let max = 0
  for (const { code } of customers) {
    const m = /^CUST-(\d+)$/.exec(code ?? '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }

  return `CUST-${String(max + 1).padStart(3, '0')}`
}

/**
 * Backfill kode customer yang masih kosong (mis. data seed / import lama).
 * Dipanggil lazy saat daftar customer dimuat (GET /api/customers) sehingga
 * data lama otomatis terisi kode tanpa perlu migrasi manual.
 * Mengembalikan jumlah customer yang diisi kodenya.
 */
export async function backfillCustomerCodes(userId: string): Promise<number> {
  const missing = await db.customer.findMany({
    where: { userId, OR: [{ code: null }, { code: '' }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  if (missing.length === 0) return 0

  // Lanjutkan dari nomor terbesar yang sudah dipakai user ini.
  const existing = await db.customer.findMany({
    where: { userId, code: { startsWith: 'CUST-' } },
    select: { code: true },
  })
  let n = 0
  for (const { code } of existing) {
    const m = /^CUST-(\d+)$/.exec(code ?? '')
    if (m) n = Math.max(n, parseInt(m[1], 10))
  }

  let filled = 0
  for (const c of missing) {
    n += 1
    let code = `CUST-${String(n).padStart(3, '0')}`
    // Hindari tabrakan bila ada request paralel — cari slot kosong berikutnya.
    for (let guard = 0; guard < 1000; guard++) {
      const clash = await db.customer.findFirst({
        where: { userId, code },
        select: { id: true },
      })
      if (!clash) break
      n += 1
      code = `CUST-${String(n).padStart(3, '0')}`
    }
    await db.customer.update({ where: { id: c.id }, data: { code } })
    filled += 1
  }

  return filled
}
