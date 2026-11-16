// GET /api/panel-admin/subscriptions — daftar langganan pelanggan untuk admin.
// ?search=  : cari nama / email / username / HP / nama perusahaan
// ?status=  : semua|belum_aktif|aktif|akan_berakhir|kedaluwarsa|ditangguhkan (status TURUNAN)
// ?withOpenPayments=1 : hanya yang punya pembayaran menunggu verifikasi
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import {
  derivedInvoiceStatus,
  derivedSubscriptionStatus,
  ensureSubscriptionSeeded,
  INVOICE_STATUS,
  SUB_STATUS,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

/** Durasi manusiawi — 15 Nov→15 Des = "1 bulan"; < 1 bulan ditampilkan dlm hari. */
const durasiLabel = (start?: Date | string | null, end?: Date | string | null) => {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() < s.getDate()) months -= 1
  if (months >= 1) return months === 1 ? '1 bulan' : `${months} bulan`
  return `${Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000))} hari`
}

/** Info grup utk baris owner — anggota staf dipesan ke sini (muncul saat baris diklik). */
interface GrupDetail {
  id: string
  nama: string
  kode: string
  status: string
  planName: string | null
  tanggalGabung: string | null
  tanggalExpired: string | null
  durasiLabel: string | null
  anggota: SubsRow[]
}

