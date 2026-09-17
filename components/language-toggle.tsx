'use client'

import * as React from 'react'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface LanguageToggleProps {
  /** Optional extra className */
  className?: string
  /** Compact size (smaller trigger button) */
  compact?: boolean
}

/** Indonesian flag SVG (red over white) */
function IndonesiaFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={className} preserveAspectRatio="xMidYMid slice">
      <rect width="24" height="8" fill="#dc2626" />
      <rect y="8" width="24" height="8" fill="#ffffff" />
    </svg>
  )
}

/** United Kingdom flag SVG (Union Jack) */
function UkFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={className} preserveAspectRatio="xMidYMid slice">
      <rect width="24" height="16" fill="#012169" />
      {/* White diagonals (St Andrew) */}
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#ffffff" strokeWidth="3.2" />
      {/* Red diagonals (St Patrick) — offset for correct asymmetry */}
      <path d="M0,0 L24,16" stroke="#c8102e" strokeWidth="1.6" />
      <path d="M24,0 L0,16" stroke="#c8102e" strokeWidth="1.6" />
      {/* White cross (vertical + horizontal) */}
      <rect x="9" width="6" height="16" fill="#ffffff" />
      <rect y="5" width="24" height="6" fill="#ffffff" />
      {/* Red cross (St George) */}
      <rect x="10" width="4" height="16" fill="#c8102e" />
      <rect y="6" width="24" height="4" fill="#c8102e" />
    </svg>
  )
}

/**
 * Language toggle — dropdown with Indonesian and UK (English) flag options.
 * Trigger shows the currently active flag + a chevron.
 * Uses the LanguageContext which persists to localStorage + /api/settings.
 */
export function LanguageToggle({ className = '', compact = false }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage()
  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Display mounted flag (active) or a neutral state while mounting
  const activeFlag = mounted && language === 'en' ? <UkFlag /> : <IndonesiaFlag />
  const activeLabel = mounted && language === 'en' ? 'English' : 'Indonesia'

  const triggerSize = compact ? 'h-8 w-8 md:h-9 md:w-9' : 'h-9 w-9'
  const flagClass = compact ? 'w-4 h-3 md:w-5 md:h-3.5' : 'w-5 h-3.5'
  const menuFlagClass = 'w-6 h-4'

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Change language. Current: ${activeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={activeLabel}
        className={cn(
          'flex items-center justify-center rounded-md transition-all bg-muted/50 hover:bg-muted',
          'ring-1 ring-transparent hover:ring-border',
          triggerSize
        )}
      >
        <span className="flex items-center gap-0.5">
          <span className={cn('rounded-sm overflow-hidden block', flagClass)}>
            {React.cloneElement(activeFlag as React.ReactElement, { className: cn('block', flagClass) })}
          </span>
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Select language"
          className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-popover shadow-lg z-50 p-1 animate-in fade-in-0 zoom-in-95"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setLanguage('id'); setOpen(false) }}
            className={cn(
              'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors text-left',
              mounted && language === 'id'
                ? 'bg-accent text-accent-foreground font-semibold'
                : 'hover:bg-accent hover:text-accent-foreground text-foreground'
            )}
          >
            <span className={cn('rounded-sm overflow-hidden block shrink-0', menuFlagClass)}>
              <IndonesiaFlag className={cn('block', menuFlagClass)} />
            </span>
            <span className="flex-1">Indonesia</span>
            {mounted && language === 'id' && (
              <span className="text-xs text-muted-foreground">✓</span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setLanguage('en'); setOpen(false) }}
            className={cn(
              'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors text-left',
              mounted && language === 'en'
                ? 'bg-accent text-accent-foreground font-semibold'
                : 'hover:bg-accent hover:text-accent-foreground text-foreground'
            )}
          >
            <span className={cn('rounded-sm overflow-hidden block shrink-0', menuFlagClass)}>
              <UkFlag className={cn('block', menuFlagClass)} />
            </span>
            <span className="flex-1">English (UK)</span>
            {mounted && language === 'en' && (
              <span className="text-xs text-muted-foreground">✓</span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
