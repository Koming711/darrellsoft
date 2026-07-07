import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const appName = 'DarrellPOS'
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''

    const manifest = {
      name: appName,
      short_name: appName,
      description: 'Aplikasi kalkulator hitung cetakan profesional',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#003c8c',
      theme_color: '#003c8c',
      orientation: 'portrait',
      icons: [
        {
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    }

    return new NextResponse(JSON.stringify(manifest), {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error) {
    console.error('Error generating manifest:', error)
    const manifest = {
      name: 'DarrellPOS',
      short_name: 'DarrellPOS',
      description: 'Aplikasi kalkulator hitung cetakan profesional',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#003c8c',
      theme_color: '#003c8c',
      orientation: 'portrait',
      icons: [
        { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    }
    return new NextResponse(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json' },
    })
  }
}
