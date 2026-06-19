'use client'

import { create } from 'zustand'
import { useEffect } from 'react'

const STORAGE_KEY = 'dokupro-sidebar-collapsed'

/**
 * Sidebar collapse store (Zustand).
 *
 * Shared state so the `<Sidebar>` and the `<DashboardLayout>` content margin
 * always stay in sync. Persisted to localStorage.
 *
 * - collapsed = true  → narrow icon-only sidebar (w-16)
 * - collapsed = false → wide sidebar with labels (w-64)
 *
 * SSR-safe: defaults to `false` (expanded) on the server. The first client
 * mount hydrates from localStorage.
 */
interface SidebarCollapseState {
  collapsed: boolean
  hydrated: boolean
  toggle: () => void
  setCollapsed: (value: boolean) => void
  hydrate: () => void
}

export const useSidebarCollapseStore = create<SidebarCollapseState>((set, get) => ({
  collapsed: false,
  hydrated: false,
  toggle: () => {
    const next = !get().collapsed
    set({ collapsed: next })
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
    }
  },
  setCollapsed: (value) => {
    set({ collapsed: value })
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, String(value))
      } catch {
        // ignore
      }
    }
  },
  hydrate: () => {
    if (get().hydrated) return
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        set({ collapsed: stored === 'true', hydrated: true })
        return
      }
    } catch {
      // ignore
    }
    set({ hydrated: true })
  },
}))

/**
 * React hook that hydrates the store on mount and returns the collapse state.
 * Use this in any component that needs to read or toggle the sidebar collapse.
 */
export function useSidebarCollapse() {
  const { collapsed, toggle, hydrated, hydrate } = useSidebarCollapseStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return { collapsed, toggle, hydrated }
}
