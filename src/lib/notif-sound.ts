/**
 * Notification sound utility — uses Web Audio API to generate a pleasant
 * two-tone "ding" chime. No external audio file needed (works offline, PWA-friendly).
 *
 * Browser autoplay policy: AudioContext must be resumed after a user gesture.
 * We auto-resume on first call (admins have already interacted via login).
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioCtx = new Ctor()
    }
    // Resume if suspended (autoplay policy)
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Play a short, pleasant notification chime (two ascending tones).
 * Safe to call multiple times — silently fails if audio unavailable.
 */
export function playNotifSound(): void {
  const ctx = getCtx()
  if (!ctx) return

  try {
    const now = ctx.currentTime

    // Master gain (envelope)
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.35, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    master.connect(ctx.destination)

    // Tone 1 (higher, soft bell) — C6
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, now)
    gain1.gain.setValueAtTime(0.0001, now)
    gain1.gain.exponentialRampToValueAtTime(0.6, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    osc1.connect(gain1).connect(master)
    osc1.start(now)
    osc1.stop(now + 0.55)

    // Tone 2 (lower, follows shortly) — G5
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(659.25, now + 0.18)
    gain2.gain.setValueAtTime(0.0001, now + 0.18)
    gain2.gain.exponentialRampToValueAtTime(0.5, now + 0.2)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)
    osc2.connect(gain2).connect(master)
    osc2.start(now + 0.18)
    osc2.stop(now + 0.9)
  } catch {
    // silent fail — audio not critical
  }
}

/**
 * "Unlock" audio on first user interaction (required by browsers for autoplay).
 * Call once on app mount; listens for first click/keydown to resume AudioContext.
 */
let unlocked = false
export function unlockAudioOnInteraction(): void {
  if (typeof window === 'undefined' || unlocked) return
  unlocked = true
  const resume = () => {
    const ctx = getCtx()
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
    window.removeEventListener('click', resume)
    window.removeEventListener('keydown', resume)
    window.removeEventListener('touchstart', resume)
  }
  window.addEventListener('click', resume, { once: true })
  window.addEventListener('keydown', resume, { once: true })
  window.addEventListener('touchstart', resume, { once: true })
}
