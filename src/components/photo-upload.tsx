'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { compressImageToJpegDataUrl, dataUrlBytes, formatBytes } from '@/lib/image-compress'

interface PhotoUploadProps {
  /** Data URL foto saat ini ('' = belum ada foto). */
  value: string
  /** Dipanggil dengan data URL baru ('' saat foto dihapus). */
  onChange: (dataUrl: string) => void
  disabled?: boolean
  /** Label di atas blok foto. */
  label?: string
}

/**
 * Blok upload foto serbaguna (dipakai Master Barang, Hitung Cetakan, Potong Kertas):
 * Pilih File + Kamera (capture environment), kompresi otomatis JPEG ≤300KB di browser,
 * preview 2 zona (thumbnail + info, tombol grid 3 kolom) agar tidak terpotong di mobile.
 */
export function PhotoUpload({ value, onChange, disabled = false, label = 'Foto' }: PhotoUploadProps) {
  const rid = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const lock = busy || disabled

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset agar file yang sama bisa dipilih ulang
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await compressImageToJpegDataUrl(file)
      onChange(dataUrl)
      toast.success(`Foto dikompres ke JPG (${formatBytes(dataUrlBytes(dataUrl))})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${rid}-file`}>{label}</Label>
      <input
        ref={fileRef}
        id={`${rid}-file`}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleChange(e)}
        disabled={lock}
      />
      <input
        ref={cameraRef}
        id={`${rid}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Ambil foto dengan kamera"
        onChange={(e) => void handleChange(e)}
        disabled={lock}
      />
      {value ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-2.5">
          <div className="flex items-center gap-3">
            <img
              src={value}
              alt="Preview foto"
              className="h-16 w-16 shrink-0 rounded-md border border-stone-200 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-stone-700">JPG · {formatBytes(dataUrlBytes(value))}</p>
              <p className="mt-0.5 text-[11px] text-emerald-600">Terkompres otomatis ≤ 300KB</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full px-2 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={lock}
            >
              Ganti Foto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full px-2 text-xs"
              onClick={() => cameraRef.current?.click()}
              disabled={lock}
            >
              <Camera className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Kamera
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onChange('')}
              disabled={lock}
            >
              Hapus Foto
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={lock}
              className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white p-3 text-center transition-colors hover:bg-stone-50 disabled:opacity-60"
            >
              <ImagePlus className="h-5 w-5 text-stone-400" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{busy ? 'Mengompres foto…' : 'Pilih File'}</span>
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={lock}
              className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white p-3 text-center transition-colors hover:bg-stone-50 disabled:opacity-60"
            >
              <Camera className="h-5 w-5 text-stone-400" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{busy ? 'Mengompres foto…' : 'Kamera'}</span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Otomatis dikompres ke JPG ≤ 300KB</p>
        </div>
      )}
    </div>
  )
}
