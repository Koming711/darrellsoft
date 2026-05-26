import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const dateFilter = { createdAt: { gte: sevenDaysAgo } }
    const combinedFilter = { ...dataFilter, ...dateFilter }

    // DocumentHistory filters for each doc type
    const invoiceFilter = { docType: 'invoice', ...dateFilter }
    const suratJalanFilter = { docType: 'surat-jalan', ...dateFilter }
    const purchaseOrderFilter = { docType: 'purchase-order', ...dateFilter }

    // Aggregate counts and totals for each riwayat type (last 7 days)
    const [
      cetakanAgg,
      finishingAgg,
      ongkosCetakAgg,
      hargaKertasAgg,
      potongKertasAgg,
      invoiceAgg,
      suratJalanAgg,
      purchaseOrderAgg,
    ] = await Promise.all([
      db.riwayatCetakan.aggregate({ where: combinedFilter, _count: true, _sum: { grandTotal: true, profitAmount: true } }),
      db.riwayatFinishing.aggregate({ where: combinedFilter, _count: true, _sum: { totalCost: true } }),
      db.riwayatOngkosCetak.aggregate({ where: combinedFilter, _count: true, _sum: { totalOngkosCetak: true, totalOngkosCetak2: true } }),
      db.riwayatHargaKertas.aggregate({ where: combinedFilter, _count: true, _sum: { totalPrice: true } }),
      db.riwayatPotongKertas.aggregate({ where: combinedFilter, _count: true, _sum: { totalPrice: true } }),
      db.documentHistory.aggregate({ where: invoiceFilter, _count: true }),
      db.documentHistory.aggregate({ where: suratJalanFilter, _count: true }),
      db.documentHistory.aggregate({ where: purchaseOrderFilter, _count: true }),
    ])

    // Recent 10 records for each category
    const [
      recentCetakan,
      recentPotongKertas,
      recentInvoice,
      recentSuratJalan,
      recentPurchaseOrder,
    ] = await Promise.all([
      db.riwayatCetakan.findMany({
        where: combinedFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, printName: true, customerName: true, profitAmount: true, finishingNames: true, jumlahPesanan: true, grandTotal: true, createdAt: true },
      }),
      db.riwayatPotongKertas.findMany({
        where: combinedFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, namaCetakan: true, namaCustomer: true, paperName: true, paperWidth: true, paperHeight: true, cutWidth: true, cutHeight: true, jumlahPesanan: true, totalPrice: true, createdAt: true },
      }),
      db.documentHistory.findMany({
        where: invoiceFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, nomor: true, pihakKedua: true, dataJson: true, createdAt: true },
      }),
      db.documentHistory.findMany({
        where: suratJalanFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, nomor: true, pihakKedua: true, createdAt: true },
      }),
      db.documentHistory.findMany({
        where: purchaseOrderFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, nomor: true, pihakKedua: true, dataJson: true, createdAt: true },
      }),
    ])

    // Calculate invoice total from dataJson (7 days)
    let invoiceTotal = 0
    const allInvoiceHistory = await db.documentHistory.findMany({
      where: invoiceFilter,
      select: { dataJson: true },
    })
    for (const inv of allInvoiceHistory) {
      try {
        const data = JSON.parse(inv.dataJson)
        const subtotal = (data.items || []).reduce((sum: number, item: { qty: number; harga: number }) => sum + item.qty * item.harga, 0)
        const ppn = subtotal * ((data.ppn || 0) / 100)
        invoiceTotal += subtotal + ppn
      } catch {
        // skip unparseable
      }
    }

    // Calculate purchase order total from dataJson
    let purchaseOrderTotal = 0
    const allPOHistory = await db.documentHistory.findMany({
      where: purchaseOrderFilter,
      select: { dataJson: true },
    })
    for (const po of allPOHistory) {
      try {
        const data = JSON.parse(po.dataJson)
        const subtotal = (data.items || []).reduce((sum: number, item: { qty: number; harga: number }) => sum + item.qty * item.harga, 0)
        const ppn = subtotal * ((data.ppn || 0) / 100)
        purchaseOrderTotal += subtotal + ppn
      } catch {
        // skip unparseable
      }
    }

    // Calculate monthly invoice total for "Total Pendapatan"
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthlyInvoiceFilter = { docType: 'invoice', createdAt: { gte: monthStart } }
    let monthlyRevenue = 0
    const monthlyInvoices = await db.documentHistory.findMany({
      where: monthlyInvoiceFilter,
      select: { dataJson: true },
    })
    for (const inv of monthlyInvoices) {
      try {
        const data = JSON.parse(inv.dataJson)
        const subtotal = (data.items || []).reduce((sum: number, item: { qty: number; harga: number }) => sum + item.qty * item.harga, 0)
        const ppn = subtotal * ((data.ppn || 0) / 100)
        monthlyRevenue += subtotal + ppn
      } catch {
        // skip unparseable
      }
    }

    // Daily counts for chart (last 7 days)
    const dailyData: Record<string, { calculations: number; documents: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      dailyData[key] = { calculations: 0, documents: 0 }
    }

    // Count all riwayat per day
    const allRiwayatDates = await Promise.all([
      db.riwayatCetakan.findMany({ where: combinedFilter, select: { createdAt: true } }),
      db.riwayatFinishing.findMany({ where: combinedFilter, select: { createdAt: true } }),
      db.riwayatOngkosCetak.findMany({ where: combinedFilter, select: { createdAt: true } }),
      db.riwayatHargaKertas.findMany({ where: combinedFilter, select: { createdAt: true } }),
      db.riwayatPotongKertas.findMany({ where: combinedFilter, select: { createdAt: true } }),
    ])

    for (const records of allRiwayatDates) {
      for (const r of records) {
        const key = r.createdAt.toISOString().split('T')[0]
        if (dailyData[key]) dailyData[key].calculations++
      }
    }

    const allDocDates = await db.documentHistory.findMany({
      where: { ...dateFilter },
      select: { docType: true, createdAt: true },
    })

    for (const r of allDocDates) {
      const key = r.createdAt.toISOString().split('T')[0]
      if (dailyData[key]) dailyData[key].documents++
    }

    const totalCalculations =
      cetakanAgg._count + finishingAgg._count + ongkosCetakAgg._count + hargaKertasAgg._count + potongKertasAgg._count
    const totalDocuments = invoiceAgg._count + suratJalanAgg._count + purchaseOrderAgg._count

    const totalRevenue = monthlyRevenue

    // Calculate today's sales (Penjualan Hari Ini)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayFilter = { createdAt: { gte: todayStart } }

    const todayCetakanAgg = await db.riwayatCetakan.aggregate({
      where: { ...dataFilter, ...todayFilter },
      _count: true,
      _sum: { grandTotal: true },
    })

    const todayInvoiceHistory = await db.documentHistory.findMany({
      where: { docType: 'invoice', ...todayFilter },
      select: { dataJson: true },
    })
    let todayInvoiceRevenue = 0
    for (const inv of todayInvoiceHistory) {
      try {
        const data = JSON.parse(inv.dataJson)
        const subtotal = (data.items || []).reduce((sum: number, item: { qty: number; harga: number }) => sum + item.qty * item.harga, 0)
        const ppn = subtotal * ((data.ppn || 0) / 100)
        todayInvoiceRevenue += subtotal + ppn
      } catch {}
    }

    const todaySales = (todayCetakanAgg._sum.grandTotal || 0) + todayInvoiceRevenue
    const todayOrderCount = todayCetakanAgg._count + todayInvoiceHistory.length

    return NextResponse.json({
      summary: {
        calculations: {
          cetakan: cetakanAgg._count,
          finishing: finishingAgg._count,
          ongkosCetak: ongkosCetakAgg._count,
          hargaKertas: hargaKertasAgg._count,
          potongKertas: potongKertasAgg._count,
          total: totalCalculations,
        },
        documents: {
          invoice: invoiceAgg._count,
          suratJalan: suratJalanAgg._count,
          purchaseOrder: purchaseOrderAgg._count,
          total: totalDocuments,
        },
        totals: {
          cetakan: cetakanAgg._sum.grandTotal || 0,
          finishing: finishingAgg._sum.totalCost || 0,
          uangCapek: cetakanAgg._sum.profitAmount || 0,
          ongkosCetak: (ongkosCetakAgg._sum.totalOngkosCetak || 0) + (ongkosCetakAgg._sum.totalOngkosCetak2 || 0),
          hargaKertas: hargaKertasAgg._sum.totalPrice || 0,
          potongKertas: potongKertasAgg._sum.totalPrice || 0,
          invoice: invoiceTotal,
          purchaseOrder: purchaseOrderTotal,
          revenue: totalRevenue,
          modal: (cetakanAgg._sum.grandTotal || 0) - (cetakanAgg._sum.profitAmount || 0),
          todaySales,
          todayOrderCount,
        },
      },
      recent: {
        cetakan: recentCetakan,
        potongKertas: recentPotongKertas,
        invoice: recentInvoice.map(inv => {
          let total = 0
          let itemCount = 0
          try {
            const data = JSON.parse(inv.dataJson)
            const subtotal = (data.items || []).reduce((sum: number, item: { qty: number; harga: number }) => sum + item.qty * item.harga, 0)
            const ppn = subtotal * ((data.ppn || 0) / 100)
            total = subtotal + ppn
            itemCount = (data.items || []).filter((item: { deskripsi: string }) => item.deskripsi?.trim()).length
          } catch {}
          return { id: inv.id, invoiceNumber: inv.nomor, customerName: inv.pihakKedua, grandTotal: total, itemCount, createdAt: inv.createdAt }
        }),
        suratJalan: recentSuratJalan.map(sj => ({ id: sj.id, suratJalanNumber: sj.nomor, customerName: sj.pihakKedua, createdAt: sj.createdAt })),
        purchaseOrder: recentPurchaseOrder.map(po => {
          let total = 0
          try {
            const data = JSON.parse(po.dataJson)
            const subtotal = (data.items || []).reduce((sum: number, item: { qty: number; harga: number }) => sum + item.qty * item.harga, 0)
            const ppn = subtotal * ((data.ppn || 0) / 100)
            total = subtotal + ppn
          } catch {}
          return { id: po.id, poNumber: po.nomor, supplierName: po.pihakKedua, total, createdAt: po.createdAt }
        }),
      },
      daily: dailyData,
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
