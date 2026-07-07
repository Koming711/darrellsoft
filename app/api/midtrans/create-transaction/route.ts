import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { createSnapTransaction, savePaymentRecord } from '@/lib/midtrans';
import { sanitizeError } from '@/lib/api-error';
import { seedUserData } from '@/lib/auto-seed';
import { buildDefaultPermissions, buildDefaultSubPermissions } from '@/lib/permission-defaults';

const FAKE_KEY = 'SB-Mid-server-FAKE_TEST_KEY_12345';
// Mock mode aktif jika key MIDTRANS belum dikonfigurasi ATAU memakai fake key.
// Saat mock mode: akun CalonPembeli demo dibuat langsung tanpa pembayaran real,
// user auto-login, dan diarahkan ke popup "Lengkapi Data Perusahaan".
const isFakeKey = !process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY === FAKE_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageName, packageType, price, customerName, customerEmail, customerPhone, username, password, secondUsername } = body;

    if (!packageName || !packageType || !price || !customerName || !customerEmail || !customerPhone) {
      return NextResponse.json({ success: false, message: 'Semua field wajib diisi' }, { status: 400 });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `PKG-${packageType.toUpperCase()}-${timestamp}-${random}`;

    // Store metadata (username, password, secondUsername) as JSON
    const metadata = JSON.stringify({
      username: username || '',
      password: password || '',
      secondUsername: secondUsername || '',
    });

    // Simpan ke database
    await savePaymentRecord(db, {
      orderId,
      packageName,
      packageType,
      grossAmount: Number(price),
      customerName,
      customerEmail,
      customerPhone,
      metadata,
    });

    // ─── MOCK MODE: daftarkan sebagai CalonPembeli role demo (tanpa Midtrans) ───
    if (isFakeKey) {
      const metaUname = (username || '').trim();
      const metaPwd = password || '';

      // Update payment status to success (record kept for history)
      await db.payment.update({ where: { orderId }, data: { transactionStatus: 'success' } });

      let calonId: string | null = null;
      let calonCreated = false;

      try {
        // Cek apakah CalonPembeli / Pengguna dengan username/email sudah ada
        const existingCalon = await db.calonPembeli.findFirst({
          where: { OR: [{ email: customerEmail }, { username: metaUname }] },
        });
        const existingPengguna = await db.pengguna.findFirst({
          where: { OR: [{ email: customerEmail }, { username: metaUname }] },
        });

        if (existingCalon || existingPengguna) {
          // Username atau email sudah dipakai → blok checkout.
          // Bedakan pesan berdasarkan penyebab agar frontend bisa menampilkan
          // popup "Nama Username sudah ada" yang spesifik (sama seperti halaman daftar akun).
          const usernameTaken =
            (existingCalon && existingCalon.username === metaUname) ||
            (existingPengguna && existingPengguna.username === metaUname);

          if (usernameTaken) {
            return NextResponse.json(
              {
                success: false,
                code: 'USERNAME_EXISTS',
                message: 'Nama Username sudah ada. silahkan gunakan username lain.',
              },
              { status: 409 }
            );
          }
          return NextResponse.json(
            {
              success: false,
              code: 'EMAIL_EXISTS',
              message: 'Email sudah terdaftar. Silakan gunakan email lain.',
            },
            { status: 409 }
          );
        }

        if (metaUname && metaPwd) {
          // Ambil masa aktif demo dari settings (default 7 hari)
          const demoDaysSetting = await db.setting.findUnique({ where: { key: 'demo_days' } });
          const demoDays = parseInt(demoDaysSetting?.value || '7', 10) || 7;
          const expiredDate = new Date();
          expiredDate.setDate(expiredDate.getDate() + demoDays);

          // Buat CalonPembeli (bukan Pengguna) — muncul di halaman Pengguna tab Calon Pembeli
          const calon = await db.calonPembeli.create({
            data: {
              nama: customerName,
              nomorHP: customerPhone,
              email: customerEmail,
              alamat: '',
              catatan: `Pendaftaran via Checkout (Paket ${packageName})`,
              status: 'baru',
              role: 'demo',
              expiredDate,
              username: metaUname,
              password: metaPwd,
            },
          });
          calonId = calon.id;
          calonCreated = true;

          // Seed sample master data (harga kertas, ongkos cetak, finishing) untuk user baru
          try {
            await seedUserData(calon.id);
          } catch (seedErr) {
            console.warn('[Mock Register] Seed data error (non-fatal):', seedErr);
          }

          // Generate session
          const sessionId = randomUUID();
          const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } });
          const singleDevice = singleDeviceSetting?.value !== 'false';
          if (singleDevice) {
            await db.setting.upsert({
              where: { key: `session_${metaUname}` },
              update: { value: sessionId },
              create: { key: `session_${metaUname}`, value: sessionId },
            });
          }

          // Build permissions untuk role demo
          const role = 'demo';
          const features = { ...buildDefaultPermissions(role) };
          const subPermissions = JSON.parse(JSON.stringify(buildDefaultSubPermissions(role)));
          try {
            const customPermsSetting = await db.setting.findUnique({ where: { key: 'role_permissions' } });
            if (customPermsSetting?.value) {
              const allPerms = JSON.parse(customPermsSetting.value);
              if (allPerms[role]?.features) {
                Object.assign(features, allPerms[role].features);
              }
              if (allPerms[role]?.subPermissions) {
                for (const [group, subs] of Object.entries(allPerms[role].subPermissions)) {
                  if (typeof subs === 'object' && subs !== null && !Array.isArray(subs)) {
                    subPermissions[group] = { ...(subPermissions[group] || {}), ...(subs as Record<string, boolean>) };
                  }
                }
              }
            }
          } catch {}

          // Link payment ke calon pembeli
          await db.payment.update({ where: { orderId }, data: { userId: calon.id } });

          const fakeToken = `fake_snap_token_${timestamp}_${random}`;
          const response = NextResponse.json({
            success: true,
            token: fakeToken,
            redirectUrl: '',
            orderId,
            mock: true,
            demoRegister: true,
            user: {
              id: calon.id,
              username: metaUname,
              name: customerName,
              role: 'demo',
              sessionId,
              singleDevice,
              permissions: { features, subPermissions },
            },
          });
          // Set cookies agar auto-login langsung terautentikasi
          response.cookies.set('userId', calon.id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
          response.cookies.set('userRole', 'demo', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
          return response;
        }
      } catch (activateErr) {
        console.warn('[Mock Register] Error creating calon pembeli:', activateErr);
      }

      // Fallback: akun sudah ada atau gagal buat — tetap kembalikan mock token
      const fakeToken = `fake_snap_token_${timestamp}_${random}`;
      return NextResponse.json({
        success: true,
        token: fakeToken,
        redirectUrl: '',
        orderId,
        mock: true,
        demoRegister: calonCreated,
        calonId,
      });
    }

    // ─── PRODUCTION MODE: panggil Midtrans API asli ───
    const transaction = await createSnapTransaction({
      orderId,
      amount: Number(price),
      packageName,
      packageType,
      customerName,
      customerEmail,
      customerPhone,
      username: username || '',
      password: password || '',
      secondUsername: secondUsername || '',
    });

    return NextResponse.json({
      success: true,
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
      orderId,
    });
  } catch (error: unknown) {
    const message = sanitizeError(error, 'Gagal membuat transaksi');
    console.error('Create transaction error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
