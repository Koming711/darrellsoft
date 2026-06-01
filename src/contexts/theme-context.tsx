'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { getAuthUser } from '@/lib/auth'

const DARK_MODE_LS_KEY = 'darrellsoft_dark_mode'

function isLightColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

function applyColor(key: string, color: string) {
  const el = document.documentElement
  el.style.setProperty(key, color)
}

function removeColor(key: string) {
  const el = document.documentElement
  el.style.removeProperty(key)
}

function applySidebarTheme(color: string) {
  const isLight = isLightColor(color)
  applyColor('--app-sidebar-bg', color)
  applyColor('--app-sidebar-border', isLight ? '#e2e8f0' : 'rgba(255,255,255,0.12)')
  applyColor('--app-sidebar-text', isLight ? '#1e293b' : '#f1f5f9')
  applyColor('--app-sidebar-text-muted', isLight ? '#64748b' : '#94a3b8')
  applyColor('--app-sidebar-active-bg', isLight ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.15)')
  applyColor('--app-sidebar-active-text', isLight ? '#2563eb' : '#93c5fd')
}

function applyFontSize(size: string) {
  const map: Record<string, string> = {
    small: '14px',
    medium: '16px',
    large: '18px',
    'extra-large': '20px',
  }
  const fontSize = map[size] || '16px'
  applyColor('--app-font-size', fontSize)
  applyColor('--app-font-size-sm', `${parseInt(fontSize) - 2}px`)
  applyColor('--app-font-size-lg', `${parseInt(fontSize) + 2}px`)
  applyColor('--app-font-size-xs', `${parseInt(fontSize) - 4}px`)
}

const THEME_KEYS = ['theme_sidebar_color', 'theme_bg_color', 'theme_banner_color', 'app_font_size', 'theme_dark_mode'] as const

// Variables that should be cleared in dark mode so .dark CSS takes effect
const DARK_MODE_CLEARED_VARS = [
  '--app-sidebar-bg',
  '--app-sidebar-border',
  '--app-sidebar-text',
  '--app-sidebar-text-muted',
  '--app-sidebar-active-bg',
  '--app-sidebar-active-text',
  '--app-content-bg',
  '--app-banner-bg',
  '--app-banner-text',
  '--app-banner-text-muted',
]

function applyBannerTheme(color: string) {
  const isLight = isLightColor(color)
  applyColor('--app-banner-bg', color)
  applyColor('--app-banner-text', isLight ? '#1e293b' : '#f1f5f9')
  applyColor('--app-banner-text-muted', isLight ? '#64748b' : '#94a3b8')
}

function applySettingsFromMap(map: Record<string, string>, isDark: boolean) {
  if (map.theme_sidebar_color) applySidebarTheme(map.theme_sidebar_color)
  if (map.theme_bg_color) applyColor('--app-content-bg', map.theme_bg_color)
  if (map.theme_banner_color) applyBannerTheme(map.theme_banner_color)
  if (map.app_font_size) applyFontSize(map.app_font_size)
}

// In dark mode, remove inline style overrides so .dark CSS variables take precedence
export function clearInlineOverridesForDarkMode() {
  for (const varName of DARK_MODE_CLEARED_VARS) {
    removeColor(varName)
  }
  removeColor('--background')
  removeColor('--popover')
  removeColor('--card')
}

export async function applyThemeAfterLogin() {
  try {
    const res = await fetch('/api/settings')
    if (!res.ok) return
    const data: Array<{ key: string; value: string }> = await res.json()
    const map: Record<string, string> = {}
    for (const item of data) {
      if ((THEME_KEYS as readonly string[]).includes(item.key) && item.value) {
        map[item.key] = item.value
      }
    }
    const isDark = map.theme_dark_mode === 'true' || document.documentElement.classList.contains('dark')
    applySettingsFromMap(map, isDark)
  } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const applied = useRef(false)
  const { setTheme, theme } = useTheme()

  useEffect(() => {
    if (applied.current) return
    applied.current = true

    const authUser = getAuthUser()

    // For non-authenticated pages, still apply dark mode from localStorage
    if (!authUser) {
      const savedDark = localStorage.getItem(DARK_MODE_LS_KEY)
      if (savedDark === 'true') {
        setTheme('dark')
      } else if (savedDark === 'false') {
        setTheme('light')
      }
      return
    }

    const headers = { Cookie: `userId=${authUser.userId}; userRole=${authUser.role}` }

    fetch('/api/settings', { headers })
      .then(r => r.ok ? r.json() : null)
      .then((data: Array<{ key: string; value: string }> | null) => {
        if (!data) return
        const map: Record<string, string> = {}
        for (const item of data) {
          if ((THEME_KEYS as readonly string[]).includes(item.key) && item.value) {
            map[item.key] = item.value
          }
        }
        // Apply dark mode from saved settings
        const isDark = map.theme_dark_mode === 'true'
        // Persist dark mode preference to localStorage for non-auth pages
        localStorage.setItem(DARK_MODE_LS_KEY, isDark ? 'true' : 'false')
        if (isDark) {
          setTheme('dark')
          // Give next-themes a tick to apply the .dark class
          setTimeout(() => {
            clearInlineOverridesForDarkMode()
          }, 50)
        } else {
          setTheme('light')
        }
        applySettingsFromMap(map, isDark)
      })
      .catch(() => {})
  }, [setTheme])

  return <>{children}</>
}

/** Call this when toggling dark mode from settings page */
export function persistDarkMode(isDark: boolean) {
  localStorage.setItem(DARK_MODE_LS_KEY, isDark ? 'true' : 'false')
}
