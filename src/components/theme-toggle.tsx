'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { persistDarkMode, clearInlineOverridesForDarkMode } from '@/contexts/theme-context'
import { getAuthUser } from '@/lib/auth'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'

interface ThemeToggleProps {
  /** Visual variant for the button */
  variant?: 'default' | 'ghost' | 'outline'
  /** Size of the button */
  size?: 'default' | 'sm' | 'icon'
  /** Optional extra className */
  className?: string
}

/**
 * Theme toggle button — switches between light and dark mode.
 *
 * Syncs with THREE systems so dark mode persists across ALL pages and login sessions:
 * 1. next-themes (applies .dark class to <html> immediately + stores in localStorage "theme")
 * 2. Custom darrellsoft_dark_mode localStorage key (read by ThemeProvider for non-auth pages)
 * 3. Database /api/settings theme_dark_mode (read by applyThemeAfterLogin after login)
 *
 * This mirrors the logic in the administrasi/pengaturan settings page so the toggle
 * works identically everywhere.
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

  const toggle = React.useCallback(async () => {
    const isDark = current === 'dark'
    const next = isDark ? 'light' : 'dark'

    // 1. next-themes: apply .dark class + persist to localStorage "theme"
    setTheme(next)

    // 2. Custom localStorage key (read by ThemeProvider on non-auth pages)
    persistDarkMode(!isDark)

    // 3. If authenticated, persist to database so applyThemeAfterLogin picks it up
    const user = getAuthUser()
    if (user) {
      try {
        await authFetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ key: 'theme_dark_mode', value: (!isDark).toString() }),
        })
      } catch {
        /* silent — localStorage fallback still works */
      }
    }

    // 4. If switching to dark, clear any inline color overrides so .dark CSS vars take effect
    if (!isDark) {
      // Small delay to let next-themes apply the .dark class first
      setTimeout(() => clearInlineOverridesForDarkMode(), 50)
    }
  }, [current, setTheme])

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
