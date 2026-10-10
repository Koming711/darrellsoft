import { Prisma } from '@prisma/client'

/**
 * Helper Stock Bahan — nomor transaksi otomatis & rekalkulasi stok dari ledger.
 *
 * Semua perubahan stok WAJIB lewat BahanMutasi (sumber kebenaran):
 *   masuk +qty · keluar −qty · penyesuaian +qty (qty boleh negatif).
 * recalcBahanStock membangun ulang stokSetelah tiap mutasi dan stok bahan
 * agar saldo selalu konsisten setelah edit/hapus transaksi.
 */

type TxClient = Prisma.TransactionClient | PrismaClientLike

interface PrismaClientLike {
  bahanMutasi: {
    findMany(args: unknown): Promise<Array<{
      id: string
      jenis: string
      qty: number
      stokSetelah: number
    }>>
    findFirst(args: unknown): Promise<{ nomor: string } | null>
  }
  bahan: {
    update(args: unknown): Promise<unknown>
  }
}

/** Error stok minus — ditangkap route → HTTP 400 dengan pesan jelas. */
export class StockMinusError extends Error {
  constructor(
    public bahanNama: string,
    public stokNow: number,
    public satuan: string,
  ) {
    super(`Stok tidak cukup untuk ${bahanNama} (stok saat ini: ${stokNow} ${satuan})`)
    this.name = 'StockMinusError'
  }
}

export const ALLOW_NEGATIVE_KEY = 'stock_allow_negative'

/**
 * Baca opsi admin "Allow Negative Stock" (UserSetting per user, fallback global).
 * Nilai '1' / 'true' = diizinkan.
 */
export async function getAllowNegativeStock(
  dbClient: {
    userSetting: { findUnique(args: unknown): Promise<{ value: string } | null> }
    setting: { findUnique(args: unknown): Promise<{ value: string } | null> }
  },
  userId: string | null,
): Promise<boolean> {
  if (userId) {
    const us = await dbClient.userSetting.findUnique({
      where: { userId_key: { userId, key: ALLOW_NEGATIVE_KEY } },
    })
    if (us) return us.value === '1' || us.value === 'true'
  }
  const g = await dbClient.setting.findUnique({ where: { key: ALLOW_NEGATIVE_KEY } })
  return !!g && (g.value === '1' || g.value === 'true')
}

export function mutasiPrefix(jenis: string): string {
  if (jenis === 'masuk') return 'SM'
  if (jenis === 'keluar') return 'SK'
  return 'SA' // penyesuaian
}

/**
 * Nomor transaksi berurutan per user per bulan: SM-2609-0001, dst.
 * Aman dipanggil di dalam $transaction (query biasa, bukan increment DB).
 */
export async function nextBahanMutasiNomor(
  client: TxClient,
  jenis: 'masuk' | 'keluar' | 'penyesuaian',
  userId: string | null,
  tanggal: string,
): Promise<string> {
  const m = /^(\d{4})-(\d{2})/.exec(tanggal)
  const yy = m ? m[1].slice(2) : new Date().getFullYear().toString().slice(2)
  const mm = m ? m[2] : String(new Date().getMonth() + 1).padStart(2, '0')
  const prefix = `${mutasiPrefix(jenis)}-${yy}${mm}`

  const last = await client.bahanMutasi.findFirst({
    where: { nomor: { startsWith: `${prefix}-` }, ...(userId ? { userId } : {}) },
    orderBy: { nomor: 'desc' },
    select: { nomor: true },
  })
  let seq = 0
  if (last) {
    const mm2 = /-(\d+)$/.exec(last.nomor)
    if (mm2) seq = parseInt(mm2[1], 10)
  }
  return `${prefix}-${String(seq + 1).padStart(4, '0')}`
}

/**
 * Bangun ulang saldo stok sebuah bahan dari seluruh ledger mutasinya.
 * - stokSetelah tiap mutasi ditulis ulang (urut createdAt, id sebagai tiebreak)
 * - bahan.stok diakhiri sesuai hasil akhir
 * - tolak (throw StockMinusError) bila saldo pernah minus dan minus tidak diizinkan
 * Return: stok akhir.
 */
export async function recalcBahanStock(
  client: TxClient,
  bahanId: string,
  opts: { allowNegative: boolean; bahanNama?: string; satuan?: string },
): Promise<number> {
  const mutasi = (await client.bahanMutasi.findMany({
    where: { bahanId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, jenis: true, qty: true, stokSetelah: true },
  })) as Array<{ id: string; jenis: string; qty: number; stokSetelah: number }>

  let saldo = 0
  let minSaldo = 0
  for (const m of mutasi) {
    const q = Number(m.qty) || 0
    if (m.jenis === 'keluar') saldo -= q
    else saldo += q // masuk & penyesuaian (qty penyesuaian boleh negatif)
    if (saldo < minSaldo) minSaldo = saldo
    const fixed = Math.round(saldo * 1e6) / 1e6
    if (fixed !== Number(m.stokSetelah)) {
      await (client as Prisma.TransactionClient).bahanMutasi.update({
        where: { id: m.id },
        data: { stokSetelah: fixed },
      })
    }
  }

  if (minSaldo < 0 && !opts.allowNegative) {
    throw new StockMinusError(opts.bahanNama || 'bahan', Math.round(saldo * 1e6) / 1e6, opts.satuan || '')
  }

  const final = Math.round(saldo * 1e6) / 1e6
  await (client as Prisma.TransactionClient).bahan.update({
    where: { id: bahanId },
    data: { stok: final },
  })
  return final
}
