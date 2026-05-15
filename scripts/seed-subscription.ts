import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function seed() {
  console.log('🌱 Seeding subscription plans...')

  // Clear existing
  await db.notification.deleteMany()
  await db.paymentRecord.deleteMany()
  await db.paymentMethod.deleteMany()
  await db.userSubscription.deleteMany()
  await db.subscriptionPlan.deleteMany()

  // Create plans
  const plans = await db.subscriptionPlan.createMany({
    data: [
      {
        name: 'Basic',
        description: 'Untuk pemula yang ingin mencoba fitur dasar',
        price: 99000,
        currency: 'IDR',
        interval: 'monthly',
        features: JSON.stringify([
          'Akses semua fitur kalkulasi cetak',
          'Hitung harga kertas & ongkos',
          'Riwayat transaksi 30 hari',
          '1 pengguna',
          'Support email',
        ]),
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'Standard',
        description: 'Paling populer untuk bisnis percetakan kecil',
        price: 149000,
        currency: 'IDR',
        interval: 'monthly',
        features: JSON.stringify([
          'Semua fitur Basic',
          'Riwayat transaksi unlimited',
          'Invoice & Surat Jalan',
          'Master data customer',
          '3 pengguna',
          'Update harga otomatis',
          'Support prioritas',
        ]),
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Premium',
        description: 'Solusi lengkap untuk percetakan profesional',
        price: 299000,
        currency: 'IDR',
        interval: 'monthly',
        features: JSON.stringify([
          'Semua fitur Standard',
          '10 pengguna',
          'Laporan analitik lanjutan',
          'Backup data otomatis',
          'Export data ke Excel/PDF',
          'API integration',
          'Priority support 24/7',
          'Custom branding',
        ]),
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Enterprise',
        description: 'Untuk perusahaan besar dengan kebutuhan khusus',
        price: 1290000,
        currency: 'IDR',
        interval: 'yearly',
        features: JSON.stringify([
          'Semua fitur Premium',
          'Unlimited pengguna',
          'Dedicated account manager',
          'Custom development',
          'On-premise deployment option',
          'SLA 99.9% uptime',
          'Training & onboarding',
          'Invoice khusus perusahaan',
        ]),
        isActive: true,
        sortOrder: 4,
      },
    ],
  })

  console.log(`✅ Created ${plans.count} plans`)

  // Create demo payment methods
  const demoUserId = 'demo-user-netflix'
  await db.paymentMethod.createMany({
    data: [
      {
        userId: demoUserId,
        type: 'bank_transfer',
        label: 'BCA Virtual Account',
        provider: 'bca',
        accountNumber: '8800123456789',
        isDefault: true,
      },
      {
        userId: demoUserId,
        type: 'ewallet',
        label: 'GoPay',
        provider: 'gopay',
        accountNumber: '081234567890',
        isDefault: false,
      },
      {
        userId: demoUserId,
        type: 'ewallet',
        label: 'ShopeePay',
        provider: 'shopeepay',
        accountNumber: '081234567890',
        isDefault: false,
      },
      {
        userId: demoUserId,
        type: 'credit_card',
        label: 'Visa **** 4242',
        provider: 'visa',
        accountNumber: '****4242',
        isDefault: false,
      },
    ],
  })

  console.log('✅ Created demo payment methods')

  // Create demo payment records
  await db.paymentRecord.createMany({
    data: [
      {
        userId: demoUserId,
        amount: 149000,
        currency: 'IDR',
        status: 'success',
        paymentType: 'subscription',
        provider: 'bank_transfer',
        transactionId: 'SUB-HIST001',
        vaNumber: '8800123456789',
        paidAt: new Date('2026-04-01'),
        metadata: JSON.stringify({ planId: 'plan-standard', planName: 'Standard', planInterval: 'monthly' }),
      },
      {
        userId: demoUserId,
        amount: 149000,
        currency: 'IDR',
        status: 'success',
        paymentType: 'subscription',
        provider: 'gopay',
        transactionId: 'SUB-HIST002',
        paidAt: new Date('2026-03-01'),
        metadata: JSON.stringify({ planId: 'plan-standard', planName: 'Standard', planInterval: 'monthly' }),
      },
      {
        userId: demoUserId,
        amount: 99000,
        currency: 'IDR',
        status: 'failed',
        paymentType: 'subscription',
        provider: 'credit_card',
        transactionId: 'SUB-HIST003',
        retryCount: 1,
        metadata: JSON.stringify({ planId: 'plan-basic', planName: 'Basic', planInterval: 'monthly' }),
      },
    ],
  })

  console.log('✅ Created demo payment records')

  // Create demo notifications
  await db.notification.createMany({
    data: [
      {
        userId: demoUserId,
        title: 'Selamat Datang! 🎉',
        message: 'Akun Anda telah aktif. Pilih paket langganan untuk mulai menggunakan semua fitur.',
        type: 'success',
        isRead: true,
      },
      {
        userId: demoUserId,
        title: 'Pembayaran Berhasil',
        message: 'Pembayaran Standard Rp 149.000 untuk April 2026 berhasil.',
        type: 'success',
        isRead: true,
      },
      {
        userId: demoUserId,
        title: 'Tagihan Mendatang',
        message: 'Tagihan Standard Rp 149.000 untuk Mei 2026 akan jatuh tempo dalam 3 hari.',
        type: 'warning',
        isRead: false,
      },
      {
        userId: demoUserId,
        title: 'Pembayaran Gagal',
        message: 'Pembayaran otomatis gagal. Silakan update metode pembayaran Anda.',
        type: 'error',
        isRead: false,
      },
    ],
  })

  console.log('✅ Created demo notifications')

  // Create active subscription for demo user
  const planRecords = await db.subscriptionPlan.findMany()
  const standardPlan = planRecords.find(p => p.name === 'Standard')
  if (standardPlan) {
    await db.userSubscription.create({
      data: {
        id: `${demoUserId}-${standardPlan.id}`,
        userId: demoUserId,
        planId: standardPlan.id,
        status: 'active',
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-06-01'),
        autoRenew: true,
      },
    })
    console.log('✅ Created demo active subscription')
  }

  console.log('\n🎉 Seeding complete!')
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect())
