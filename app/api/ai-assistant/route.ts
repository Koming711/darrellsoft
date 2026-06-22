import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Reuse a single ZAI instance across requests (warm invocations)
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null
async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `Anda adalah "Asisten AI Darrellsoft", asisten cerdas untuk aplikasi Darrell Soft - Kalkulator Hitung Cetakan, sebuah aplikasi manajemen percetakan profesional.

TENTANG APLIKASI DARRELL SOFT:
Darrell Soft adalah aplikasi kalkulator & manajemen percetakan yang membantu pemilik bisnis cetak menghitung modal dan harga jual dengan cepat & akurat. Aplikasi ini cocok untuk bisnis cetak Dus Makanan, Dus Kue, Hampers, kartu nama, brosur, dan produk cetakan lainnya.

FITUR UTAMA APLIKASI:
1. Hitung Total Biaya - menghitung total biaya produksi cetakan
2. Potong Kertas - menghitung optimasi pemotongan kertas dari ukuran besar ke ukuran kecil
3. Hitung Cetakan - menghitung biaya cetakan berdasarkan ukuran, warna, plat, dan jumlah
4. Hitung Harga Kertas - menghitung harga per lembar kertas
5. Hitung Ongkos Cetak - menghitung ongkos cetak per satuan
6. Hitung Finishing - menghitung biaya finishing (laminating, cutting, dll)
7. Biaya Produksi - menghitung biaya produksi keseluruhan
8. Invoice - membuat faktur penjualan
9. Surat Jalan - membuat surat jalan pengiriman
10. Pembelian - mencatat transaksi pembelian bahan
11. Riwayat - riwayat perhitungan, pembelian, penjualan, potong kertas

MASTER DATA:
- Master Customer (pelanggan)
- Master Toko/Pemasok (supplier)
- Master Harga Kertas
- Master Finishing
- Master Ongkos Cetak

KONTEP BISNIS PERCETAKAN:
- Dus Makanan: kotak kemasan untuk makanan, biasanya dari karton box/kraft
- Dus Kue: kotak kemasan untuk kue
- Hampers: paket kado berisi makanan/barang, butuh dus khusus
- Ukuran kertas standar: A4, A3, F4, dll
- Plat cetak: 1 warna = 1 plat, lebih banyak warna = lebih mahal
- Finishing: proses setelah cetak (laminating doff/gloss, emboss, hot stamping, dll)

ATURAN JAWABAN:
- Jawab dalam Bahasa Indonesia yang ramah, jelas, dan mudah dipahami
- Jika user bertanya dalam bahasa Inggris, jawab dalam bahasa Inggris
- Berikan jawaban yang praktis dan actionable
- Jika pertanyaan tentang cara menggunakan fitur aplikasi, jelaskan langkah-langkahnya
- Jika pertanyaan di luar konteks percetakan/aplikasi, arahkan kembali ke topik percetakan dengan sopan
- Jangan mengarang fitur yang tidak ada di aplikasi
- Gunakan formatting singkat (bullet point atau langkah bernomor) untuk jawaban yang panjang
- Maksimal 4-5 paragraf atau setara, jangan terlalu panjang`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, history = [] }: { message?: string; history?: ChatMessage[] } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Pesan tidak boleh kosong' },
        { status: 400 }
      )
    }

    // Limit message length to prevent abuse
    if (message.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Pesan terlalu panjang (maksimal 1000 karakter)' },
        { status: 400 }
      )
    }

    // Limit history to last 10 messages to control token usage
    const trimmedHistory = history.slice(-10).filter(
      (m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')
    )

    // Build messages array: system prompt as first assistant message, then history, then new user message
    const messages: ChatMessage[] = [
      { role: 'assistant', content: SYSTEM_PROMPT },
      ...trimmedHistory,
      { role: 'user', content: message },
    ]

    const zai = await getZAI()

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })

    const aiResponse = completion.choices[0]?.message?.content

    if (!aiResponse || aiResponse.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI tidak memberikan respons. Silakan coba lagi.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      response: aiResponse.trim(),
    })
  } catch (error) {
    console.error('[AI Assistant] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        success: false,
        error: 'Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.',
        debug: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Darrellsoft AI Assistant',
    status: 'online',
    description: 'Asisten AI untuk aplikasi Darrell Soft - Kalkulator Hitung Cetakan',
  })
}
