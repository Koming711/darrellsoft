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
 * Language toggle — flag buttons for Indonesian (🇮🇩) and English (🇺🇸).
 * Click a flag to switch the app language. The active flag is highlighted.
 * Uses the LanguageContext which persists to localStorage + /api/settings.
 */
export function LanguageToggle({ className = '', compact = false }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const flagSize = compact ? 'text-base' : 'text-lg'
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
          flagSize,
          mounted && language === 'id'
            ? 'bg-background shadow-sm ring-1 ring-border'
            : 'opacity-50 hover:opacity-100'
        )}
      >
        <span className="leading-none">🇮🇩</span>
      </button>
      <button
        onClick={() => setLanguage('en')}
        aria-label="Switch to English"
        title="English"
        className={cn(
          'flex items-center justify-center rounded-md transition-all',
          btnSize,
          flagSize,
          mounted && language === 'en'
            ? 'bg-background shadow-sm ring-1 ring-border'
            : 'opacity-50 hover:opacity-100'
        )}
      >
        <span className="leading-none">🇺🇸</span>
      </button>
    </div>
  )
}
