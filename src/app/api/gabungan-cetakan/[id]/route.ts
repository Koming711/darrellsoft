import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { hitungGabungan, buildSnapshot, parseSnapshot, type GabunganMetodeProfit } from '@/lib/gabungan-calc'

// ============================================================
// /api/gabungan-cetakan/[id] — UPDATE & DELETE dokumen gabungan
//
// PATCH  → edit nama proyek, jumlah pesanan gabungan, metode/persen profit,
//          catatan, dan (opsional) ganti riwayat sumber — bila sumber
//          diganti/diperbarui, kalkulasi dihitung ulang dari data asli DB
//          dan snapshot diperbarui.
// DELETE → hapus dokumen gabungan saja; riwayat sumber TIDAK ikut terhapus.
//
// Isolasi ketat per-user (getDataFilter) — hanya pemilik yang boleh mengubah.
// ============================================================

async function loadOwnedDoc(id: string, dataFilter: Record<string, unknown>) {
  return db.gabunganHitungCetakan.findFirst({ where: { id, ...dataFilter } })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)
    const { id } = await params
    const body = await request.json()

    const doc = await loadOwnedDoc(id, dataFilter)
    if (!doc) {
      return NextResponse.json({ error: 'Dokumen gabungan tidak ditemukan' }, { status: 404 })
    }

    // === Sumber baru (opsional) ===
    let sumberId1 = doc.riwayatCetakanId1
    let sumberId2 = doc.riwayatCetakanId2
    let sumber1: Record<string, unknown> | null = null
    let sumber2: Record<string, unknown> | null = null

    const reqId1 = body?.riwayatCetakanId1 !== undefined ? String(body.riwayatCetakanId1).trim() : sumberId1
    const reqId2 = body?.riwayatCetakanId2 !== undefined ? String(body.riwayatCetakanId2).trim() : sumberId2

    const sumberDiubah = reqId1 !== doc.riwayatCetakanId1 || reqId2 !== doc.riwayatCetakanId2
    const mintaRefreshSumber = body?.refreshSumber === true

    if (sumberDiubah) {
      if (!reqId1 || !reqId2) {
        return NextResponse.json({ error: 'Kedua riwayat sumber wajib dipilih.' }, { status: 400 })
      }
      if (reqId1 === reqId2) {
        return NextResponse.json({ error: 'Kedua riwayat sumber tidak boleh sama.' }, { status: 400 })
      }
      const rows = await db.riwayatCetakan.findMany({
        where: { id: { in: [reqId1, reqId2] }, ...dataFilter },
      })
      sumber1 = (rows.find((r) => r.id === reqId1) ?? null) as unknown as Record<string, unknown> | null
      sumber2 = (rows.find((r) => r.id === reqId2) ?? null) as unknown as Record<string, unknown> | null
      if (!sumber1 || !sumber2) {
        return NextResponse.json({ error: 'Riwayat sumber baru tidak ditemukan atau bukan milik Anda.' }, { status: 404 })
      }
      sumberId1 = reqId1
      sumberId2 = reqId2
    } else if (mintaRefreshSumber) {
      // "Perbarui dari sumber terbaru" — ambil ulang snapshot dari data asli
      // tanpa mengubah pasangan sumber. TIDAK pernah mengubah data sumber.
      const rows = await db.riwayatCetakan.findMany({
        where: { id: { in: [doc.riwayatCetakanId1, doc.riwayatCetakanId2] }, ...dataFilter },
      })
      sumber1 = (rows.find((r) => r.id === doc.riwayatCetakanId1) ?? null) as unknown as Record<string, unknown> | null
      sumber2 = (rows.find((r) => r.id === doc.riwayatCetakanId2) ?? null) as unknown as Record<string, unknown> | null
      if (!sumber1 || !sumber2) {
        return NextResponse.json(
          { error: 'Salah satu riwayat sumber sudah tidak ditemukan — snapshot dipertahankan.' },
          { status: 409 }
        )
      }
    }

    // === Kalkulasi ulang bila sumber berubah/di-refresh; selain itu pakai
    //     pengaturan baru atas data sumber dari snapshot lama ===
    let recalc = hitungGabungan({
      src1: sumber1 ?? parseSnapshot(doc.snapshotData)?.r1,
      src2: sumber2 ?? parseSnapshot(doc.snapshotData)?.r2,
      jumlahPesananGabungan: body?.jumlahPesananGabungan ?? doc.jumlahPesananGabungan,
      metodeProfit: (body?.metodeProfit ?? doc.metodeProfit) as GabunganMetodeProfit,
      profitPercent: body?.profitPercent ?? doc.profitPercent,
    })
    let snapshotBaru: string | null = null
    if (sumber1 && sumber2 && (sumberDiubah || mintaRefreshSumber)) {
      snapshotBaru = buildSnapshot(sumber1, sumber2)
    } else {
      // update angka dari pengaturan baru (snapshot lama tetap)
      recalc = hitungGabungan({
        src1: parseSnapshot(doc.snapshotData)?.r1,
        src2: parseSnapshot(doc.snapshotData)?.r2,
        jumlahPesananGabungan: body?.jumlahPesananGabungan ?? doc.jumlahPesananGabungan,
        metodeProfit: (body?.metodeProfit ?? doc.metodeProfit) as GabunganMetodeProfit,
        profitPercent: body?.profitPercent ?? doc.profitPercent,
      })
      if (!parseSnapshot(doc.snapshotData)?.r1) {
        // snapshot lama rusak/kosong → coba ambil dari DB
        const rows = await db.riwayatCetakan.findMany({
          where: { id: { in: [doc.riwayatCetakanId1, doc.riwayatCetakanId2] }, ...dataFilter },
        })
        const a = (rows.find((r) => r.id === doc.riwayatCetakanId1) ?? null) as unknown as Record<string, unknown> | null
        const b = (rows.find((r) => r.id === doc.riwayatCetakanId2) ?? null) as unknown as Record<string, unknown> | null
        if (a && b) {
          snapshotBaru = buildSnapshot(a, b)
          recalc = hitungGabungan({
            src1: a,
            src2: b,
            jumlahPesananGabungan: body?.jumlahPesananGabungan ?? doc.jumlahPesananGabungan,
            metodeProfit: (body?.metodeProfit ?? doc.metodeProfit) as GabunganMetodeProfit,
            profitPercent: body?.profitPercent ?? doc.profitPercent,
          })
        }
      }
    }

    if (recalc.jumlahPesananGabungan <= 0) {
      return NextResponse.json(
        { error: 'Jumlah Pesanan Gabungan belum valid — tentukan jumlah pesanan gabungan terlebih dahulu.', peringatan: recalc.peringatan },
        { status: 400 }
      )
    }

    const updated = await db.gabunganHitungCetakan.update({
      where: { id: doc.id },
      data: {
        namaProyek: body?.namaProyek !== undefined ? String(body.namaProyek).slice(0, 200) : doc.namaProyek,
        customerName:
          sumberDiubah && sumber1 && sumber2
            ? String(sumber1.customerName ?? sumber2.customerName ?? '')
            : doc.customerName,
        riwayatCetakanId1: sumberId1,
        riwayatCetakanId2: sumberId2,
        nomorSumber1: sumber1 ? String(sumber1.nomorUrut ?? '') : doc.nomorSumber1,
        nomorSumber2: sumber2 ? String(sumber2.nomorUrut ?? '') : doc.nomorSumber2,
        jumlahPesananGabungan: recalc.jumlahPesananGabungan,
        metodeProfit: recalc.metodeProfit,
        profitPercent: recalc.profitPercent,
        totalBiayaDasar: recalc.totalBiayaDasar,
        totalProfit: recalc.totalProfit,
        grandTotal: recalc.grandTotal,
        modalPerPcs: recalc.modalPerPcs,
        hargaJualPerPcs: recalc.hargaJualPerPcs,
        catatan: body?.catatan !== undefined ? String(body.catatan).slice(0, 2000) : doc.catatan,
        ...(snapshotBaru ? { snapshotData: snapshotBaru.length <= 500000 ? snapshotBaru : buildSnapshot(null, null) } : {}),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating gabungan cetakan:', error)
    return NextResponse.json({ error: 'Gagal memperbarui dokumen gabungan' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)
    const { id } = await params

    const doc = await loadOwnedDoc(id, dataFilter)
    if (!doc) {
      return NextResponse.json({ error: 'Dokumen gabungan tidak ditemukan' }, { status: 404 })
    }

    // Hapus HANYA dokumen gabungan — kedua riwayat sumber tetap utuh.
    await db.gabunganHitungCetakan.delete({ where: { id: doc.id } })

    return NextResponse.json({ ok: true, deletedId: doc.id })
  } catch (error) {
    console.error('Error deleting gabungan cetakan:', error)
    return NextResponse.json({ error: 'Gagal menghapus dokumen gabungan' }, { status: 500 })
  }
}
