/**
 * WhatsApp - Buka aplikasi WhatsApp
 * 
 * - Android Chrome: Chrome Intent dengan scheme=whatsapp + package=com.whatsapp.w4b
 *   → langsung buka aplikasi WhatsApp Business
 * - Android lainnya: whatsapp:// → buka WhatsApp
 * - iOS: whatsapp:// → buka WhatsApp  
 * - Desktop: whatsapp:// → buka aplikasi WhatsApp Desktop, fallback ke web.whatsapp.com
 */

function detectPlatform(): 'android' | 'ios' | 'desktop' {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  return 'desktop'
}

/**
 * Buka WhatsApp dengan pesan.
 * Di Android Chrome, langsung buka aplikasi WhatsApp Business.
 */
export function openWhatsApp(
  encodedMessage: string,
  options?: {
    waWindowRef?: React.MutableRefObject<Window | null>
  }
) {
  const platform = detectPlatform()

  if (platform === 'android') {
    const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge|OPR|Firefox/i.test(navigator.userAgent)

    if (isChrome) {
      // Android Chrome: pakai scheme=whatsapp + package=com.whatsapp.w4b
      // Format: intent://HOST#Intent;scheme=whatsapp;package=com.whatsapp.w4b;...;end
      // Ini bilang ke Chrome: "buka whatsapp://send?text=... pakai aplikasi com.whatsapp.w4b"
      const intentUrl = `intent://send?text=${encodedMessage}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`

      window.location.href = intentUrl

      // Fallback: kalau 2.5 detik masih di browser, coba buka WA biasa
      const fallback = setTimeout(() => {
        if (!document.hidden) {
          window.location.href = `whatsapp://send?text=${encodedMessage}`
        }
      }, 2500)

      const onHidden = () => {
        if (document.hidden) {
          clearTimeout(fallback)
          document.removeEventListener('visibilitychange', onHidden)
        }
      }
      document.addEventListener('visibilitychange', onHidden)

    } else {
      // Android non-Chrome: pakai whatsapp:// scheme
      window.location.href = `whatsapp://send?text=${encodedMessage}`

      const t = setTimeout(() => {
        if (!document.hidden) window.open(`https://wa.me/?text=${encodedMessage}`, '_blank')
      }, 2500)
      const cleanup = () => { clearTimeout(t); document.removeEventListener('visibilitychange', cleanup) }
      document.addEventListener('visibilitychange', cleanup)
    }

  } else if (platform === 'ios') {
    // iOS: whatsapp:// scheme
    window.location.href = `whatsapp://send?text=${encodedMessage}`

    const t = setTimeout(() => {
      if (!document.hidden) window.open(`https://wa.me/?text=${encodedMessage}`, '_blank')
    }, 2500)
    const cleanup = () => { clearTimeout(t); document.removeEventListener('visibilitychange', cleanup) }
    document.addEventListener('visibilitychange', cleanup)

  } else {
    // Desktop: Buka aplikasi WhatsApp Desktop via hidden iframe
    // Menggunakan iframe supaya browser otomatis "always open" tanpa prompt konfirmasi
    const waUrl = `whatsapp://send?text=${encodedMessage}`
    let iframe: HTMLIFrameElement | null = document.getElementById('wa-launch-iframe') as HTMLIFrameElement | null
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'wa-launch-iframe'
      iframe.style.display = 'none'
      document.body.appendChild(iframe)
    }
    iframe.src = waUrl

    const t = setTimeout(() => {
      if (!document.hidden) {
        // Fallback: buka WhatsApp Web jika aplikasi desktop tidak terinstall
        const url = `https://web.whatsapp.com/send?text=${encodedMessage}`
        if (options?.waWindowRef) {
          const ref = options.waWindowRef
          if (ref.current && !ref.current.closed) {
            ref.current.location.href = url
            ref.current.focus()
          } else {
            ref.current = window.open(url, 'whatsapp_share')
          }
        } else {
          window.open(url, '_blank')
        }
      }
    }, 1500)
    const cleanup = () => { clearTimeout(t); document.removeEventListener('visibilitychange', cleanup) }
    document.addEventListener('visibilitychange', cleanup)
  }
}
