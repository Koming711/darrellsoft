'use client'

/**
 * File Drop — halaman transfer arsip workspace ke server (SEMENTARA).
 *
 * Latar: upload file tar melalui chat/IM gateway selalu ditolak, jadi
 * file tidak pernah sampai ke server. Halaman ini meng-upload lewat
 * jalur aplikasi (sama seperti fitur restore database) yang terbukti
 * berfungsi.
 *
 * Cara pakai:
 * 1. Login dulu (halaman akan mengalihkan ke /login bila belum).
 * 2. Pilih satu atau beberapa file (mis. tar.001 / tar.002 / tar.003,
 *    atau satu tar.gz / zip).
 * 3. File dipecah otomatis jadi chunk 4MB dan digabung di server.
 * 4. Beri tahu asisten bila semua file sudah terupload.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, CloudUpload, Loader2, RefreshCw } from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { getAuthHeaders } from '@/lib/auth-fetch'

const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB

interface ServerFile {
  name: string
  size: number
  modified: string
}

interface UploadState {
  name: string
  percent: number
  status: 'menunggu' | 'mengunggah' | 'selesai' | 'gagal'
  error?: string
}

function formatBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(2)} GB`
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(2)} MB`
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KB`
  return `${n} B`
}

export default function FileDropPage() {
  const [ready, setReady] = useState(false)
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [serverFiles, setServerFiles] = useState<ServerFile[]>([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const u = getAuthUser()
    if (!u) {
      window.location.href = '/login'
      return
    }
    setReady(true)
  }, [])

  const loadServerFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/temp-file-drop', { headers: { ...getAuthHeaders() }, cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setServerFiles(Array.isArray(data.files) ? data.files : [])
    } catch {
      /* abaikan — daftar bisa dimuat ulang manual */
    }
  }, [])

  useEffect(() => {
    if (ready) void loadServerFiles()
  }, [ready, loadServerFiles])

  async function uploadOne(file: File, idx: number) {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

    for (let i = 0; i < totalChunks; i++) {
      const blob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size))
      const fd = new FormData()
      fd.append('file', blob, 'chunk.bin')

      const mode = i === 0 ? 'write' : 'append'
      const res = await fetch(`/api/temp-file-drop?mode=${mode}&name=${encodeURIComponent(safeName)}`, {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const percent = Math.round(((i + 1) / totalChunks) * 100)
      setUploads(prev => prev.map((u, j) => (j === idx ? { ...u, percent, status: 'mengunggah' } : u)))
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || busy) return
    setBusy(true)
    const arr = Array.from(files)
    setUploads(arr.map(f => ({ name: f.name, percent: 0, status: 'menunggu' as const })))

    for (let i = 0; i < arr.length; i++) {
      setUploads(prev => prev.map((u, j) => (j === i ? { ...u, status: 'mengunggah' } : u)))
      try {
        await uploadOne(arr[i], i)
        setUploads(prev => prev.map((u, j) => (j === i ? { ...u, status: 'selesai', percent: 100 } : u)))
      } catch (e) {
        setUploads(prev =>
          prev.map((u, j) => (j === i ? { ...u, status: 'gagal', error: e instanceof Error ? e.message : 'Gagal' } : u)),
        )
      }
    }

    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    void loadServerFiles()
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Memuat…</div>
  }

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="mx-auto max-w-xl space-y-4">
        <a href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </a>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-6 w-6 text-emerald-600" />
            <h1 className="text-lg font-bold">Transfer File ke Server</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload arsip workspace (tar/zip) langsung lewat aplikasi. File dipecah otomatis jadi chunk 4MB
            sehingga aman melewati gateway. Setelah semua file terupload, beri tahu asisten untuk mengekstrak.
          </p>

          <label
            className={`mt-4 flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              busy ? 'border-stone-200 bg-stone-50 opacity-60' : 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              disabled={busy}
              onChange={e => void handleUpload(e.target.files)}
            />
            {busy ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                <span className="text-sm font-semibold text-stone-700">Mengunggah…</span>
              </>
            ) : (
              <>
                <CloudUpload className="h-7 w-7 text-emerald-600" />
                <span className="text-sm font-semibold text-stone-700">Klik untuk pilih file</span>
                <span className="text-xs text-muted-foreground">Bisa pilih beberapa file sekaligus</span>
              </>
            )}
          </label>

          {uploads.length > 0 && (
            <div className="mt-4 space-y-2">
              {uploads.map((u, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{u.name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      {u.status === 'selesai' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {(u.status === 'mengunggah' || u.status === 'menunggu') && (
                        <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                      )}
                      {u.status === 'selesai' ? 'Selesai' : u.status === 'gagal' ? `Gagal: ${u.error ?? ''}` : `${u.percent}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full transition-all ${u.status === 'gagal' ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${u.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">File di server</h2>
            <button
              type="button"
              onClick={() => void loadServerFiles()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-stone-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
            </button>
          </div>
          {serverFiles.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Belum ada file.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {serverFiles.map(f => (
                <li key={f.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate font-mono">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
