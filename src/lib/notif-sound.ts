/**
 * Notification sound utility — uses Web Audio API to generate short chimes.
 * No external audio file needed (works offline, PWA-friendly).
 *
 * Suara berbeda per jenis notifikasi:
 *  - 'registration' : dua nada naik (C6 → G5) — pendaftaran akun baru
 *  - 'subscription' : tiga nada turun lembut (E5 → C5 → G4) — pengingat langganan
 *  - 'info'         : dua nada naik (default, kompatibel versi lama)
 *
 * Browser autoplay policy: AudioContext must be resumed after a user gesture.
 * We auto-resume on first call (users have already interacted via login).
 */

let audioCtx: AudioContext | null = null

export type NotifSoundKind = 'registration' | 'subscription' | 'info'

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

interface ToneSpec {
  freq: number
  start: number
  dur: number
  peak: number
  type?: OscillatorType
}

function playTones(ctx: AudioContext, tones: ToneSpec[], masterEnd: number): void {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.35, now + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, now + masterEnd)
  master.connect(ctx.destination)

  for (const t of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = t.type || 'sine'
    osc.frequency.setValueAtTime(t.freq, now + t.start)
    gain.gain.setValueAtTime(0.0001, now + t.start)
    gain.gain.exponentialRampToValueAtTime(t.peak, now + t.start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur)
    osc.connect(gain).connect(master)
    osc.start(now + t.start)
    osc.stop(now + t.start + t.dur + 0.05)
  }
}

/**
 * Play a short notification chime. `kind` memilih pola nada sesuai jenis
 * notifikasi. Safe to call multiple times — silently fails if audio unavailable.
 */
export function playNotifSound(kind: NotifSoundKind = 'info'): void {
  const ctx = getCtx()
  if (!ctx) return

  try {
    if (kind === 'subscription') {
      // Pengingat langganan: tiga nada turun lembut (beda jelas dari pendaftaran)
      playTones(
        ctx,
        [
          { freq: 659.25, start: 0.0, dur: 0.32, peak: 0.55 }, // E5
          { freq: 523.25, start: 0.22, dur: 0.32, peak: 0.5 }, // C5
          { freq: 392.0, start: 0.44, dur: 0.45, peak: 0.45 }, // G4
        ],
        1.05
      )
      return
    }

    // registration / info: dua nada naik (C6 lalu G5) — kompatibel versi lama
    playTones(
      ctx,
      [
        { freq: 880, start: 0.0, dur: 0.5, peak: 0.6 }, // A5-ish bell (kompatibel 880 lama)
        { freq: 659.25, start: 0.18, dur: 0.55, peak: 0.5 }, // G5-ish (kompatibel lama)
      ],
      0.9
    )
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
