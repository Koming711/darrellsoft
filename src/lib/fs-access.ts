/**
 * File System Access API helpers (CLIENT-side only).
 *
 * Kejujuran platform (prompt bagian 10):
 * - Aplikasi Darrellsoft berjalan di BROWSER — JavaScript biasa TIDAK bisa
 *   mengakses seluruh folder komputer user.
 * - Satu-satunya cara resmi menulis ke folder nyata (mis. D:/Darrellsoft/Backup)
 *   adalah File System Access API (Chrome/Edge desktop), dan hanya dengan
 *   izin eksplisit user per folder yang dipilihnya.
 * - Bila API tidak tersedia (Firefox/Safari/mobile), fallback = unduhan biasa
 *   → file backup tersimpan di folder Downloads pilihan browser.
 *
 * Handle folder disimpan di IndexedDB supaya konfigurasi bertahan antar
 * kunjungan (permission tetap perlu di-grant ulang bila browser memintanya).
 */

// ---------- Tipe minimal (hindari ketergantungan lib.dom versi tertentu) ----------
export interface DirHandle {
  name: string
  kind: 'directory'
  queryPermission?(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>
  removeEntry?(name: string, opts?: { recursive?: boolean }): Promise<void>
  values?(opts?: { recursive?: boolean }): AsyncIterableIterator<DirHandle | FileHandleLike>
}

export interface FileHandleLike {
  name: string
  kind: 'file'
  getFile(): Promise<File>
  createWritable?(opts?: { keepExistingData?: boolean }): Promise<{
    write(data: Blob | BufferSource | BlobPart): Promise<void>
    close(): Promise<void>
  }>
}

// ---------- IndexedDB penyimpanan handle ----------
const IDB_NAME = 'darrellsoft-fs'
const IDB_STORE = 'handles'
const HANDLE_KEY = 'backup-folder'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => { idb.close(); resolve() }
    tx.onerror = () => { idb.close(); reject(tx.error) }
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => { idb.close(); resolve((req.result as T) ?? null) }
    req.onerror = () => { idb.close(); reject(req.error) }
  })
}

async function idbDel(key: string): Promise<void> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete = () => { idb.close(); resolve() }
    tx.onerror = () => { idb.close(); reject(tx.error) }
  })
}

// ---------- Deteksi & pemilihan folder ----------
/** Apakah browser mendukung File System Access API (showDirectoryPicker). */
export function isFsAccessSupported(): boolean {
  try {
    return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  } catch {
    return false
  }
}

/**
 * Buka dialog pemilihan folder sistem (harus dipanggil dari klik user).
 * Mode readwrite supaya backup bisa ditulis; user melihat izin yang diminta.
 */
export async function pickBackupFolder(): Promise<{ name: string } | null> {
  if (!isFsAccessSupported()) return null
  const picker = (window as unknown as { showDirectoryPicker: (opts?: Record<string, unknown>) => Promise<DirHandle> }).showDirectoryPicker
  const handle = await picker({ id: 'darrellsoft-backup', mode: 'readwrite' })
  await idbSet(HANDLE_KEY, handle)
  return { name: handle.name }
}

export interface StoredFolderInfo {
  handle: DirHandle | null
  name: string | null
  permission: 'granted' | 'prompt' | 'denied' | 'unsupported'
}

/** Ambil handle tersimpan + status permission TANPA meminta izin (tanpa gesture). */
export async function getStoredBackupFolder(): Promise<StoredFolderInfo> {
  if (!isFsAccessSupported()) return { handle: null, name: null, permission: 'unsupported' }
  try {
    const handle = await idbGet<DirHandle>(HANDLE_KEY)
    if (!handle) return { handle: null, name: null, permission: 'prompt' }
    let permission: PermissionState = 'granted'
    try {
      permission = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
    } catch { permission = 'granted' }
    return { handle, name: handle.name, permission: permission === 'granted' ? 'granted' : (permission === 'denied' ? 'denied' : 'prompt') }
  } catch {
    return { handle: null, name: null, permission: 'prompt' }
  }
}

