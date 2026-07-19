import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppImage } from '@/lib/whatsapp'

/**
 * POST /api/whatsapp/send-jpg
 *
 * Sends a JPG image directly to a WhatsApp number via the Fonnte API.
 *
 * Body:
 *   phone         — target phone number (digits only, optional leading 0 / + / country code)
 *   jpgBase64     — base64-encoded JPG image (with or without the `data:image/jpeg;base64,` prefix)
 *   fileName      — file name shown to the recipient (e.g. "INV-06-26-0002.jpg")
 *   documentLabel — human-friendly label used in the caption (e.g. "Invoice INV/06/26/0002")
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, jpgBase64, fileName, documentLabel } = body

    if (!phone || !jpgBase64 || !fileName) {
      return NextResponse.json(
        { success: false, error: 'Nomor telepon, gambar, dan nama file wajib diisi.' },
        { status: 400 }
      )
    }

    // Validate phone number format (allow 8-15 digits after stripping common separators)
    const cleanedPhone = phone.replace(/[\s\-()+]/g, '')
    if (!/^\d{8,15}$/.test(cleanedPhone)) {
      return NextResponse.json(
        { success: false, error: 'Format nomor telepon tidak valid.' },
        { status: 400 }
      )
    }

    const caption = `${documentLabel || 'Dokumen'} - www.darrellsoft.com`

    const result = await sendWhatsAppImage(
      cleanedPhone,
      caption,
      jpgBase64,
      fileName
    )

    if (result.success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('WhatsApp send-jpg API error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan saat mengirim gambar.' },
      { status: 500 }
    )
  }
}
