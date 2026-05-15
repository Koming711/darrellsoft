'use client'

import { useEffect, useRef } from 'react'
import { onDataChange, type DataEntity } from '@/lib/data-sync'

/**
 * Hook that listens for data changes and calls a callback when data changes.
 * 
 * Uses a 2-second delay by default to avoid Supabase connection pooler 
 * stale data issues — when a write is committed on one pooled connection,
 * a different connection used by the refetch may not see it immediately.
 * The delay gives PgBouncer time to propagate the write.
 * 
 * Usage:
 * ```tsx
 * useDataChange(['papers', 'customers'], (entity) => {
 *   if (entity === 'papers') fetchPapers()
 *   if (entity === 'customers') fetchCustomers()
 * })
 * ```
 * 
 * Automatically subscribes on mount and unsubscribes on unmount.
 * Works across browser tabs via BroadcastChannel.
 */
export function useDataChange(
  entities: DataEntity[],
  callback: (entity: DataEntity) => void,
  delayMs: number = 2000
) {
  const callbackRef = useRef(callback)
  const entitiesRef = useRef(entities)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Always keep refs up to date
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    entitiesRef.current = entities
  }, [entities])

  useEffect(() => {
    // Use a stable copy of entities for subscription
    const currentEntities = entitiesRef.current
    const handler = (entity: DataEntity) => {
      // Clear any pending delayed refetch to avoid double-firing
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      // Delay the callback to avoid Supabase pooler stale data
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(entity)
      }, delayMs)
    }

    const unsubscribe = onDataChange(currentEntities, handler)
    return () => {
      unsubscribe()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // Only run on mount/unmount - entities and callback are handled via refs
  }, [])
}
