'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import type { BootstrapDTO, CompanyDTO, UserDTO } from '@/lib/types'

export type PageKey = 'dashboard' | 'customers' | 'products' | 'prices' | 'invoices' | 'reports'

interface AppState {
  hydrated: boolean
  bootstrap: BootstrapDTO | null
  companyId: string | null
  userId: string | null
  activePage: PageKey
  setBootstrap: (data: BootstrapDTO) => void
  setCompany: (companyId: string) => void
  setUser: (userId: string) => void
  setActivePage: (page: PageKey) => void
  ensureValidSession: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      bootstrap: null,
      companyId: null,
      userId: null,
      activePage: 'dashboard',

      setBootstrap: (data) => {
        set({ bootstrap: data, hydrated: true })
        get().ensureValidSession()
      },

      setCompany: (companyId) => {
        const { bootstrap } = get()
        const users = (bootstrap?.users ?? []).filter((u) => u.companyId === companyId)
        const nextUser = users.find((u) => u.role === 'OWNER') ?? users[0] ?? null
        set({ companyId, userId: nextUser ? nextUser.id : null })
      },

      setUser: (userId) => set({ userId }),

      setActivePage: (page) => set({ activePage: page }),

      /** Pastikan companyId & userId valid terhadap data bootstrap. */
      ensureValidSession: () => {
        const { bootstrap, companyId, userId } = get()
        if (!bootstrap) return
        const companies = bootstrap.companies
        let nextCompanyId = companyId && companies.some((c) => c.id === companyId) ? companyId : null
        if (!nextCompanyId) nextCompanyId = companies[0]?.id ?? null

        const companyUsers = bootstrap.users.filter((u) => u.companyId === nextCompanyId)
        let nextUserId = userId && companyUsers.some((u) => u.id === userId) ? userId : null
        if (!nextUserId) {
          const owner = companyUsers.find((u) => u.role === 'OWNER')
          nextUserId = (owner ?? companyUsers[0])?.id ?? null
        }
        if (nextCompanyId !== companyId || nextUserId !== userId) {
          set({ companyId: nextCompanyId, userId: nextUserId })
        }
      },
    }),
    {
      name: 'darrellsoft-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ companyId: state.companyId, userId: state.userId, activePage: state.activePage }),
    }
  )
)

// ==== Selector helpers ====

export function useCurrentCompany(): CompanyDTO | null {
  return useAppStore((s) => s.bootstrap?.companies.find((c) => c.id === s.companyId) ?? null)
}

export function useCurrentUser(): UserDTO | null {
  return useAppStore((s) => s.bootstrap?.users.find((u) => u.id === s.userId) ?? null)
}

export function useCompanyUsers(): UserDTO[] {
  return useAppStore(useShallow((s) => s.bootstrap?.users.filter((u) => u.companyId === s.companyId) ?? []))
}
