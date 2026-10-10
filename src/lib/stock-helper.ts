import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

/**
 * Helper modul Stock Bahan — semua perubahan transaksi stok melewati sini
 * agar stok material, harga modal, dan buku besar StockMovement selalu konsisten.
 */

/** Buat nomor transaksi berurutan: PREFIX-YYMM-0001 (berdasar tanggal transaksi). */
export async function nextStockNomor(
  prefix: 'SM' | 'SK' | 'SA',
  tanggal: Date
): Promise<string> {
  const yy = String(tanggal.getFullYear()).slice(-2)
  const mm = String(tanggal.getMonth() + 1).padStart(2, '0')
  const datePrefix = `${prefix}-${yy}${mm}`

  const model =
    prefix === 'SM' ? db.stockIn : prefix === 'SK' ? db.stockOut : db.stockAdjustment
  const last = await model.findFirst({
    where: { nomor: { startsWith: `${datePrefix}-` } },
    orderBy: { nomor: 'desc' },
    select: { nomor: true },
  })
  let seq = 0
  if (last) {
    const parsed = parseInt(last.nomor.split('-').pop() || '0', 10)
    if (Number.isFinite(parsed)) seq = parsed
  }
  return `${datePrefix}-${String(seq + 1).padStart(4, '0')}`
}

export interface MovementRow {
  tanggal: Date
  jenis: 'masuk' | 'keluar' | 'penyesuaian'
  masuk: number
  keluar: number
  saldo: number
  refId: string
  refNomor: string
  keterangan: string
}

/**
 * Rebuild buku besar StockMovement satu material dari seluruh transaksinya,
 * lalu perbarui material.stok & material.hargaModal.
 * Dipanggil di dalam db.$transaction setiap CUD transaksi stok.
 */
export async function rebuildMaterialLedger(
  tx: Tx,
  materialId: string,
  userId?: string | null
): Promise<{ stok: number; hargaModal: number }> {
  const [ins, outs, adjustments] = await Promise.all([
    tx.stockIn.findMany({
      where: { materialId },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
      include: { supplier: { select: { nama: true } } },
    }),
    tx.stockOut.findMany({
      where: { materialId },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    }),
    tx.stockAdjustment.findMany({
      where: { materialId },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  type Row = { t: Date; c: Date; row: MovementRow }
  const rows: Row[] = []

  for (const t of ins) {
    rows.push({
      t: t.tanggal,
      c: t.createdAt,
      row: {
        tanggal: t.tanggal,
        jenis: 'masuk',
        masuk: t.jumlah,
        keluar: 0,
        saldo: 0,
        refId: t.id,
        refNomor: t.nomor,
        keterangan: t.supplier?.nama
          ? `Pembelian — ${t.supplier.nama}`
          : t.nomorNota
            ? `Pembelian — nota ${t.nomorNota}`
            : 'Stok masuk',
      },
    })
  }
  for (const t of outs) {
    rows.push({
      t: t.tanggal,
      c: t.createdAt,
      row: {
        tanggal: t.tanggal,
        jenis: 'keluar',
        masuk: 0,
        keluar: t.jumlah,
        saldo: 0,
        refId: t.id,
        refNomor: t.nomor,
        keterangan: t.tujuan || 'Stok keluar',
      },
    })
  }
  for (const t of adjustments) {
    const delta = t.selisih
    rows.push({
      t: t.tanggal,
      c: t.createdAt,
      row: {
        tanggal: t.tanggal,
        jenis: 'penyesuaian',
        masuk: delta > 0 ? delta : 0,
        keluar: delta < 0 ? Math.abs(delta) : 0,
        saldo: 0,
        refId: t.id,
        refNomor: t.nomor,
        keterangan: t.alasan ? `Penyesuaian — ${t.alasan}` : 'Penyesuaian stok',
      },
    })
  }

  // Urut kronologis; transaksi di tanggal sama mengikuti urutan dibuat.
  rows.sort((a, b) => a.t.getTime() - b.t.getTime() || a.c.getTime() - b.c.getTime())

  let saldo = 0
  const movementRows = rows.map(r => {
    saldo += r.row.masuk - r.row.keluar
    return { ...r.row, saldo, materialId, userId: userId ?? null }
  })

  await tx.stockMovement.deleteMany({ where: { materialId } })
  if (movementRows.length > 0) {
    await tx.stockMovement.createMany({ data: movementRows })
  }

  // Harga modal terakhir = harga beli StockIn paling akhir (tanggal, lalu createdAt).
  let hargaModal = 0
  for (const t of ins) {
    if (t.hargaBeli > 0) hargaModal = t.hargaBeli
  }

  await tx.stockMaterial.update({
    where: { id: materialId },
    data: { stok: saldo, hargaModal },
  })

  return { stok: saldo, hargaModal }
}

/** Baca setting izin stok minus (per-user UserSetting → global Setting). Default: false. */
export async function isNegativeStockAllowed(userId: string | null | undefined): Promise<boolean> {
  try {
    if (userId) {
      const userSetting = await db.userSetting.findUnique({
        where: { userId_key: { userId, key: 'stock_allow_negative' } },
      })
      if (userSetting) return userSetting.value === 'true'
    }
    const globalSetting = await db.setting.findUnique({ where: { key: 'stock_allow_negative' } })
    return globalSetting?.value === 'true'
  } catch {
    return false
  }
}

/** Klasifikasi status stok sesuai spec: Aman / Menipis / Habis. */
export function statusStok(stok: number, stokMin: number): 'aman' | 'menipis' | 'habis' {
  if (stok <= 0) return 'habis'
  if (stokMin > 0 && stok <= stokMin) return 'menipis'
  return 'aman'
}
