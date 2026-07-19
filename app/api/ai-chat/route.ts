import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// In-memory conversation store (per session)
// Keyed by sessionId — keeps last N messages to maintain context
interface Conversation {
  messages: { role: 'assistant' | 'user'; content: string }[]
  updatedAt: number
}
const conversations = new Map<string, Conversation>()
const MAX_MESSAGES = 20 // keep last 20 messages per conversation
const CONVERSATION_TTL = 30 * 60 * 1000 // 30 minutes

// Clean up expired conversations periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, conv] of conversations.entries()) {
    if (now - conv.updatedAt > CONVERSATION_TTL) {
      conversations.delete(key)
    }
  }
}, 5 * 60 * 1000) // cleanup every 5 minutes

function getSystemPrompt(language: 'id' | 'en'): string {
  if (language === 'en') {
    return `You are Darrell AI, a friendly and knowledgeable assistant for Darrell Soft — a printing cost calculator application for printing businesses and SMEs in Indonesia.

Your role:
- Help users with questions about printing cost calculations (paper costs, printing costs, finishing costs, profit margins)
- Provide business advice for printing businesses (pricing strategy, profit optimization, cost reduction)
- Help users understand how to use the Darrell Soft app features
- Answer questions about printing materials (paper types, sizes, grammage) and printing techniques (offset, digital, screen printing)
- Give tips on managing a printing business effectively

Guidelines:
- Be concise, friendly, and practical. Keep responses under 200 words unless the user asks for detail.
- Use clear, simple language that a small business owner can understand.
- When discussing prices/costs, use Indonesian Rupiah (Rp) as the currency.
- If the user asks about something unrelated to printing or business, gently redirect them to printing/business topics.
- If you don't know something, say so honestly rather than making up information.
- Format responses with short paragraphs and bullet points for readability.

You are speaking with a printing business owner/entrepreneur. Be encouraging and supportive!`
  }

  return `Anda adalah Darrell AI, asisten yang ramah dan berpengetahuan luas untuk Darrell Soft — aplikasi kalkulator hitung biaya cetakan untuk usaha percetakan dan UMKM di Indonesia.

Peran Anda:
- Membantu pengguna dengan pertanyaan tentang perhitungan biaya cetakan (biaya kertas, biaya cetak, biaya finishing, margin keuntungan)
- Memberikan saran bisnis untuk usaha percetakan (strategi harga, optimasi keuntungan, pengurangan biaya)
- Membantu pengguna memahami cara menggunakan fitur-fitur aplikasi Darrell Soft
- Menjawab pertanyaan tentang bahan cetakan (jenis kertas, ukuran, gramatur) dan teknik cetak (offset, digital, sablon)
- Memberikan tips mengelola usaha percetakan dengan baik

Pedoman:
- Singkat, ramah, dan praktis. Batasi respons maksimal 200 kata kecuali pengguna meminta detail.
- Gunakan bahasa yang jelas dan sederhana yang bisa dipahami pemilik usaha kecil.
- Saat membahas harga/biaya, gunakan Rupiah (Rp) sebagai mata uang.
- Jika pengguna bertanya hal di luar topik percetakan/bisnis, arahkan dengan halus kembali ke topik percetakan/bisnis.
- Jika Anda tidak tahu sesuatu, katakan dengan jujur daripada mengarang informasi.
- Format respons dengan paragraf pendek dan poin-poin untuk keterbacaan.

Anda sedang berbicara dengan pemilik/pebisnis usaha percetakan. Bersikaplah mendorong dan mendukung!`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, sessionId, language = 'id' } = body as {
      message?: string
      sessionId?: string
      language?: 'id' | 'en'
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Message too long (max 2000 characters)' },
        { status: 400 }
      )
    }

    const sid = sessionId || `anon-${Date.now()}`
    const lang: 'id' | 'en' = language === 'en' ? 'en' : 'id'
    const systemPrompt = getSystemPrompt(lang)

    // Get or create conversation
    let conv = conversations.get(sid)
    if (!conv) {
      conv = {
        messages: [{ role: 'assistant', content: systemPrompt }],
        updatedAt: Date.now(),
      }
      conversations.set(sid, conv)
    }

    // Add user message
    conv.messages.push({ role: 'user', content: message.trim() })

    // Trim if exceeding max (keep system prompt + last N)
    if (conv.messages.length > MAX_MESSAGES) {
      conv.messages = [
        conv.messages[0], // keep system prompt
        ...conv.messages.slice(-(MAX_MESSAGES - 1)),
      ]
    }

    // Call ZAI LLM
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: conv.messages,
      thinking: { type: 'disabled' },
    })

    const aiResponse = completion.choices[0]?.message?.content

    if (!aiResponse || aiResponse.trim().length === 0) {
      return NextResponse.json(
        {
          error: lang === 'en' ? 'AI could not generate a response. Please try again.' : 'AI tidak bisa memberikan respons. Silakan coba lagi.',
          response: '',
        },
        { status: 500 }
      )
    }

    // Add AI response to conversation history
    conv.messages.push({ role: 'assistant', content: aiResponse })
    conv.updatedAt = Date.now()

    return NextResponse.json({
      response: aiResponse,
      sessionId: sid,
    })
  } catch (error: any) {
    console.error('AI Chat error:', error)
    return NextResponse.json(
      {
        error: 'Failed to get AI response. Please try again.',
        response: '',
      },
      { status: 500 }
    )
  }
}
