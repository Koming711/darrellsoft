'use client'

/**
 * Popup gambar ukuran penuh (lightbox).
 * Dipakai PhotoUpload (thumbnail foto lampiran) & RincianCetakanPreview (foto di preview):
 * klik gambar → popup menampilkan gambar tersebut utuh (object-contain, max 70vh).
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface PhotoLightboxProps {
  /** Data URL / URL gambar yang ditampilkan. */
  src: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Judul dialog (default "Foto Lampiran"). */
  title?: string
  alt?: string
}

export function PhotoLightbox({
  src,
  open,
  onOpenChange,
  title = 'Foto Lampiran',
  alt = 'Foto Lampiran',
}: PhotoLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] p-3 sm:max-w-3xl sm:p-4">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Pratinjau gambar ukuran penuh. Klik di luar gambar atau tombol tutup untuk keluar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50 p-2">
          <img
            src={src}
            alt={alt}
            className="max-h-[calc(70vh-1.5rem)] w-auto max-w-full rounded object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
