import { create } from 'zustand'
import { useEffect, useRef } from 'react'

interface CompanyBrandingState {
  companyName: string | null
  companyLogo: string | null
  initialized: boolean
  // Actions
  fetchBranding: (isPublic?: boolean) => Promise<void>
  updateBranding: (data: { companyName?: string | null; companyLogo?: string | null }) => void
  resetBranding: () => void
}

const BROADCAST_CHANNEL_NAME = 'company-branding-update'

let broadcastChannel: BroadcastChannel | null = null
try {
  if (typeof window !== 'undefined') {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  }
} catch {
  // BroadcastChannel not supported
}

export const useCompanyStore = create<CompanyBrandingState>((set, get) => ({
  companyName: null,
  companyLogo: null,
  initialized: false,

  fetchBranding: async (isPublic = false) => {
    try {
      if (isPublic) {
        const res = await fetch('/api/public-settings')
        if (res.ok) {
          const data = await res.json()
          set({
            companyName: data.company_name?.trim() || null,
            companyLogo: data.company_logo?.trim() || null,
            initialized: true,
          })
        }
      } else {
        const [nameRes, logoRes] = await Promise.all([
          fetch('/api/settings?key=company_name'),
          fetch('/api/settings?key=company_logo'),
        ])
        const nameData = nameRes.ok ? await nameRes.json() : null
        const logoData = logoRes.ok ? await logoRes.json() : null
        set({
          companyName: nameData?.value?.trim() || null,
          companyLogo: logoData?.value?.trim() || null,
          initialized: true,
        })
      }
    } catch {
      // Silent fail - keep existing values
    }
  },

  updateBranding: (data) => {
    const state = get()
    const newCompanyName = data.companyName !== undefined ? data.companyName : state.companyName
    const newCompanyLogo = data.companyLogo !== undefined ? data.companyLogo : state.companyLogo
    set({
      companyName: newCompanyName,
      companyLogo: newCompanyLogo,
      initialized: true,
    })
    // Broadcast to other tabs
    try {
      broadcastChannel?.postMessage({
        companyName: newCompanyName,
        companyLogo: newCompanyLogo,
      })
    } catch {
      // Silent fail
    }
  },

  resetBranding: () => {
    set({ companyName: null, companyLogo: null, initialized: true })
    try {
      broadcastChannel?.postMessage({ companyName: null, companyLogo: null })
    } catch {
      // Silent fail
    }
  },
}))

// Subscribe to BroadcastChannel for cross-tab sync (client-side only)
if (typeof window !== 'undefined' && broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    const { companyName, companyLogo } = event.data
    useCompanyStore.setState({
      companyName,
      companyLogo,
      initialized: true,
    })
  }
}

// Global flag to prevent duplicate fetches across components
let fetchInitiated = false

/**
 * Hook to auto-fetch company branding once on first mount.
 * Uses Zustand store so all components share the same state.
 */
export function useCompanyBranding(isPublic = false) {
  const companyName = useCompanyStore((s) => s.companyName)
  const companyLogo = useCompanyStore((s) => s.companyLogo)
  const initialized = useCompanyStore((s) => s.initialized)
  const fetchBranding = useCompanyStore((s) => s.fetchBranding)
  const isPublicRef = useRef(isPublic)

  useEffect(() => {
    isPublicRef.current = isPublic
  }, [isPublic])

  useEffect(() => {
    if (!fetchInitiated) {
      fetchInitiated = true
      fetchBranding(isPublicRef.current)
    }
  }, [fetchBranding])

  return {
    companyName,
    companyLogo,
    initialized,
    refetch: () => fetchBranding(isPublicRef.current),
  }
}