interface SubsRow {
  userId: string
  username: string
  namaLengkap: string
  email: string
  nomorHP: string
  role: string
  companyName: string
  registeredAt: Date
  expiredAt: Date | null
  subscription: {
    id: string
    planId: string | null
    planName: string
    status: string
    rawStatus: string
    startDate: Date | null
    endDate: Date | null
    suspendReason: string
  } | null
  openInvoices: {
    id: string
    invoiceNumber: string
    planName: string
    amount: number
    status: string
    dueDate: Date
    createdAt: Date
  }[]
  hasPendingPayment: boolean
  // Keterangan grup perusahaan (bila akun owner/anggota grup):
  // "Grup {nama}" + peran di grup (owner/admin/staf).
  grup: { id: string; nama: string; peran: string; ownerNama: string } | null
  // Hanya terisi pada baris OWNER grup — berisi seluruh anggota grup
  // + tanggal langganan grup (bergabung/expired/durasi).
  grupDetail: GrupDetail | null
}

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    await ensureSubscriptionSeeded()
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim().toLowerCase()
    const statusFilter = searchParams.get('status') ?? 'semua'

    // Semua pelanggan — Pengguna + CalonPembeli (pendaftaran mandiri). Isolasi tidak berlaku utk admin panel.
    const [penggunas, calons, subs] = await Promise.all([
      db.pengguna.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, namaLengkap: true, email: true, nomorHP: true, role: true, validUntil: true, createdAt: true },
      }),
      db.calonPembeli.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, nama: true, email: true, nomorHP: true, role: true, expiredDate: true, createdAt: true },
      }),
      db.customerSubscription.findMany({ include: { plan: true } }),
    ])

    const subMap = new Map(subs.map((s) => [s.userId, s]))

    // Nama perusahaan (UserSetting key=company_name)
    const companySettings = await db.userSetting.findMany({ where: { key: 'company_name' } })
    const companyMap = new Map(companySettings.map((c) => [c.userId, c.value]))

    // ===== INFO GRUP PERUSAHAAN (keterangan "Grup {owner}") =====
    // Semua anggota grup aktif (owner + admin + staf) dipetakan ke grupnya,
    // lengkap dgn nama owner grup utk keterangan di daftar pelanggan.
    const grupAnggotaRows = await db.grupAnggota.findMany({
      where: { status: { not: 'keluar' } },
      select: {
        memberId: true,
        peran: true,
        status: true,
        tanggalGabung: true,
        grup: {
          select: { id: true, nama: true, kode: true, status: true, ownerUserId: true, createdAt: true },
        },
      },
    })
    const grupMemberMap = new Map(
      grupAnggotaRows.map((g) => [
        g.memberId,
        { grupId: g.grup.id, grupNama: g.grup.nama, ownerUserId: g.grup.ownerUserId, peran: g.peran },
      ]),
    )
    // Nama owner grup — resolusi dr Pengguna/CalonPembeli (fallback: nama grup)
    const idToNama = new Map<string, string>()
    for (const u of penggunas) idToNama.set(u.id, u.namaLengkap || u.username || '')
    for (const c of calons) if (!idToNama.has(c.id)) idToNama.set(c.id, c.nama || c.username || '')
    const ownerNamaOf = (ownerUserId: string, fallback: string) =>
      idToNama.get(ownerUserId) || fallback

    // Tagihan & pembayaran terbuka per user
    const [openInvoices, pendingPayments] = await Promise.all([
      db.subscriptionInvoice.findMany({ where: { status: { in: [INVOICE_STATUS.MENUNGGU_PEMBAYARAN, INVOICE_STATUS.MENUNGGU_VERIFIKASI, INVOICE_STATUS.DITOLAK] } }, orderBy: { createdAt: 'desc' } }),
      db.subscriptionPayment.findMany({ where: { status: 'menunggu_verifikasi', deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    ])

    const buildRow = (
      u: { id: string; username: string | null; namaLengkap: string; email: string; nomorHP: string; role: string; createdAt: Date; expiredAt?: Date | null },
    ): SubsRow => {
      const sub = subMap.get(u.id) ?? null
      const derived = sub ? derivedSubscriptionStatus(sub) : SUB_STATUS.BELUM_AKTIF
      const userOpenInvoices = openInvoices.filter((i) => i.userId === u.id)
      const hasPendingPayment = pendingPayments.some((p) => p.userId === u.id)
      return {
        userId: u.id,
        username: u.username ?? '',
        namaLengkap: u.namaLengkap,
        email: u.email,
        nomorHP: u.nomorHP,
        role: u.role,
        companyName: companyMap.get(u.id) ?? '',
        registeredAt: u.createdAt,
        // Tanggal expired akun: Pengguna.validUntil / CalonPembeli.expiredDate (null = tanpa batas)
        expiredAt: u.expiredAt ?? null,
        subscription: sub
          ? {
              id: sub.id,
              planId: sub.planId,
              planName: sub.plan?.name ?? '-',
              status: derived,
              rawStatus: sub.status,
              startDate: sub.startDate,
              endDate: sub.endDate,
              suspendReason: sub.suspendReason,
            }
          : null,
        openInvoices: userOpenInvoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          planName: i.planName,
          amount: i.amount,
          status: derivedInvoiceStatus(i),
          dueDate: i.dueDate,
          createdAt: i.createdAt,
        })),
        hasPendingPayment,
        grup: (() => {
          const gm = grupMemberMap.get(u.id)
          if (!gm) return null
          return {
            id: gm.grupId,
            nama: gm.grupNama,
            peran: gm.peran,
            ownerNama: ownerNamaOf(gm.ownerUserId ?? '', gm.grupNama),
          }
        })(),
        grupDetail: null,
      }
    }

    // PERMINTAAN USER ("akun admin tidak muncul. fix"): SEMUA Pengguna tampil
    // di Kelola Pengguna — termasuk akun admin internal. UI memberi badge
    // amber utk role admin/superadmin dan mengunci tombol hapus akun admin.
    const penggunaPelanggan = penggunas

    // Gabungkan: Pengguna dulu, lalu CalonPembeli yang ID-nya belum ada (hindari duplikat)
    const penggunaIds = new Set(penggunas.map((u) => u.id))
    const calonRows = calons
      .filter((c) => !penggunaIds.has(c.id))
      .map((c) =>
        buildRow({
          id: c.id,
          username: c.username,
          namaLengkap: c.nama,
          email: c.email,
          nomorHP: c.nomorHP,
          role: c.role,
          createdAt: c.createdAt,
          expiredAt: c.expiredDate,
        }),
      )

    const rows: SubsRow[] = [
      ...penggunaPelanggan.map((u) => buildRow({ ...u, expiredAt: u.validUntil })),
      ...calonRows,
    ]

    // ===== PERMINTAAN USER: tabel hanya menampilkan OWNER =====
    // Anggota staf/admin grup disembunyikan dari daftar utama dan dipindahkan
    // ke grupDetail milik baris owner — baru muncul saat baris owner diklik.
    // Bila baris owner tidak ada di daftar (kasus langka), grup DIBIARKAN
    // tampil normal agar tidak ada akun yang hilang.
    const rowById = new Map(rows.map((r) => [r.userId, r]))
    const grupInfo = new Map<
      string,
      { nama: string; kode: string; status: string; ownerUserId: string | null; createdAt: Date }
    >()
    const memberRowsByGrup = new Map<string, SubsRow[]>()
    for (const ga of grupAnggotaRows) {
      if (!grupInfo.has(ga.grup.id)) grupInfo.set(ga.grup.id, ga.grup)
      const mrow = rowById.get(ga.memberId)
      if (!mrow) continue
      const list = memberRowsByGrup.get(ga.grup.id) ?? []
      list.push(mrow)
      memberRowsByGrup.set(ga.grup.id, list)
    }

    const ownerRowByGrup = new Map<string, SubsRow>()
    for (const r of rows) if (r.grup?.peran === 'owner') ownerRowByGrup.set(r.grup.id, r)

    const grupDetailByOwner = new Map<string, GrupDetail>()
    const hiddenIds = new Set<string>()
    for (const [grupId, ownerRow] of ownerRowByGrup) {
      const info = grupInfo.get(grupId)
      if (!info) continue
      const anggota = (memberRowsByGrup.get(grupId) ?? [])
        .filter((m) => m.userId !== ownerRow.userId)
        .sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime())
      // Tanggal langganan grup = langganan owner (mis. bergabung 15 Nov →
      // expired 15 Des = 1 bulan) — bukan validUntil akun.
      const sub = ownerRow.subscription
      const tanggalGabung = sub?.startDate ?? info.createdAt
      const tanggalExpired = sub?.endDate ?? null
      for (const m of anggota) hiddenIds.add(m.userId)
      grupDetailByOwner.set(ownerRow.userId, {
        id: grupId,
        nama: info.nama,
        kode: info.kode,
        status: info.status,
        planName: sub?.planName ?? null,
        tanggalGabung: new Date(tanggalGabung).toISOString(),
        tanggalExpired: tanggalExpired ? new Date(tanggalExpired).toISOString() : null,
        durasiLabel: durasiLabel(tanggalGabung, tanggalExpired),
        anggota: [ownerRow, ...anggota],
      })
    }

    let visibleRows: SubsRow[] = rows
      .filter((r) => !hiddenIds.has(r.userId))
      .map((r) => ({ ...r, grupDetail: grupDetailByOwner.get(r.userId) ?? null }))

    if (search) {
      const matchRow = (r: SubsRow) =>
        (r.namaLengkap ?? '').toLowerCase().includes(search) ||
        (r.email ?? '').toLowerCase().includes(search) ||
        (r.username ?? '').toLowerCase().includes(search) ||
        (r.nomorHP ?? '').toLowerCase().includes(search) ||
        (r.companyName ?? '').toLowerCase().includes(search)
      // Pencarian juga mengenali anggota grup yang tersembunyi di dalam owner.
      visibleRows = visibleRows.filter((r) => matchRow(r) || (r.grupDetail?.anggota ?? []).some(matchRow))
    }
    if (statusFilter && statusFilter !== 'semua') {
      visibleRows = visibleRows.filter(
        (r) => (r.subscription?.status ?? SUB_STATUS.BELUM_AKTIF) === statusFilter,
      )
    }

    return NextResponse.json({
      subscriptions: visibleRows,
      total: visibleRows.length,
      // Jumlah akun terdaftar sesungguhnya (termasuk anggota grup tersembunyi).
      totalTerdaftar: rows.length,
    })
  } catch (error) {
    console.error('GET /api/panel-admin/subscriptions error:', error)
    return NextResponse.json({ error: 'Gagal memuat daftar pelanggan' }, { status: 500 })
  }
}
