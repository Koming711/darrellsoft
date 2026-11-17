/**
 * Konsistensi hitungan "akun" antara Beranda Admin dan halaman Kelola Pengguna.
 *
 * Kelola Pengguna menampilkan baris OWNER saja — anggota grup (peran selain
 * owner) dipesat ke dalam panel grup milik baris owner-nya (muncul saat baris
 * owner diklik). Permintaan owner: kartu "Total Akun Terdaftar" di Beranda
 * harus konsisten dgn halaman tsb — anggota grup TIDAK dihitung sebagai akun
 * terpisah ("grup tidak dihitung"), termasuk di popup perincian kartu.
 *
 * Aturan penyembunyian (identik dgn logika collapse di
 * /api/panel-admin/subscriptions): anggota grup hanya dihitung tersembunyi
 * bila grupnya punya baris owner yang akunnya benar-benar terdaftar
 * (Pengguna/CalonPembeli). Bila akun owner tidak ada, Kelola Pengguna
 * menampilkan grup apa adanya (tidak di-collapse) — berarti anggotanya tetap
 * dihitung.
 */
import { db } from '@/lib/db'

export async function hiddenGroupMemberIds(allAccountIds: Iterable<string>): Promise<Set<string>> {
  const akunSet = new Set(allAccountIds)
  const rows = await db.grupAnggota.findMany({
    where: { status: { not: 'keluar' } },
    select: { memberId: true, peran: true, grupId: true },
  })

  // Owner per grup — hanya bila akun owner ada di daftar akun terdaftar.
  const ownerByGrup = new Map<string, string>()
  for (const g of rows) {
    if (g.peran === 'owner' && akunSet.has(g.memberId)) ownerByGrup.set(g.grupId, g.memberId)
  }

  const hidden = new Set<string>()
  for (const g of rows) {
    if (g.peran === 'owner') continue // owner selalu tampil & dihitung
    if (ownerByGrup.has(g.grupId)) hidden.add(g.memberId)
  }
  return hidden
}
