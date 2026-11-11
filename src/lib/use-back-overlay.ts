'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

// Integrasi overlay/layar-dalam-halaman dgn TOMBOL BACK FISIK di HP.
//
// Masalah: Detail Invoice / Buat Invoice / menu "Lainnya" dsb. hanyalah state
// React DI DALAM satu route — tidak punya entry history sendiri. Akibatnya
// saat user menekan tombol back fisik HP (gesture / navbar Android), browser
// langsung meninggalkan halaman (atau menutup PWA) — bukan menutup overlay
// yang sedang terbuka. User merasa "tombol back tidak kembali ke halaman
// sebelumnya".
//
// Solusi (pola yang sama dgn popup preview Master Customer): saat overlay
// AKTIF, push satu entry history bertanda `dsOverlay`. Saat back fisik,
// popstate menutup overlay dulu (tetap di halaman yang sama); back berikutnya
// barulah kembali ke halaman sebelumnya. Penutupan via UI (✕ / tombol
// Kembali) menarik balik entry yang di-push agar stack history tetap rapi.
//
// State Next.js (__NA & __PRIVATE_NEXTJS_INTERNALS_TREE) dan tag dsAppIdx
// (lib/app-history) di-SPREAD ke entry overlay supaya navigasi Next dan
// deteksi "ada halaman sebelumnya" tetap berfungsi.

/**
 * Sinkronkan overlay dgn tombol back fisik HP.
 *
 * @param active  true saat overlay terbuka (detail/editor/popup tampil)
 * @param onClose dipanggil saat back fisik menutup overlay
 * @returns fungsi `requestClose()` — WAJIB dipakai utk semua penutupan via
 *          UI (✕, tombol Kembali, Esc) agar entry history ikut ditarik balik.
 *          Penutupan yang menyimpan data & pindah ke overlay lain (mis.
 *          simpan → buka Detail) boleh set state langsung: overlay tetap
 *          terbuka sehingga tidak ada entry baru.
 */
export function useBackOverlay(active: boolean, onClose: () => void): () => void {
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!active) return

    // Push entry history overlay (pertahankan state Next.js + dsAppIdx).
    try {
      const st = (window.history.state || {}) as Record<string, unknown>
      window.history.pushState({ ...st, dsOverlay: true }, '')
      pushedRef.current = true
    } catch {
      pushedRef.current = false
    }

    // Back fisik HP (atau back browser) saat overlay terbuka → tutup overlay,
    // tetap di halaman ini. Back berikutnya → halaman sebelumnya (perilaku
    // default browser).
    const onPopState = () => {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      // Overlay ditutup tanpa popstate (unmount pindah route dsb.) —
      // entry overlay dibiarkan; back berikutnya tetap tampil halaman yang
      // sama lalu kembali lagi (aman, tidak membatalkan navigasi Next.js).
      pushedRef.current = false
    }
  }, [active])

  /** Tutup overlay via UI: tarik balik entry history overlay bila masih di atasnya. */
  const requestClose = useCallback(() => {
    let onOverlayEntry = false
    try {
      const st = window.history.state as Record<string, unknown> | null
      onOverlayEntry = st?.dsOverlay === true
    } catch {
      onOverlayEntry = false
    }
    if (pushedRef.current && onOverlayEntry) {
      // Satu jalur penutupan: history.back() → popstate → onClose di atas.
      window.history.back()
      return
    }
    onCloseRef.current()
  }, [])

  return requestClose
}
