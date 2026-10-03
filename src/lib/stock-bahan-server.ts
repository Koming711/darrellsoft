import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Engine Stock Bahan (server-side).
 *
 * Prinsip:
 * - Semua perubahan stok hanya lewat transaksi ledger (BahanMasuk/BahanKeluar/BahanPenyesuaian).
 * - `recalcBahan` memutar ulang (replay) semua transaksi secara kronologis
 *   → saldo stok baru + regenerasi BahanMutasi (stock movements) yang konsisten.
 * - Edit/hapus transaksi lama otomatis memperbarui stok via recalc ulang.
 * - Harga modal terakhir = harga beli dari stok masuk terakhir (transaksi lama tidak diubah).
 */

/** Nomor transaksi berikutnya: STK-0001, STK-0002, ... (urutan persist, tak dipakai ulang). */
export async function nextStkNumber(userId: string | null): Promise<string> {
  const key = `stockBahan|STK|${userId ?? 'global'}`
  const counter = await db.documentCounter.upsert({
    where: { key },
    update: { lastNum: { increment: 1 } },
    create: { key, lastNum: 1 },
  })
  return `STK-${String(counter.lastNum).padStart(4, '0')}`
}

/** YYYY-MM-DD dari objek Date (waktu lokal server). */
export function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tanggal hari ini YYYY-MM-DD. */
export function todayStr(): string {
  return dateOnly(new Date())
}

interface LedgerEvent {
  kind: 'masuk' | 'keluar' | 'penyesuaian'
  id: string
  nomor: string
  tanggal: string
  createdAt: Date
  qty: number // masuk/keluar: jumlah; penyesuaian: tidak dipakai
  delta: number // perubahan saldo (penyesuaian: stokFisik - stokSistem snapshot)
  stokFisik: number
  hargaBeli: number
  keterangan: string
}

function cmpEvent(a: LedgerEvent, b: LedgerEvent): number {
  // Urut kronologis: tanggal → createdAt → id (stabil & portabel)
  if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1
  const ta = a.createdAt.getTime()
  const tb = b.createdAt.getTime()
  if (ta !== tb) return ta - tb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Putar ulang seluruh transaksi satu bahan → perbarui stok + harga modal
 * terakhir + regenerasi ledger BahanMutasi. Mengembalikan saldo akhir.
 */
export async function recalcBahan(bahanId: string): Promise<number> {
  const bahan = await db.bahan.findUnique({ where: { id: bahanId } })
  if (!bahan) throw new Error('Bahan tidak ditemukan')

  const [masukRows, keluarRows, adjRows] = await Promise.all([
    db.bahanMasuk.findMany({ where: { bahanId } }),
    db.bahanKeluar.findMany({ where: { bahanId } }),
    db.bahanPenyesuaian.findMany({ where: { bahanId } }),
  ])

  const events: LedgerEvent[] = []

  for (const m of masukRows) {
    const parts: string[] = []
    if (m.suplierNama) parts.push(m.suplierNama)
    if (m.nomorNota) parts.push(`Nota ${m.nomorNota}`)
    if (m.poNomor) parts.push(`PO ${m.poNomor}`)
    if (m.catatan) parts.push(m.catatan)
    events.push({
      kind: 'masuk',
      id: m.id,
      nomor: m.nomor,
      tanggal: m.tanggal || dateOnly(m.createdAt),
      createdAt: m.createdAt,
      qty: m.qty,
      delta: m.qty,
      stokFisik: 0,
      hargaBeli: m.hargaBeli,
      keterangan: parts.join(' — ') || 'Stok masuk',
    })
  }

  for (const k of keluarRows) {
    const parts: string[] = []
    if (k.tujuan) parts.push(k.tujuan)
    if (k.catatan) parts.push(k.catatan)
    events.push({
      kind: 'keluar',
      id: k.id,
      nomor: k.nomor,
      tanggal: k.tanggal || dateOnly(k.createdAt),
      createdAt: k.createdAt,
      qty: k.qty,
      delta: -k.qty,
      stokFisik: 0,
      hargaBeli: 0,
      keterangan: parts.join(' — ') || 'Stok keluar',
    })
  }

  for (const a of adjRows) {
    const parts: string[] = []
    if (a.alasan) parts.push(a.alasan)
    if (a.catatan) parts.push(a.catatan)
    events.push({
      kind: 'penyesuaian',
      id: a.id,
      nomor: a.nomor,
      tanggal: a.tanggal || dateOnly(a.createdAt),
      createdAt: a.createdAt,
      qty: Math.abs(a.selisih),
      delta: a.stokFisik - a.stokSistem,
      stokFisik: a.stokFisik,
      hargaBeli: 0,
      keterangan: parts.join(' — ') || 'Penyesuaian stok',
    })
  }

  events.sort(cmpEvent)

  let saldo = 0
  let hargaTerakhir = bahan.hargaSatuan
  const mutasiRows: Prisma.BahanMutasiCreateManyInput[] = []

  for (const ev of events) {
    const saldoSebelum = saldo
    if (ev.kind === 'penyesuaian') {
      // Penyesuaian = SET absolut ke stok fisik (bukan delta snapshot),
      // agar replay tetap benar walau transaksi sebelumnya diedit/dihapus.
      saldo = ev.stokFisik
    } else {
      saldo += ev.delta
    }
    if (ev.kind === 'masuk' && ev.hargaBeli > 0) {
      hargaTerakhir = ev.hargaBeli
    }
    const deltaAktual = saldo - saldoSebelum
    const masukCol = deltaAktual > 0 ? deltaAktual : 0
    const keluarCol = deltaAktual < 0 ? -deltaAktual : 0
    mutasiRows.push({
      bahanId,
      jenis: ev.kind,
      qty: Math.abs(deltaAktual),
      masuk: masukCol,
      keluar: keluarCol,
      stokSetelah: saldo,
      nomor: ev.nomor,
      tanggal: ev.tanggal,
      refId: ev.id,
      keterangan: ev.kind === 'penyesuaian'
        ? `${ev.keterangan} (sistem ${fmtNum(saldoSebelum)} → fisik ${fmtNum(ev.stokFisik)})`
        : ev.keterangan,
      userId: bahan.userId,
    })
  }

  await db.$transaction([
    db.bahan.update({
      where: { id: bahanId },
      data: { stok: saldo, hargaSatuan: hargaTerakhir },
    }),
    db.bahanMutasi.deleteMany({ where: { bahanId } }),
    db.bahanMutasi.createMany({ data: mutasiRows }),
  ])

  return saldo
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
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

/** Baca pengaturan Stock Bahan (tabel Setting, global). */
export async function getStockPengaturan(): Promise<{ allowNegativeStock: boolean }> {
  const row = await db.setting.findUnique({ where: { key: 'stock_allow_negative' } })
  return { allowNegativeStock: row?.value === 'true' }
}

/** Simpan pengaturan Stock Bahan. */
export async function setStockPengaturan(allowNegativeStock: boolean): Promise<void> {
  await db.setting.upsert({
    where: { key: 'stock_allow_negative' },
    update: { value: allowNegativeStock ? 'true' : 'false' },
    create: { key: 'stock_allow_negative', value: allowNegativeStock ? 'true' : 'false' },
  })
}