/** Minta izin readwrite untuk handle tersimpan — WAJIB dipanggil dari klik user. */
export async function ensureFolderPermission(handle: DirHandle): Promise<'granted' | 'denied'> {
  try {
    const p = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
    if (p === 'granted') return 'granted'
    if (handle.requestPermission) {
      const r = await handle.requestPermission({ mode: 'readwrite' })
      return r === 'granted' ? 'granted' : 'denied'
    }
    return 'denied'
  } catch {
    return 'denied'
  }
}

/** Hapus konfigurasi folder tersimpan (lupakan akses). */
export async function forgetBackupFolder(): Promise<void> {
  try { await idbDel(HANDLE_KEY) } catch { /* abaikan */ }
}

// ---------- Operasi file ----------
/** Tulis file ke folder terpilih. Return nama file yang ditulis. */
export async function writeFileToBackupFolder(handle: DirHandle, fileName: string, data: Blob | ArrayBuffer): Promise<string> {
  const fileHandle = await handle.getFileHandle(fileName, { create: true })
  if (!fileHandle.createWritable) throw new Error('createWritable tidak tersedia')
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
  return fileName
}

/** Uji lokasi: tulis file kecil lalu hapus. Return null = OK, atau pesan error. */
export async function testBackupFolder(handle: DirHandle): Promise<string | null> {
  const probe = `darrellsoft-test-${Date.now()}.txt`
  try {
    await writeFileToBackupFolder(handle, probe, new Blob(['darrellsoft storage test'], { type: 'text/plain' }))
    try { await handle.removeEntry?.(probe) } catch { /* hapus best-effort */ }
    return null
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : 'Gagal menulis ke folder'
  }
}

/** Struktur folder otomatis di dalam folder utama terpilih. Return daftar nama yang dibuat. */
export const STORAGE_SUBFOLDERS = ['Database', 'Backup', 'Backup Harian', 'Backup Mingguan', 'Backup Bulanan', 'Restore', 'Export', 'Arsip'] as const

export async function ensureFolderStructure(handle: DirHandle): Promise<string[]> {
  const created: string[] = []
  for (const name of STORAGE_SUBFOLDERS) {
    try {
      await handle.getDirectoryHandle(name, { create: true })
      created.push(name)
    } catch { /* lanjut folder berikutnya */ }
  }
  return created
}

export interface BrowserFileEntry { name: string; size: number; modified: number }

/** Daftar file backup (.xlsx/.json) di folder terpilih (non-rekursif), terbaru dulu. */
export async function listBackupFolderFiles(handle: DirHandle): Promise<BrowserFileEntry[]> {
  const out: BrowserFileEntry[] = []
  if (!handle.values) return out
  try {
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue
      if (!/\.(xlsx|json)$/i.test(entry.name)) continue
      try {
        const f = await (entry as FileHandleLike).getFile()
        out.push({ name: entry.name, size: f.size, modified: f.lastModified })
      } catch { /* lewati */ }
    }
  } catch { /* folder tidak bisa dibaca */ }
  return out.sort((a, b) => b.modified - a.modified)
}

/**
 * Pilih file backup lewat dialog sistem (opsional mulai dari folder terpilih).
 * Fallback: return null → pemanggil memakai <input type="file"> biasa.
 */
export async function openBackupFile(startIn?: DirHandle): Promise<File | null> {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { showOpenFilePicker?: (opts?: Record<string, unknown>) => Promise<Array<{ getFile(): Promise<File> }>> }
  if (typeof w.showOpenFilePicker !== 'function') return null
  const opts: Record<string, unknown> = {
    types: [{
      description: 'Backup Darrellsoft',
      accept: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/json': ['.json'],
      },
    }],
    multiple: false,
  }
  if (startIn) opts.startIn = startIn
  const [handle] = await w.showOpenFilePicker(opts)
  if (!handle) return null
  return handle.getFile()
}

/** Nama file backup otomatis: darrellsoft_backup_2026-11-08_150000.xlsx (waktu lokal). */
export function makeBackupFileName(ext = 'xlsx'): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `darrellsoft_backup_${stamp}.${ext}`
}
