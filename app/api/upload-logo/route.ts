import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser } from '@/lib/server-auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    // Any authenticated user can upload logo
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('logo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File logo tidak ditemukan' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File harus berupa gambar (PNG, JPG, SVG)' }, { status: 400 })
    }

    // Limit file size to 500KB
    if (file.size > 500 * 1024) {
      return NextResponse.json({ error: 'Ukuran file maksimal 500KB' }, { status: 400 })
    }

    // Convert to base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

    // Save to USER-specific settings (multi-tenant: each user has their own logo)
    await db.userSetting.upsert({
      where: { userId_key: { userId: user.id, key: 'company_logo' } },
      update: { value: base64 },
      create: { userId: user.id, key: 'company_logo', value: base64 },
    })

    return NextResponse.json({ success: true, logo: base64 })
  } catch (error) {
    console.error('Error uploading logo:', error)
    return NextResponse.json({ error: 'Gagal mengupload logo' }, { status: 500 })
  }
}
