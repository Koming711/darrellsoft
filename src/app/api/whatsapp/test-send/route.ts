import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import { getWhatsAppApiConfig, normalizeWaPhone, sendWhatsAppMessage } from '@/lib/whatsapp'

/**
 * POST /api/whatsapp/test-send — admin-only.
 *
 * Diagnostics for the WhatsApp API (Fonnte) configuration in
 * HAK AKSES → WhatsApp API:
 *  1. No API key configured            → 400 with the "belum dikonfigurasi" message
 *  2. Key configured, send success     → 200 { success: true }
 *  3. Key configured, Fonnte rejected  → 502 with Fonnte's own error message
 *
 * Body: { phone } — target number, may use 08… / +62… / 62… formats.
 */
export async function POST(request: NextRequest) {
  const adminErr = requireAdmin(request)
  if (adminErr) return adminErr

  try {
    const body = await request.json()
    const phone: string = (body?.phone || '').trim()

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp tujuan wajib diisi.' },
        { status: 400 }
      )
    }

    const cleanedPhone = normalizeWaPhone(phone)
    if (!/^\d{8,15}$/.test(cleanedPhone)) {
      return NextResponse.json(
        { success: false, error: 'Format nomor WhatsApp tidak valid.' },
        { status: 400 }
      )
    }

    const user = getServerUser(request)
    const senderName = user?.name || user?.username || 'Admin'

    const config = await getWhatsAppApiConfig()
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error:
            'WhatsApp API key belum dikonfigurasi. Isi API Key Fonnte di bagian ini lalu klik Simpan terlebih dahulu.',
          code: 'NOT_CONFIGURED',
        },
        { status: 400 }
      )
    }

    const message = `✅ Tes koneksi WhatsApp Darrellsoft berhasil!\n\nAPI key Fonnte sudah terpasang dengan benar. Pesan ini dikirim otomatis oleh sistem untuk memverifikasi konfigurasi (${senderName}).`

    const result = await sendWhatsAppMessage(cleanedPhone, message)

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Pesan tes berhasil dikirim!' })
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Fonnte menolak pesan tes.' },
      { status: 502 }
    )
  } catch (error: any) {
    console.error('WhatsApp test API error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan saat mengirim pesan tes.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/whatsapp/test-send — admin-only configuration status check
 * (tanpa mengirim pesan; dipakai untuk indikator "terkonfigurasi / belum").
 */
export async function GET(request: NextRequest) {
  const adminErr = requireAdmin(request)
  if (adminErr) return adminErr

  const config = await getWhatsAppApiConfig()
  return NextResponse.json({
    configured: Boolean(config),
    apiUrl: config?.apiUrl || 'https://api.fonnte.com/send',
  })
}
