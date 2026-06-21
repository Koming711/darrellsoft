'use client'

import * as React from 'react'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'

interface LanguageToggleProps {
  /** Optional extra className */
  className?: string
  /** Compact size (smaller flags) */
  compact?: boolean
}

/**
 * Language toggle — flag buttons for Indonesian and English.
 * Click a flag to switch the app language. The active flag is highlighted.
 * Uses the LanguageContext which persists to localStorage + /api/settings.
 */
export function LanguageToggle({ className = '', compact = false }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const btnSize = compact ? 'h-8 w-8' : 'h-9 w-9'

  return (
    <div className={`flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 ${className}`}>
      <button
        onClick={() => setLanguage('id')}
        aria-label="Switch to Indonesian"
        title="Bahasa Indonesia"
        className={cn(
          'flex items-center justify-center rounded-md transition-all',
          btnSize,
          mounted && language === 'id'
            ? 'bg-background shadow-sm ring-1 ring-border'
            : 'opacity-50 hover:opacity-100'
        )}
      >
        <svg viewBox="0 0 24 16" className="w-5 h-3.5 rounded-sm overflow-hidden block" preserveAspectRatio="xMidYMid slice">
          <rect width="24" height="8" fill="#dc2626" />
          <rect y="8" width="24" height="8" fill="#ffffff" />
        </svg>
      </button>
      <button
        onClick={() => setLanguage('en')}
        aria-label="Switch to English"
        title="English"
        className={cn(
          'flex items-center justify-center rounded-md transition-all',
          btnSize,
          mounted && language === 'en'
            ? 'bg-background shadow-sm ring-1 ring-border'
            : 'opacity-50 hover:opacity-100'
        )}
      >
        <svg viewBox="0 0 24 16" className="w-5 h-3.5 rounded-sm overflow-hidden block" preserveAspectRatio="xMidYMid slice">
          <rect width="24" height="16" fill="#ffffff" />
          <rect y="1.23" width="24" height="1.23" fill="#dc2626" />
          <rect y="3.69" width="24" height="1.23" fill="#dc2626" />
          <rect y="6.15" width="24" height="1.23" fill="#dc2626" />
          <rect y="8.61" width="24" height="1.23" fill="#dc2626" />
          <rect y="11.07" width="24" height="1.23" fill="#dc2626" />
          <rect y="13.53" width="24" height="1.23" fill="#dc2626" />
          <rect width="10" height="8.5" fill="#1e3a8a" />
          <text x="2" y="6.5" fontSize="4" fill="white">★</text>
          <text x="5" y="4.5" fontSize="3" fill="white">★</text>
          <text x="7" y="7" fontSize="3" fill="white">★</text>
        </svg>
      </button>
    </div>
  )
}
