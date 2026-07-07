import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { namaPerusahaan, slug, namaLengkap, nomorHP, email, username, password } = await request.json()

    // Validate required fields
    if (!namaPerusahaan || !slug || !namaLengkap || !username || !password) {
      return NextResponse.json({ error: 'Semua field wajib diisi' }, { status: 400 })
    }

    // Validate slug format (lowercase, no spaces, alphanumeric + hyphens)
    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
    if (!slugRegex.test(slug)) {
      return NextResponse.json({ error: 'Slug hanya boleh huruf kecil, angka, dan tanda hubung' }, { status: 400 })
    }

    // Check slug uniqueness
    const existingPerusahaan = await db.perusahaan.findUnique({ where: { slug } })
    if (existingPerusahaan) {
      return NextResponse.json({ error: 'Nama perusahaan sudah digunakan' }, { status: 409 })
    }

    // Check username uniqueness
    const existingUser = await db.pengguna.findUnique({ where: { username } })
    if (existingUser) {
      return NextResponse.json({ error: 'Username sudah digunakan' }, { status: 409 })
    }

    // Create Perusahaan
    const perusahaan = await db.perusahaan.create({
      data: {
        nama: namaPerusahaan,
        slug,
        nomorHP: nomorHP || '',
        email: email || '',
        paket: 'free',
        aktif: true,
      }
    })

    // Create admin Pengguna for this Perusahaan
    const validUntil = new Date()
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    const pengguna = await db.pengguna.create({
      data: {
        namaLengkap,
        nomorHP: nomorHP || '',
        email: email || '',
        username,
        password,
        role: 'admin',
        perusahaanId: perusahaan.id,
        validUntil,
      }
    })

    // Seed default settings for this tenant
    const defaultSettings = [
      { key: 'appName', value: 'Sistem Cetak', perusahaanId: perusahaan.id },
      { key: 'companyName', value: namaPerusahaan, perusahaanId: perusahaan.id },
      { key: 'currency', value: 'IDR', perusahaanId: perusahaan.id },
      { key: 'defaultProfitPercent', value: '10', perusahaanId: perusahaan.id },
      { key: 'packingCostDefault', value: '5000', perusahaanId: perusahaan.id },
      { key: 'shippingCostDefault', value: '15000', perusahaanId: perusahaan.id },
      { key: 'demo_days', value: '7', perusahaanId: perusahaan.id },
      { key: 'demo_message', value: 'Selamat datang! Anda sedang menggunakan akun demo.\nUpgrade ke akun penuh untuk mengakses semua fitur.', perusahaanId: perusahaan.id },
      { key: 'single_device', value: 'true', perusahaanId: perusahaan.id },
      { key: 'single_device_message', value: 'Akun sudah digunakan, silahkan logout di perangkat yang lain', perusahaanId: perusahaan.id },
      { key: 'auto_logout_min', value: '10', perusahaanId: perusahaan.id },
      { key: 'logout_warning_sec', value: '20', perusahaanId: perusahaan.id },
      { key: 'profit', value: '10', perusahaanId: perusahaan.id },
      { key: 'theme_sidebar_color', value: '#FF8A80', perusahaanId: perusahaan.id },
      { key: 'theme_bg_color', value: '#f8fafc', perusahaanId: perusahaan.id },
      { key: 'theme_popup_color', value: '#ffffff', perusahaanId: perusahaan.id },
      { key: 'theme_banner_color', value: '#ffffff', perusahaanId: perusahaan.id },
      { key: 'theme_login_color', value: '#EFF6FF', perusahaanId: perusahaan.id },
      { key: 'app_language', value: 'id', perusahaanId: perusahaan.id },
      { key: 'app_font_size', value: 'medium', perusahaanId: perusahaan.id },
      { key: 'company_logo', value: '', perusahaanId: perusahaan.id },
    ]
    for (const setting of defaultSettings) {
      await db.setting.create({ data: setting })
    }

    // Seed default master data for this tenant (papers, printing costs, finishings)
    const papers = [
      { name: 'HVS', grammage: 70, width: 21.0, height: 29.7, pricePerRim: 45000 },
      { name: 'HVS', grammage: 80, width: 21.0, height: 29.7, pricePerRim: 52000 },
      { name: 'Art Paper', grammage: 120, width: 31.5, height: 47.0, pricePerRim: 95000 },
      { name: 'Art Paper', grammage: 150, width: 31.5, height: 47.0, pricePerRim: 115000 },
      { name: 'Art Paper', grammage: 260, width: 31.5, height: 47.0, pricePerRim: 185000 },
      { name: 'Art Carton', grammage: 230, width: 31.5, height: 47.0, pricePerRim: 165000 },
      { name: 'Art Carton', grammage: 260, width: 31.5, height: 47.0, pricePerRim: 195000 },
      { name: 'Art Carton', grammage: 310, width: 31.5, height: 47.0, pricePerRim: 235000 },
      { name: 'Ivory', grammage: 210, width: 79.0, height: 109.0, pricePerRim: 1356233 },
      { name: 'Ivory', grammage: 300, width: 79.0, height: 109.0, pricePerRim: 1937475 },
      { name: 'Duplex', grammage: 250, width: 70.0, height: 100.0, pricePerRim: 350000 },
      { name: 'FBB', grammage: 250, width: 70.0, height: 100.0, pricePerRim: 380000 },
      { name: 'Kraft', grammage: 150, width: 70.0, height: 100.0, pricePerRim: 280000 },
      { name: 'Kraft', grammage: 200, width: 70.0, height: 100.0, pricePerRim: 340000 },
    ]
    for (const paper of papers) {
      await db.paper.create({
        data: { ...paper, perusahaanId: perusahaan.id }
      })
    }

    const printingCosts = [
      { machineName: 'SM 52', grammage: 0, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 65000, specialColorPrice: 80000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 60, platePricePerSheet: 16500 },
      { machineName: 'SM 52', grammage: 150, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 75000, specialColorPrice: 90000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 70, platePricePerSheet: 16500 },
      { machineName: 'SM 52', grammage: 260, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 85000, specialColorPrice: 100000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 80, platePricePerSheet: 16500 },
      { machineName: 'SM 74', grammage: 0, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 130000, specialColorPrice: 160000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 120, platePricePerSheet: 33000 },
      { machineName: 'SM 74', grammage: 150, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 150000, specialColorPrice: 180000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 140, platePricePerSheet: 33000 },
      { machineName: 'SM 74', grammage: 260, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 170000, specialColorPrice: 200000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 160, platePricePerSheet: 33000 },
      { machineName: 'SM 102', grammage: 0, printAreaWidth: 102, printAreaHeight: 72, pricePerColor: 250000, specialColorPrice: 300000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 230, platePricePerSheet: 55000 },
      { machineName: 'Digital', grammage: 0, printAreaWidth: 33, printAreaHeight: 48, pricePerColor: 1500, specialColorPrice: 3000, minimumPrintQuantity: 1, priceAboveMinimumPerSheet: 1200, platePricePerSheet: 0 },
    ]
    for (const cost of printingCosts) {
      await db.printingCost.create({
        data: { ...cost, perusahaanId: perusahaan.id }
      })
    }

    const finishings = [
      { name: 'Laminating Glossy', minimumSheets: 0, minimumPrice: 250000, additionalPrice: 0, pricePerCm: 0.18 },
      { name: 'Laminating Doff', minimumSheets: 0, minimumPrice: 400000, additionalPrice: 0, pricePerCm: 0.2 },
      { name: 'Laminating Soft', minimumSheets: 0, minimumPrice: 350000, additionalPrice: 0, pricePerCm: 0.19 },
      { name: 'Pond / Bending', minimumSheets: 1000, minimumPrice: 70000, additionalPrice: 40, pricePerCm: 0 },
      { name: 'UV Spot Varnish', minimumSheets: 500, minimumPrice: 500000, additionalPrice: 100, pricePerCm: 0.5 },
      { name: 'UV Full Varnish', minimumSheets: 500, minimumPrice: 400000, additionalPrice: 80, pricePerCm: 0.4 },
      { name: 'Emboss', minimumSheets: 500, minimumPrice: 300000, additionalPrice: 60, pricePerCm: 0.45 },
      { name: 'Deboss', minimumSheets: 500, minimumPrice: 300000, additionalPrice: 60, pricePerCm: 0.45 },
      { name: 'Hot Print Gold', minimumSheets: 500, minimumPrice: 500000, additionalPrice: 100, pricePerCm: 0.6 },
      { name: 'Hot Print Silver', minimumSheets: 500, minimumPrice: 500000, additionalPrice: 100, pricePerCm: 0.6 },
      { name: 'Potong / Cutting', minimumSheets: 1, minimumPrice: 50000, additionalPrice: 0, pricePerCm: 0.05 },
      { name: 'Folding / Lipat', minimumSheets: 100, minimumPrice: 3000, additionalPrice: 50, pricePerCm: 0.15 },
      { name: 'Jahit / Spine', minimumSheets: 25, minimumPrice: 5000, additionalPrice: 100, pricePerCm: 0.3 },
      { name: 'Jilid Spiral', minimumSheets: 1, minimumPrice: 5000, additionalPrice: 200, pricePerCm: 0.25 },
      { name: 'Jilid Perfect Binding', minimumSheets: 50, minimumPrice: 15000, additionalPrice: 300, pricePerCm: 0.4 },
    ]
    for (const finishing of finishings) {
      await db.finishing.create({
        data: { ...finishing, perusahaanId: perusahaan.id }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Perusahaan dan akun admin berhasil dibuat',
      user: {
        id: pengguna.id,
        username: pengguna.username,
        name: pengguna.namaLengkap,
        role: pengguna.role,
        perusahaanId: perusahaan.id,
        perusahaanNama: perusahaan.nama,
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Register tenant error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}
