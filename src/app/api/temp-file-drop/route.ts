import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser } from '@/lib/server-auth'
import fs from 'fs/promises'
import path from 'path'

/**
 * TEMP FILE DROP — jalur transfer arsip workspace ke server.
 *
 * Latar: upload file tar melalui IM gateway selalu ditolak (file tidak
 * pernah sampai). Endpoint ini menerima file via aplikasi (jalur yang
 * sama dengan fitur restore database — terbukti lewat), lalu menyimpan
 * ke folder ./upload di disk.
 *
 * POST  /api/temp-file-drop?name=backup.tar.gz[&mode=append]
 *       - body: multipart/form-data, field "file"
 *       - mode=write (default): timpa file
 *       - mode=append: sambung chunk (untuk file besar dipecah klien)
 * GET   /api/temp-file-drop → daftar file di folder upload
 *
 * Sifatnya sementara — dihapus setelah proses ganti konten selesai.
 */

const UPLOAD_DIR = path.join(process.cwd(), 'upload')

/** Nama file aman: buang path traversal & karakter aneh. */
function sanitizeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'upload.bin'
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_')
  return clean || 'upload.bin'
}

export async function GET(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const entries = await fs.readdir(UPLOAD_DIR)
    const files = await Promise.all(
      entries.map(async name => {
        const st = await fs.stat(path.join(UPLOAD_DIR, name))
        return { name, size: st.size, modified: st.mtime.toISOString() }
      }),
    )
    files.sort((a, b) => b.modified.localeCompare(a.modified))
    return NextResponse.json({ files })
  } catch {
    return NextResponse.json({ files: [] })
  }
}

export async function POST(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr
  const user = getServerUser(request)

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Field "file" tidak ditemukan' }, { status: 400 })
    }

    const url = new URL(request.url)
    const mode = url.searchParams.get('mode') === 'append' ? 'append' : 'write'
    const requestedName = url.searchParams.get('name') || file.name || 'upload.bin'
    const name = sanitizeName(requestedName)
    const target = path.join(UPLOAD_DIR, name)

    // Cegah path traversal setelah sanitasi
    if (!target.startsWith(UPLOAD_DIR)) {
      return NextResponse.json({ error: 'Nama file tidak valid' }, { status: 400 })
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())

    if (mode === 'append') {
      await fs.appendFile(target, buffer)
    } else {
      await fs.writeFile(target, buffer)
    }

    const st = await fs.stat(target)
    return NextResponse.json({
      ok: true,
      name,
      uploaded: buffer.length,
      totalSize: st.size,
      mode,
      byUser: user?.id ?? '',
    })
  } catch (error) {
    console.error('[temp-file-drop] Error:', error)
    return NextResponse.json({ error: 'Gagal menyimpan file' }, { status: 500 })
  }
}
