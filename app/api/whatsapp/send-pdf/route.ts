import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppDocument } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, pdfBase64, fileName, documentLabel } = body

    if (!phone || !pdfBase64 || !fileName) {
      return NextResponse.json(
        { success: false, error: 'Nomor telepon, PDF, dan nama file wajib diisi.' },
        { status: 400 }
      )
    }

    // Validate phone number format
    const cleanedPhone = phone.replace(/[\s\-()+]/g, '')
    if (!/^\d{8,15}$/.test(cleanedPhone)) {
      return NextResponse.json(
        { success: false, error: 'Format nomor telepon tidak valid.' },
        { status: 400 }
      )
    }

    const message = `Dokumen ${documentLabel || 'Dokumen'} - www.darrellsoft.com`

    const result = await sendWhatsAppDocument(
      cleanedPhone,
      message,
      pdfBase64,
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
    console.error('WhatsApp send-pdf API error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan saat mengirim dokumen.' },
      { status: 500 }
    )
  }
}
