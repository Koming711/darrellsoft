import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cache for generated icons
const iconCache = new Map<string, { buffer: Buffer; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const size = parseInt(searchParams.get('size') || '192', 10)

    const cacheKey = `icon-${size}`
    const cached = iconCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new NextResponse(cached.buffer, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
      })
    }

    // Get company logo from settings
    const [logoSetting, companyNameSetting] = await Promise.all([
      db.setting.findUnique({ where: { key: 'company_logo' } }),
      db.setting.findUnique({ where: { key: 'company_name' } }),
    ])
    const companyName = companyNameSetting?.value || 'P'

    let pngBuffer: Buffer

    if (logoSetting?.value) {
      let imageBuffer: Buffer | null = null

      if (logoSetting.value.startsWith('data:')) {
        const matches = logoSetting.value.match(/^data:(.+?);base64,(.+)$/)
        if (matches) {
          imageBuffer = Buffer.from(matches[2], 'base64')
        }
      } else if (logoSetting.value.startsWith('http')) {
        try {
          const imgRes = await fetch(logoSetting.value, { signal: AbortSignal.timeout(5000) })
          if (imgRes.ok) imageBuffer = Buffer.from(await imgRes.arrayBuffer())
        } catch {}
      }

      if (imageBuffer) {
        const sharp = (await import('sharp')).default
        pngBuffer = await sharp(imageBuffer)
          .resize(size, size, { fit: 'cover', background: { r: 59, g: 130, b: 246, alpha: 1 } })
          .png()
          .toBuffer()
      } else {
        pngBuffer = await generateFallbackIcon(companyName, size)
      }
    } else {
      pngBuffer = await generateFallbackIcon(companyName, size)
    }

    iconCache.set(cacheKey, { buffer: pngBuffer, timestamp: Date.now() })

    return new NextResponse(pngBuffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    })
  } catch (error) {
    console.error('Error generating app icon:', error)
    const fallback = await generateFallbackIcon('P', 192)
    return new NextResponse(fallback, {
      headers: { 'Content-Type': 'image/png' },
    })
  }
}

async function generateFallbackIcon(text: string, size: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const letter = (text || 'P').charAt(0).toUpperCase()
  const fontSize = Math.floor(size * 0.6)
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.2)}" fill="#3b82f6"/>
      <text
        x="50%" y="50%"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
      >${letter}</text>
    </svg>
  `
  return sharp(Buffer.from(svg)).png().toBuffer()
}
