'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

interface ThemeToggleProps {
  /** Visual variant for the button */
  variant?: 'default' | 'ghost' | 'outline'
  /** Size of the button */
  size?: 'default' | 'sm' | 'icon'
  /** Optional extra className */
  className?: string
}

/**
 * Theme toggle button — switches between light and dark mode using next-themes.
 * Modeled after the ERP header theme toggle (Moon icon in light mode, Sun icon in dark mode).
 */
export function ThemeToggle({
  variant = 'ghost',
  size = 'icon',
  className = '',
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const current = resolvedTheme ?? theme

  const toggle = () => {
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggle}
      aria-label="Toggle theme"
      className={`shrink-0 ${className}`}
    >
      {/* Avoid hydration mismatch: render Moon until mounted */}
      {!mounted ? (
        <Moon className="w-[18px] h-[18px]" />
      ) : current === 'dark' ? (
        <Sun className="w-[18px] h-[18px]" />
      ) : (
        <Moon className="w-[18px] h-[18px]" />
      )}
    </Button>
  )
}
