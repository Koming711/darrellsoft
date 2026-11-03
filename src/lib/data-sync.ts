/**
 * Data Change Notification System
 * 
 * Syncs data changes across components (same tab) and across browser tabs.
 * 
 * Usage:
 * - After any mutation (POST/PUT/DELETE), call: notifyDataChange('papers')
 * - In pages that depend on data, use: useDataChange('papers', callback)
 * 
 * Supported entities: papers, printing-costs, finishings, customers, settings, riwayat-potong-kertas, riwayat-cetakan
 */

export type DataEntity =
  | 'items'
  | 'papers'
  | 'master-kertas'
  | 'printing-costs'
  | 'finishings'
  | 'customers'
  | 'settings'
  | 'riwayat-potong-kertas'
  | 'riwayat-cetakan'
  | 'invoice'
  | 'surat-jalan'
  | 'pengguna'
  | 'calon-pembeli'
  | 'pembeli'
  | 'biaya'
  | 'kategori'
  | 'toko-pemasok'
  | 'stock-bahan'
  | 'harga-customer'
  | 'beranda'
  | 'laporan'

// BroadcastChannel for cross-tab sync
let channel: BroadcastChannel | null = null

try {
  channel = new BroadcastChannel('darrellsoft-data-sync')
  channel.onmessage = (event) => {
    const { entity } = event.data as { entity: DataEntity }
    // Dispatch custom event in this tab when receiving from another tab
    window.dispatchEvent(new CustomEvent('data-change', { detail: { entity, source: 'remote' } }))
  }
} catch {
  // BroadcastChannel not supported (rare)
}

/**
 * Call this after any data mutation (POST/PUT/DELETE) 
 * to notify all listeners that data has changed.
 *
 * SMART CACHE: juga mengirim event 'data-change-local' di tab ini —
 * didengarkan lib/smart-fetch untuk menghapus cache entity terkait,
 * sehingga load berikutnya mengambil data segar dari server.
 * (Handler UI lama tidak mendengarkan nama event ini → tidak ada
 * perubahan perilaku halaman.)
 */
export function notifyDataChange(entity: DataEntity) {
  // Invalidasi cache lokal tab ini (smart-fetch)
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('data-change-local', { detail: { entity, source: 'local' } }))
    }
  } catch {
    // Ignore
  }
  // Broadcast to other tabs - same-tab updates are handled by optimistic state
  try {
    channel?.postMessage({ entity })
  } catch {
    // Ignore broadcast errors
  }
}

/**
 * Subscribe to data changes for specific entities.
 * Responds to events from OTHER browser tabs via BroadcastChannel.
 * Each page handles its own same-tab updates via optimistic state updates.
 * Returns an unsubscribe function.
 */
export function onDataChange(entities: DataEntity[], callback: (entity: DataEntity) => void): () => void {
  const handler = (event: Event) => {
    const { entity } = (event as CustomEvent).detail
    if (entities.includes(entity)) {
      callback(entity)
    }
  }
  
  window.addEventListener('data-change', handler)
  return () => window.removeEventListener('data-change', handler)
}
