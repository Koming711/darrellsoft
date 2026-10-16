import { db } from '@/lib/db'

/**
 * Helper server untuk fitur Stock Bahan.
 * Dipakai bersama oleh /api/stock-bahan dan /api/stock-bahan/mutasi.
 */

/** Prefix nomor transaksi per jenis mutasi. */
export const NOMOR_PREFIX: Record<string, string> = {
  masuk: 'SM',
  keluar: 'SK',
  penyesuaian: 'SP',
}

/**
 * Nomor transaksi berurutan per user per jenis: SM-001, SK-001, SP-001, ...
 */
export async function nextNomorMutasi(
  userId: string | null,
  jenis: string
): Promise<string> {
  const prefix = NOMOR_PREFIX[jenis] || 'SM'
  const existing = await db.bahanMutasi.findMany({
    where: { userId, jenis },
    select: { nomor: true },
  })
  let maxNum = 0
  for (const m of existing) {
    const match = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(m.nomor)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}

/** Tanggal hari ini (yyyy-mm-dd) di zona Asia/Jakarta. */
export function todayJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
}

/** YYYY-MM-DD dari objek Date (zona Asia/Jakarta). */
export function dateOnly(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
}

/**
 * Alias todayJakarta — dipakai route transaksi (Stok Masuk/Keluar/Penyesuaian)
 * sebagai tanggal default transaksi (yyyy-mm-dd, Asia/Jakarta).
 */
export function todayStr(): string {
  return todayJakarta()
}

/**
 * Nomor transaksi berurutan per user, dipakai bersama Stok Masuk / Keluar /
 * Penyesuaian: STK-001, STK-002, ... (tidak reuse nomor yang sudah terpakai).
 */
export async function nextStkNumber(userId: string | null): Promise<string> {
  const [masuk, keluar, adj] = await Promise.all([
    db.bahanMasuk.findMany({ where: { userId }, select: { nomor: true } }),
    db.bahanKeluar.findMany({ where: { userId }, select: { nomor: true } }),
    db.bahanPenyesuaian.findMany({ where: { userId }, select: { nomor: true } }),
  ])
  let maxNum = 0
  for (const row of [...masuk, ...keluar, ...adj]) {
    const match = /^STK-(\d+)$/i.exec(row.nomor || '')
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
  }
  return `STK-${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * Replay seluruh transaksi Stok Masuk/Keluar/Penyesuaian untuk satu bahan
 * → stok Bahan = Σ masuk − Σ keluar + Σ selisih. Dipanggil setiap
 * create/update/delete transaksi agar saldo selalu konsisten.
 */
export async function recalcBahan(bahanId: string): Promise<void> {
  const bahan = await db.bahan.findUnique({ where: { id: bahanId } })
  if (!bahan) return
  const [masukRows, keluarRows, adjRows] = await Promise.all([
    db.bahanMasuk.findMany({ where: { bahanId }, select: { qty: true } }),
    db.bahanKeluar.findMany({ where: { bahanId }, select: { qty: true } }),
    db.bahanPenyesuaian.findMany({ where: { bahanId }, select: { selisih: true } }),
  ])
  const stok =
    masukRows.reduce((a, r) => a + (r.qty || 0), 0) -
    keluarRows.reduce((a, r) => a + (r.qty || 0), 0) +
    adjRows.reduce((a, r) => a + (r.selisih || 0), 0)
  await db.bahan.update({
    where: { id: bahanId },
    data: { stok: Math.round(stok * 100) / 100 },
  })
}

/**
 * Migrasi idempoten: bahan yang punya stok tapi BELUM punya transaksi ledger
 * (data lama dari sistem sebelumnya / penerimaan PO lama) mendapat satu
 * "Saldo awal" BahanMasuk agar saldo terlacak di riwayat.
 * Mengembalikan jumlah bahan yang dimigrasi.
 */
export async function migrateStockLedger(userId: string | null): Promise<number> {
  const bahans = await db.bahan.findMany({ where: { userId: userId ?? null } })
  let migrated = 0
  for (const b of bahans) {
    const [cMasuk, cKeluar, cAdj] = await Promise.all([
      db.bahanMasuk.count({ where: { bahanId: b.id } }),
      db.bahanKeluar.count({ where: { bahanId: b.id } }),
      db.bahanPenyesuaian.count({ where: { bahanId: b.id } }),
    ])
    if (cMasuk + cKeluar + cAdj > 0) continue // sudah punya ledger — biarkan recalc yang jaga konsistensi
    if (b.stok !== 0) {
      const nomor = await nextStkNumber(userId)
      await db.bahanMasuk.create({
        data: {
          nomor,
          tanggal: dateOnly(b.createdAt),
          bahanId: b.id,
          bahanNama: b.nama,
          satuan: b.satuan,
          qty: b.stok,
          hargaBeli: b.hargaSatuan,
          total: b.stok * b.hargaSatuan,
          suplierNama: b.suplierNama,
          nomorNota: '',
          catatan: 'Saldo awal',
          userId,
        },
      })
      await recalcBahan(b.id)
      migrated += 1
    }
  }
  return migrated
}

const STOCK_NEGATIVE_KEY = 'stock_allow_negative_stock'

/**
 * Pengaturan global Stock Bahan (khusus admin): stok keluar boleh minus.
 * Disimpan global di tabel Setting (key unik, tanpa user).
 */
export async function getStockPengaturan(): Promise<{ allowNegativeStock: boolean }> {
  const s = await db.setting.findUnique({ where: { key: STOCK_NEGATIVE_KEY } })
  return { allowNegativeStock: s?.value === 'true' }
}

export async function setStockPengaturan(allowNegativeStock: boolean): Promise<void> {
  const value = allowNegativeStock ? 'true' : 'false'
  await db.setting.upsert({
    where: { key: STOCK_NEGATIVE_KEY },
    update: { value },
    create: { key: STOCK_NEGATIVE_KEY, value },
  })
}

/**
 * Baca setting per-user "stock_izinkan_minus" — apakah stok boleh minus.
 * Default: false (stok tidak boleh minus).
 */
export async function isIzinkanMinus(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const s = await db.userSetting.findUnique({
    where: { userId_key: { userId, key: 'stock_izinkan_minus' } },
  })
  return s?.value === 'true'
}

/**
 * Gabungkan catatan bebas + referensi PO menjadi satu field keterangan.
 * Format: "Ref PO: PO-xxx | catatan bebas"
 */
export function composeKeterangan(poRef: unknown, catatan: unknown): string {
  const parts: string[] = []
  const ref = poRef ? String(poRef).trim() : ''
  const note = catatan ? String(catatan).trim() : ''
  if (ref) parts.push(`Ref PO: ${ref}`)
  if (note) parts.push(note)
  return parts.join(' | ')
}

/**
 * Kebalikan composeKeterangan — pisahkan keterangan menjadi { poRef, catatan }.
 * "Ref PO: PO-xxx | catatan" → { poRef: "PO-xxx", catatan: "catatan" }
 */
export function splitKeterangan(keterangan: string): { poRef: string; catatan: string } {
  const ket = (keterangan || '').trim()
  const m = /^Ref PO:\s*(.+?)(?:\s*\|\s*(.*))?$/.exec(ket)
  if (m) {
    return { poRef: m[1].trim(), catatan: (m[2] || '').trim() }
  }
  return { poRef: '', catatan: ket }
}
