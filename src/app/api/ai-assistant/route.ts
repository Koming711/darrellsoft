import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // allow up to 60s for AI responses

// Reuse a single ZAI instance across requests (warm invocations)
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null
let zaiCreatePromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null

async function getZAI() {
  if (zaiInstance) return zaiInstance
  if (!zaiCreatePromise) {
    zaiCreatePromise = ZAI.create().then((instance) => {
      zaiInstance = instance
      return instance
    }).catch((err) => {
      zaiCreatePromise = null
      throw err
    })
  }
  return zaiCreatePromise
}

// Pre-warm the ZAI instance on module load so the first user request is fast.
void getZAI().catch((err) => {
  console.error('[AI Assistant] Pre-warm failed:', err)
})

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

KONSEP BISNIS PERCETAKAN:
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

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ delta: text })}\n\n`
}

function sseDone(): string {
  return `data: [DONE]\n\n`
}

function sseError(message: string): string {
  return `data: ${JSON.stringify({ error: message })}\n\n`
}

/**
 * Extract text content from a ZAI chat completion response (non-streaming JSON).
 * Handles OpenAI-style {choices:[{message:{content}}]} and plain {content} shapes.
 */
function extractContentFromJSON(json: any): string | null {
  if (!json) return null
  // OpenAI-style
  const choiceContent = json?.choices?.[0]?.message?.content
  if (typeof choiceContent === 'string' && choiceContent.length > 0) return choiceContent
  // Plain content
  if (typeof json?.content === 'string' && json.content.length > 0) return json.content
  // Delta content (some non-streaming responses still use delta)
  const deltaContent = json?.choices?.[0]?.delta?.content
  if (typeof deltaContent === 'string' && deltaContent.length > 0) return deltaContent
  return null
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Body permintaan tidak valid' },
      { status: 400 }
    )
  }

  const { message, history = [] }: { message?: string; history?: ChatMessage[] } = body

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'Pesan tidak boleh kosong' },
      { status: 400 }
    )
  }

  if (message.length > 1000) {
    return NextResponse.json(
      { success: false, error: 'Pesan terlalu panjang (maksimal 1000 karakter)' },
      { status: 400 }
    )
  }

  // Limit history to last 10 messages to control token usage
  const trimmedHistory = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter(
      (m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')
    )

  // Build messages array: system prompt as first assistant message, then history, then new user message
  const messages: ChatMessage[] = [
    { role: 'assistant', content: SYSTEM_PROMPT },
    ...trimmedHistory,
    { role: 'user', content: message },
  ]

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // controller may already be closed (e.g. client disconnected)
        }
      }
      const safeClose = () => {
        try {
          controller.close()
        } catch {
          // already closed — ignore
        }
      }

      let zai: Awaited<ReturnType<typeof ZAI.create>>
      try {
        zai = await getZAI()
      } catch (err) {
        console.error('[AI Assistant] ZAI init error:', err)
        safeEnqueue(sseError('Layanan AI sedang tidak tersedia. Silakan coba lagi.'))
        safeClose()
        return
      }

      // Try streaming first; fall back to non-streaming if the SDK returns JSON.
      let responseStream: ReadableStream<Uint8Array> | null = null
      let jsonFallback: any = null

      try {
        const result: any = await zai.chat.completions.create({
          messages,
          stream: true,
          thinking: { type: 'disabled' },
        })

        if (result && typeof result.getReader === 'function') {
          // It's a ReadableStream — use streaming path
          responseStream = result as ReadableStream<Uint8Array>
        } else if (result && typeof result === 'object') {
          // SDK returned a JSON object instead of a stream (content-type wasn't event-stream)
          // Fall back to non-streaming parsing
          jsonFallback = result
        } else {
          safeEnqueue(sseError('AI tidak mengembalikan respons yang valid.'))
          safeClose()
          return
        }
      } catch (err) {
        console.error('[AI Assistant] create error:', err)
        const msg = err instanceof Error ? err.message : 'Unknown error'

        // If streaming failed, try a non-streaming request as fallback
        try {
          const fallbackResult: any = await zai.chat.completions.create({
            messages,
            thinking: { type: 'disabled' },
            // no stream: true
          })
          if (fallbackResult && typeof fallbackResult === 'object' && !fallbackResult.getReader) {
            jsonFallback = fallbackResult
          } else {
            safeEnqueue(sseError(`Gagal memanggil AI: ${msg}`))
            safeClose()
            return
          }
        } catch (fallbackErr) {
          console.error('[AI Assistant] fallback create error:', fallbackErr)
          const fmsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error'
          safeEnqueue(sseError(`Gagal memanggil AI: ${fmsg}`))
          safeClose()
          return
        }
      }

      // Non-streaming JSON fallback — send the entire content as one chunk
      if (jsonFallback) {
        const content = extractContentFromJSON(jsonFallback)
        if (content) {
          safeEnqueue(sseChunk(content))
          safeEnqueue(sseDone())
        } else {
          console.error('[AI Assistant] JSON fallback had no content:', JSON.stringify(jsonFallback).slice(0, 500))
          safeEnqueue(sseError('AI tidak memberikan respons. Silakan coba lagi.'))
        }
        safeClose()
        return
      }

      if (!responseStream) {
        safeEnqueue(sseError('AI tidak mengembalikan stream respons.'))
        safeClose()
        return
      }

      const reader = responseStream.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedAny = false

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // SSE events are separated by \n\n
          const events = buffer.split('\n\n')
          // Keep the last (possibly incomplete) chunk in the buffer
          buffer = events.pop() || ''

          for (const evt of events) {
            const trimmed = evt.trim()
            if (!trimmed) continue
            // Each event may have multiple lines; we only care about "data:" lines
            for (const line of trimmed.split('\n')) {
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (!payload) continue
              if (payload === '[DONE]') {
                safeEnqueue(sseDone())
                safeClose()
                return
              }
              try {
                const json = JSON.parse(payload)
                // If the upstream sent an error, forward it
                if (json?.error) {
                  const errMsg = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
                  if (!receivedAny) {
                    safeEnqueue(sseError(errMsg))
                    safeClose()
                    return
                  }
                  continue
                }
                // OpenAI-style: choices[0].delta.content
                const delta: string | undefined =
                  json?.choices?.[0]?.delta?.content ??
                  json?.choices?.[0]?.message?.content ??
                  json?.delta?.content ??
                  json?.delta ??
                  json?.content
                if (typeof delta === 'string' && delta.length > 0) {
                  receivedAny = true
                  safeEnqueue(sseChunk(delta))
                }
              } catch {
                // If it's not JSON, but we're in plain-text stream mode, treat as raw text
                if (!payload.startsWith('{') && !payload.startsWith('[')) {
                  receivedAny = true
                  safeEnqueue(sseChunk(payload))
                }
              }
            }
          }
        }

        // Flush any remaining buffer content
        if (buffer.trim()) {
          for (const line of buffer.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              if (json?.error) continue
              const delta: string | undefined =
                json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.message?.content ??
                json?.delta?.content ??
                json?.delta ??
                json?.content
              if (typeof delta === 'string' && delta.length > 0) {
                receivedAny = true
                safeEnqueue(sseChunk(delta))
              }
            } catch {}
          }
        }

        if (!receivedAny) {
          safeEnqueue(sseError('AI tidak memberikan respons. Silakan coba lagi.'))
        } else {
          safeEnqueue(sseDone())
        }
      } catch (err) {
        console.error('[AI Assistant] stream read error:', err)
        if (!receivedAny) {
          safeEnqueue(sseError('Terjadi kesalahan saat membaca respons AI.'))
        } else {
          safeEnqueue(sseDone())
        }
      } finally {
        try {
          reader.releaseLock()
        } catch {}
        safeClose()
      }
    },
    cancel() {
      // Client disconnected — nothing to clean up here, the reader will be GC'd
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering (nginx/etc.)
    },
  })
}

export async function GET() {
  return NextResponse.json({
    name: 'Darrellsoft AI Assistant',
    status: 'online',
    description: 'Asisten AI untuk aplikasi Darrell Soft - Kalkulator Hitung Cetakan',
  })
}
