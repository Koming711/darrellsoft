'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Navigation Progress Bar
 *
 * Shows a thin animated bar at the top of the page during route transitions.
 * Triggered by dispatching a 'navigation-start' custom event from Link clicks.
 * Automatically hides when pathname changes (new page rendered).
 */

// Global flag so other components can imperatively start/stop navigation
let _navigating = false
const listeners = new Set<() => void>()

export function startNavigation() {
  _navigating = true
  listeners.forEach(l => l())
}

export function stopNavigation() {
  _navigating = false
  listeners.forEach(l => l())
}

export function isNavigating() {
  return _navigating
}

export function NavigationProgressBar() {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const pathname = usePathname()
  const prevPathnameRef = useRef(pathname)

  // Listen for navigation start/stop from global flag
  useEffect(() => {
    const listener = () => setVisible(_navigating)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  // Listen for custom events (from Link onClick)
  useEffect(() => {
    const onStart = () => {
      setFinishing(false)
      setProgress(0)
      setVisible(true)
    }
    window.addEventListener('navigation-start', onStart)
    return () => window.removeEventListener('navigation-start', onStart)
  }, [])

  // When pathname changes, finish the progress bar
  // Use a ref to track the previous pathname so we only trigger on ACTUAL pathname changes
  useEffect(() => {
    const pathnameChanged = prevPathnameRef.current !== pathname
    prevPathnameRef.current = pathname

    if (!visible || !pathnameChanged) return

    // Navigation complete — animate to 100% and hide
    const t0 = setTimeout(() => {
      setFinishing(true)
      setProgress(90)
    }, 0)
    const t1 = setTimeout(() => setProgress(100), 80)
    const t2 = setTimeout(() => {
      setVisible(false)
      setFinishing(false)
      setProgress(0)
      _navigating = false
      listeners.forEach(l => l())
    }, 350)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
  }, [pathname, visible])

  // Animate progress while navigating
  useEffect(() => {
    if (!visible || finishing) return

    let frame: number
    let elapsed = 0

    const animate = () => {
      elapsed += 16
      // Ease: fast start, slow middle, stalls at ~80%
      const t = elapsed / 1000
      const p = Math.min(80, 20 * t + 30 * Math.log1p(t * 5))
      setProgress(p)
      if (p < 80) {
        frame = requestAnimationFrame(animate)
      }
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [visible, finishing])

  if (!visible && progress === 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px]"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        className="h-full"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa, #93c5fd)',
          transition: finishing
            ? 'width 0.15s ease-out, opacity 0.3s ease'
            : 'width 0.3s ease-out',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
          borderRadius: '0 2px 2px 0',
        }}
      />
    </div>
  )
}

/**
 * Hook to handle navigation click with immediate progress feedback.
 * Use on any Link/button that navigates to a new page.
 */
export function useNavigationProgress() {
  const handleClick = useCallback(() => {
    startNavigation()
    window.dispatchEvent(new CustomEvent('navigation-start'))
  }, [])

  return { handleClick }
}
