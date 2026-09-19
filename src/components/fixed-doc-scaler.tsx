'use client'

/**
 * FixedDocScaler — menampilkan dokumen berLEBAR TETAP (mis. 720px) di dalam
 * kontainer yang bisa lebih sempit (dialog pratinjau di HP) dengan CSS
 * transform: scale() — LAYOUT dokumen tidak pernah berubah, hanya diperkecil
 * secara visual sehingga muat di layar.
 *
 * Kenapa komponen ini ada:
 *  Capture JPG/Cetak harus menghasilkan gambar yang SAMA PERSIS antara mobile
 *  & desktop. Media query Tailwind (sm:/lg:) dievaluasi terhadap lebar
 *  VIEWPORT, bukan lebar elemen — jadi menangkap elemen yang lebar-nya ikut
 *  kontainer menghasilkan layout berbeda antar perangkat. Solusi: dokumen
 *  selalu dirender fixed-width (tanpa varian responsif), dan komponen ini
 *  hanya men-skala tampilannya untuk layar kecil.
 *
 * Capture harus menargetkan elemen DALAM komponen ini (lewat innerRef) —
 * scrollWidth/scrollHeight elemen tersebut tidak terpengaruh transform, jadi
 * selalu berukuran fixedWidth × tinggi konten asli.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

export function FixedDocScaler({
  fixedWidth,
  innerRef,
  innerClassName,
  className,
  children,
}: {
  /** Lebar layout dokumen dalam px CSS (mis. 720 atau 768). */
  fixedWidth: number
  /** Ref yang akan diarahkan ke elemen dokumen berlebar tetap (target capture). */
  innerRef?: RefObject<HTMLDivElement | null>
  /** Class tambahan untuk elemen dokumen (mis. padding & bg). */
  innerClassName?: string
  /** Class untuk pembungkus luar. */
  className?: string
  children: ReactNode
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerElRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [naturalH, setNaturalH] = useState(0)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerElRef.current
    if (!outer || !inner) return

    const update = () => {
      const w = outer.clientWidth
      if (w > 0) setScale(Math.min(1, w / fixedWidth))
      // offsetHeight = natural layout height (element is NOT vertically
      // stretched thanks to items-start below); take the max with
      // scrollHeight to never miss growing content.
      const h = Math.max(inner.offsetHeight, inner.scrollHeight)
      if (h > 0) setNaturalH(h)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(outer)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [fixedWidth])

  return (
    <div
      ref={outerRef}
      // items-start PENTING: tanpa ini flex default (align-items: stretch)
      // menjepit tinggi dokumen ke tinggi pembungkus — ukuran capture jadi
      // berbeda antara layar kecil & besar.
      className={`flex items-start justify-center overflow-hidden ${className || ''}`}
      // Kompensasi tinggi: tinggi visual = tinggi asli × skala, agar area
      // scroll dialog & sticky footer pas (tidak ada ruang kosong berlebih).
      style={naturalH > 0 ? { height: Math.ceil(naturalH * scale) } : undefined}
    >
      <div
        ref={(el) => {
          innerElRef.current = el
          if (innerRef) innerRef.current = el
        }}
        className={`shrink-0 ${innerClassName || ''}`}
        style={{
          width: `${fixedWidth}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  )
}
