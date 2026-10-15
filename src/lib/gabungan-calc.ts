/**
 * gabungan-calc — LOGIKA PERHITUNGAN GABUNGAN 2 RIWAYAT HITUNG CETAKAN.
 *
 * SATU SUMBER KEBENARAN untuk kalkulasi gabungan — dipakai:
 *  1. Server (API /api/gabungan-cetakan) saat POST/PATCH: hasil disimpan
 *     selalu dihitung ulang dari DATA ASLI DATABASE, bukan dipercaya dari klien.
 *  2. Klien (gabungan-tab) untuk kalkulasi live saat memilih/mengatur.
 *
 * RUMUS (tidak mengubah hasil perhitungan asli tiap riwayat):
 *   totalBiayaDasar = subTotal R1 + subTotal R2
 *     (subTotal pada RiwayatCetakan = total biaya dasar TANPA profit —
 *      grandTotal riwayat = subTotal + profitAmount, terverifikasi dari
 *      pola tampil "Modal/pcs = subTotal ÷ JP" & "Jual/pcs = grandTotal ÷ JP")
 *   profit gabungan:
 *     - metode "masing_masing": profitAmount R1 + profitAmount R2
 *     - metode "seragam"     : totalBiayaDasar × profitPercent ÷ 100
 *   grandTotal = totalBiayaDasar + totalProfit
 *     (semua biaya lain — kertas, plat, ongkos cetak, finishing, lem,
 *      packing, kirim, biaya lain — SUDAH termasuk di subTotal tiap
 *      riwayat sehingga TIDAK dijumlahkan sekali lagi; hindari dobel)
 *   jumlahPesananGabungan:
 *     - JP kedua riwayat SAMA  → boleh auto-isi dengan nilai itu
 *     - JP BERBEDA             → WAJIB ditentukan user (tidak boleh asal
 *                                dijumlahkan) — flag `jpBeda` untuk UI warning
 *   modalPerPcs     = totalBiayaDasar ÷ jumlahPesananGabungan (0 bila JP tak valid)
 *   hargaJualPerPcs = grandTotal      ÷ jumlahPesananGabungan (0 bila JP tak valid)
 *
 * Snapshot: salinan JSON kedua baris sumber disimpan bersama dokumen agar
 * dokumen gabungan tetap utuh walau sumber berubah; perbandingan
 * `updatedAt` sumber dipakai untuk deteksi "sumber telah berubah".
 */

// ============================================================
// Tipe
// ============================================================

/** Metode profit gabungan. */
export type GabunganMetodeProfit = 'masing_masing' | 'seragam'

/** Field riwayat sumber yang dipakai kalkulasi (subset baris /api/riwayat-cetakan). */
export interface GabunganSourceRow {
  id?: string | null
  nomorUrut?: string | null
  updatedAt?: string | null
  customerName?: string | null
  printName?: string | null
  subTotal?: number | null
  profitPercent?: number | null
  profitAmount?: number | null
  grandTotal?: number | null
  jumlahPesanan?: string | null
  quantity?: string | null
}

/** Hasil kalkulasi gabungan. */
export interface GabunganHasil {
  subTotal1: number
  subTotal2: number
  profit1: number
  profit2: number
  profitPercent1: number
  profitPercent2: number
  grandTotal1: number
  grandTotal2: number
  jp1: number
  jp2: number
  /** true bila JP kedua sumber terisi & berbeda nilai */
  jpBeda: boolean
  /** true bila JP kedua sumber terisi & sama */
  jpSama: boolean
  /** JP auto-suggest (dipakai bila jpSama; 0 bila tidak bisa) */
  jpAuto: number
  /** JP yang dipakai untuk hasil (dari input user atau auto) */
  jumlahPesananGabungan: number
  metodeProfit: GabunganMetodeProfit
  profitPercent: number
  totalBiayaDasar: number
  totalProfit: number
  grandTotal: number
  modalPerPcs: number
  hargaJualPerPcs: number
  /** pesan validasi (kosong = OK) */
  peringatan: string[]
}

// ============================================================
// Helper
// ============================================================

/** Parse jumlah pesanan dari field string riwayat — angka pertama yang valid. */
export function parseJpValue(s: unknown): number {
  const v = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10)
  return isNaN(v) ? 0 : v
}

const num = (v: unknown): number => {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

// ============================================================
// Kalkulasi utama
// ============================================================

export interface GabunganCalcInput {
  src1: GabunganSourceRow | null | undefined
  src2: GabunganSourceRow | null | undefined
  /** JP gabungan dari input user (0/undefined = pakai auto bila bisa) */
  jumlahPesananGabungan?: number | string
  metodeProfit?: GabunganMetodeProfit | string
  /** persen profit seragam (dipakai bila metodeProfit = 'seragam') */
  profitPercent?: number | string
}

/**
 * Hitung gabungan dari dua baris sumber. MURNI FUNGSI — tanpa side effect,
 * tidak mengubah data sumber, aman dipanggil di server & klien.
 */
export function hitungGabungan({
  src1,
  src2,
  jumlahPesananGabungan,
  metodeProfit = 'masing_masing',
  profitPercent = 0,
}: GabunganCalcInput): GabunganHasil {
  const peringatan: string[] = []

  const sub1 = num(src1?.subTotal)
  const sub2 = num(src2?.subTotal)
  const p1 = num(src1?.profitAmount)
  const p2 = num(src2?.profitAmount)
  const pct1 = Math.round(num(src1?.profitPercent))
  const pct2 = Math.round(num(src2?.profitPercent))
  const g1 = num(src1?.grandTotal)
  const g2 = num(src2?.grandTotal)
  const jp1 = parseJpValue(src1?.jumlahPesanan) || parseJpValue(src1?.quantity)
  const jp2 = parseJpValue(src2?.jumlahPesanan) || parseJpValue(src2?.quantity)

  // === A. Total biaya dasar gabungan (TANPA profit — subTotal riwayat sudah
  //        memuat seluruh komponen biaya produksi) ===
  const totalBiayaDasar = sub1 + sub2

  // === B. Profit gabungan (2 metode) ===
  const metode: GabunganMetodeProfit = metodeProfit === 'seragam' ? 'seragam' : 'masing_masing'
  const pctInput = parseFloat(String(profitPercent ?? '0').replace(',', '.')) || 0
  const pctClamped = Math.min(Math.max(pctInput, 0), 100)
  const totalProfit =
    metode === 'seragam'
      ? (totalBiayaDasar * pctClamped) / 100
      : p1 + p2

  // === C. Grand total (tanpa dobel hitung — biaya lain sudah di subTotal) ===
  const grandTotal = totalBiayaDasar + totalProfit

  // === D. Jumlah pesanan gabungan ===
  const jpSama = jp1 > 0 && jp2 > 0 && jp1 === jp2
  const jpBeda = jp1 > 0 && jp2 > 0 && jp1 !== jp2
  const jpAuto = jpSama ? jp1 : 0
  let jp = parseInt(String(jumlahPesananGabungan ?? ''), 10)
  if (isNaN(jp) || jp <= 0) jp = 0
  const jpFinal = jp > 0 ? jp : jpAuto

  if (jpBeda && jpFinal <= 0) {
    peringatan.push(
      `Jumlah pesanan kedua riwayat berbeda (${jp1.toLocaleString('id-ID')} vs ${jp2.toLocaleString('id-ID')}) — tentukan Jumlah Pesanan Gabungan yang benar.`
    )
  }
  if (metode === 'seragam' && pctInput > 100) {
    peringatan.push('Profit seragam dibatasi maksimal 100%.')
  }

  // === E. Harga per pcs (tidak sah bila JP = 0 → kembalikan 0, UI tampil "-") ===
  const modalPerPcs = jpFinal > 0 ? totalBiayaDasar / jpFinal : 0
  const hargaJualPerPcs = jpFinal > 0 ? grandTotal / jpFinal : 0

  return {
    subTotal1: sub1,
    subTotal2: sub2,
    profit1: p1,
    profit2: p2,
    profitPercent1: pct1,
    profitPercent2: pct2,
    grandTotal1: g1,
    grandTotal2: g2,
    jp1,
    jp2,
    jpBeda,
    jpSama,
    jpAuto,
    jumlahPesananGabungan: jpFinal,
    metodeProfit: metode,
    profitPercent: metode === 'seragam' ? pctClamped : 0,
    totalBiayaDasar,
    totalProfit,
    grandTotal,
    modalPerPcs,
    hargaJualPerPcs,
    peringatan,
  }
}

// ============================================================
// Snapshot helpers
// ============================================================

/** Field sumber yang disimpan dalam snapshot (JSON gabunganData). */
export interface GabunganSnapshot {
  r1: Record<string, unknown>
  r2: Record<string, unknown>
  savedAt: string
}

/** Buat snapshot JSON (string) dari dua baris sumber. */
export function buildSnapshot(
  r1: Record<string, unknown> | null,
  r2: Record<string, unknown> | null,
  savedAt: Date = new Date()
): string {
  const snap: GabunganSnapshot = {
    r1: r1 || {},
    r2: r2 || {},
    savedAt: savedAt.toISOString(),
  }
  return JSON.stringify(snap)
}

/** Parse snapshot JSON — aman terhadap data rusak. */
export function parseSnapshot(raw: unknown): GabunganSnapshot | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    return {
      r1: (obj.r1 && typeof obj.r1 === 'object' ? obj.r1 : {}) as Record<string, unknown>,
      r2: (obj.r2 && typeof obj.r2 === 'object' ? obj.r2 : {}) as Record<string, unknown>,
      savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : '',
    }
  } catch {
    return null
  }
}

/**
 * Status kesegaran sumber terhadap snapshot:
 *  - 'ok'             : kedua sumber masih ada & updatedAt cocok dengan snapshot
 *  - 'berubah'        : sumber masih ada tetapi updatedAt ≠ snapshot (sudah diedit)
 *  - 'hilang'         : salah satu/kedua sumber tidak ditemukan lagi (dihapus)
 */
export type GabunganStatusSumber = 'ok' | 'berubah' | 'hilang'

export function statusSumber(
  snapshot: GabunganSnapshot | null,
  live1: { updatedAt?: string | null } | null | undefined,
  live2: { updatedAt?: string | null } | null | undefined
): GabunganStatusSumber {
  if (!snapshot || !snapshot.r1 || !snapshot.r2) return 'ok'
  if (!live1 || !live2) return 'hilang'
  const snap1 = String((snapshot.r1 as Record<string, unknown>).updatedAt ?? '')
  const snap2 = String((snapshot.r2 as Record<string, unknown>).updatedAt ?? '')
  const l1 = String(live1.updatedAt ?? '')
  const l2 = String(live2.updatedAt ?? '')
  if ((l1 && snap1 && l1 !== snap1) || (l2 && snap2 && l2 !== snap2)) return 'berubah'
  return 'ok'
}
