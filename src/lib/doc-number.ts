import { db } from '@/lib/db'

// ============================================================
// Persistent counter helpers
//
// The DocumentCounter table stores a monotonically-increasing sequence
// number per (context, prefix, user). The sequence is CONTINUOUS — it does
// NOT reset when the month or year changes ("nyambung terus"). The MM/YY
// segment of the document number still follows the document date, but the
// 4-digit sequence keeps incrementing forever. Unlike the old MAX()+1
// approach, the counter NEVER decreases when documents are deleted —
// so deleted numbers are truly never reused.
// ============================================================

/**
 * Build a unique counter key from context + prefix + user.
 * Example: "documentHistory|INV|user123"
 *
 * NOMOR KONTINU: sengaja TANPA periode (YYMM) — sequence berlanjut terus
 * walaupun bulan/tahun berubah. MM/YY pada nomor dokumen tetap mengikuti
 * tanggal pembuatan dokumen.
 */
function buildCounterKey(
  context: string,
  prefix: string,
  dataFilter: Record<string, any>
): string {
  const userId = (dataFilter.userId as string) || 'global'
  return `${context}|${prefix}|${userId}`
}

/**
 * Nilai counter LEGACY tertinggi (skema lama per-bulan:
 * "context|prefix|YYMM|user"). Dipakai saat seeding counter global baru
 * supaya nomor yang pernah dipakai (termasuk dokumen yang sudah dihapus,
 * yang hanya tercatat di counter lama) tidak pernah terbit lagi.
 */
async function legacyCounterMax(
  context: string,
  prefix: string,
  dataFilter: Record<string, any>
): Promise<number> {
  const userId = (dataFilter.userId as string) || 'global'
  try {
    const rows = await db.documentCounter.findMany({
      where: { key: { startsWith: `${context}|${prefix}|` } },
      select: { key: true, lastNum: true },
    })
    let max = 0
    for (const r of rows) {
      if (!r.key.endsWith(`|${userId}`)) continue
      if (r.lastNum > max) max = r.lastNum
    }
    return max
  } catch {
    return 0
  }
}

/**
 * Atomically get the next sequence number for the given counter key.
 *
 * - If the counter doesn't exist yet, it is initialised to the current MAX
 *   existing document number (so we don't go backwards on first migration).
 * - Then the counter is atomically incremented (Prisma `increment`) and the
 *   new value is returned.
 * - The counter persists across deletes, so deleting a document does NOT
 *   cause its number to be reused.
 */
async function nextCounterNumber(
  key: string,
  findCurrentMax: () => Promise<number>
): Promise<number> {
  // Ensure the counter row exists, seeded with the current max existing number
  const existing = await db.documentCounter.findUnique({ where: { key } })
  if (!existing) {
    const currentMax = await findCurrentMax()
    // upsert handles race condition: if another request created it first,
    // the `update: {}` branch is a no-op.
    await db.documentCounter.upsert({
      where: { key },
      create: { key, lastNum: currentMax },
      update: {},
    })
  }

  // Atomically increment and return the new value.
  // Prisma serialises `increment` operations so concurrent requests always
  // get distinct numbers.
  const updated = await db.documentCounter.update({
    where: { key },
    data: { lastNum: { increment: 1 } },
  })
  return updated.lastNum
}

/**
 * Peek at the next sequence number WITHOUT incrementing the counter.
 * Used for previewing the next number in the UI.
 * Falls back to MAX(existing) + 1 if the counter doesn't exist yet.
 */
async function peekCounterNumber(
  key: string,
  findCurrentMax: () => Promise<number>
): Promise<number> {
  const counter = await db.documentCounter.findUnique({ where: { key } })
  if (counter) {
    return counter.lastNum + 1
  }
  // No counter yet — fall back to max existing + 1
  const currentMax = await findCurrentMax()
  return currentMax + 1
}

// ============================================================
// Document number generators
// ============================================================

/**
 * Generate the next sequential document number.
 * Uses a persistent counter so that deleted numbers are never reused.
 * Includes retry logic for race condition protection (unique constraint).
 *
 * Format: {prefix}-{YYMM}-{NNNN} e.g. INV-2601-0001
 */
export async function generateDocNumber(
  model: 'invoice' | 'suratJalan' | 'purchaseOrder' | 'riwayatCetakan' | 'riwayatPotongKertas',
  numberField: 'invoiceNumber' | 'suratJalanNumber' | 'poNumber' | 'nomorUrut',
  prefix: 'INV' | 'SJ' | 'PO' | 'HC' | 'PK',
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `${prefix}-${year}${month}`
  const counterKey = buildCounterKey(model, prefix, dataFilter)

  // Nomor kontinu: cari sequence tertinggi dari SEMUA periode (prefix sama),
  // lalu bandingkan dgn counter legacy per-bulan supaya nomor lama yang sudah
  // pernah terbit (dokumennya mungkin dihapus) tidak dipakai lagi.
  const findCurrentMax = async (): Promise<number> => {
    const docs = await (db[model] as any).findMany({
      where: {
        ...dataFilter,
        [numberField]: { startsWith: `${prefix}-` },
      },
      select: { [numberField]: true },
    })
    let max = 0
    for (const d of docs) {
      const existingNumber: string = d[numberField]
      const parts = existingNumber.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax(model, prefix, dataFilter)
    return Math.max(max, legacy)
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const nextNum = await nextCounterNumber(counterKey, findCurrentMax)
    const docNumber = `${datePrefix}-${String(nextNum).padStart(4, '0')}`

    // Verify this number doesn't already exist (protect against race condition)
    const existing = await (db[model] as any).findUnique({
      where: { [numberField]: docNumber },
    })

    if (!existing) {
      return docNumber
    }

    // Number already taken (race condition) — retry
    console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
  }

  // Fallback: use timestamp-based suffix to guarantee uniqueness
  const fallbackNum = Date.now().toString().slice(-6)
  const now2 = new Date()
  const y2 = String(now2.getFullYear()).slice(-2)
  const m2 = String(now2.getMonth() + 1).padStart(2, '0')
  return `${prefix}-${y2}${m2}-${fallbackNum}`
}

/**
 * Generate the next sequential Potong Kertas number.
 * Format: PK/MM/YY/NNNN e.g. PK/06/25/0001
 * Sequence KONTINU lintas bulan/tahun (counter tanpa periode) dan tidak
 * pernah memakai ulang nomor yang sudah terbit.
 */
export async function generatePotongKertasNumber(
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `PK/${month}/${year}`
  const counterKey = buildCounterKey('riwayatPotongKertas', 'PK', dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const docs = await db.riwayatPotongKertas.findMany({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: 'PK/' },
      },
      select: { nomorUrut: true },
    })
    let max = 0
    for (const d of docs) {
      const parts = d.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax('riwayatPotongKertas', 'PK', dataFilter)
    return Math.max(max, legacy)
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const nextNum = await nextCounterNumber(counterKey, findCurrentMax)
    const docNumber = `${datePrefix}/${String(nextNum).padStart(4, '0')}`

    const existing = await db.riwayatPotongKertas.findUnique({
      where: { nomorUrut: docNumber },
    })

    if (!existing) {
      return docNumber
    }

    console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
  }

  const fallbackNum = Date.now().toString().slice(-6)
  const now2 = new Date()
  const y2 = String(now2.getFullYear()).slice(-2)
  const m2 = String(now2.getMonth() + 1).padStart(2, '0')
  return `PK/${m2}/${y2}/${fallbackNum}`
}

/**
 * Preview the next Potong Kertas number without creating it.
 * Format: PK/MM/YY/NNNN e.g. PK/06/25/0001
 */
export async function previewPotongKertasNumber(
  dataFilter: Record<string, any>
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `PK/${month}/${year}`
  const counterKey = buildCounterKey('riwayatPotongKertas', 'PK', dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const docs = await db.riwayatPotongKertas.findMany({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: 'PK/' },
      },
      select: { nomorUrut: true },
    })
    let max = 0
    for (const d of docs) {
      const parts = d.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax('riwayatPotongKertas', 'PK', dataFilter)
    return Math.max(max, legacy)
  }

  const nextNum = await peekCounterNumber(counterKey, findCurrentMax)
  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}

/**
 * Generate the next sequential Hitung Cetakan number.
 * Format: HC/MM/YY/NNNN e.g. HC/06/25/0001
 * Sequence KONTINU lintas bulan/tahun (counter tanpa periode) dan tidak
 * pernah memakai ulang nomor yang sudah terbit.
 */
export async function generateHitungCetakanNumber(
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `HC/${month}/${year}`
  const counterKey = buildCounterKey('riwayatCetakan', 'HC', dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const docs = await db.riwayatCetakan.findMany({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: 'HC/' },
      },
      select: { nomorUrut: true },
    })
    let max = 0
    for (const d of docs) {
      const parts = d.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax('riwayatCetakan', 'HC', dataFilter)
    return Math.max(max, legacy)
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const nextNum = await nextCounterNumber(counterKey, findCurrentMax)
    const docNumber = `${datePrefix}/${String(nextNum).padStart(4, '0')}`

    const existing = await db.riwayatCetakan.findUnique({
      where: { nomorUrut: docNumber },
    })

    if (!existing) {
      return docNumber
    }

    console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
  }

  const fallbackNum = Date.now().toString().slice(-6)
  const now2 = new Date()
  const y2 = String(now2.getFullYear()).slice(-2)
  const m2 = String(now2.getMonth() + 1).padStart(2, '0')
  return `HC/${m2}/${y2}/${fallbackNum}`
}

/**
 * Preview the next Hitung Cetakan number without creating it.
 * Format: HC/MM/YY/NNNN e.g. HC/06/25/0001
 */
export async function previewHitungCetakanNumber(
  dataFilter: Record<string, any>
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `HC/${month}/${year}`
  const counterKey = buildCounterKey('riwayatCetakan', 'HC', dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const docs = await db.riwayatCetakan.findMany({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: 'HC/' },
      },
      select: { nomorUrut: true },
    })
    let max = 0
    for (const d of docs) {
      const parts = d.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax('riwayatCetakan', 'HC', dataFilter)
    return Math.max(max, legacy)
  }

  const nextNum = await peekCounterNumber(counterKey, findCurrentMax)
  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}

/**
 * Generate the next sequential document number for DocumentHistory (Invoice, PO, SJ, SPK).
 * Format: {PREFIX}/MM/YY/NNNN e.g. INV/06/25/0001
 * Sequence KONTINU lintas bulan/tahun (counter tanpa periode) dan tidak
 * pernah memakai ulang nomor yang sudah terbit — even if the document with
 * the highest number is deleted, the counter keeps advancing.
 */
export async function generateDocumentHistoryNumber(
  prefix: 'INV' | 'PEL' | 'PO' | 'SJ' | 'SPK',
  docType: string,
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `${prefix}/${month}/${year}`
  const counterKey = buildCounterKey('documentHistory', prefix, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const docs = await db.documentHistory.findMany({
      where: {
        docType,
        nomor: { startsWith: `${prefix}/` },
        ...dataFilter,
      },
      select: { nomor: true },
    })
    let max = 0
    for (const d of docs) {
      const parts = d.nomor.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax('documentHistory', prefix, dataFilter)
    return Math.max(max, legacy)
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const nextNum = await nextCounterNumber(counterKey, findCurrentMax)
    const docNumber = `${datePrefix}/${String(nextNum).padStart(4, '0')}`

    // Check if this exact nomor+docType already exists (safety check)
    const existing = await db.documentHistory.findFirst({
      where: { docType, nomor: docNumber, ...dataFilter },
    })

    if (!existing) {
      return docNumber
    }

    console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
  }

  // Fallback: use timestamp-based suffix to guarantee uniqueness
  const fallbackNum = Date.now().toString().slice(-6)
  const now2 = new Date()
  const y2 = String(now2.getFullYear()).slice(-2)
  const m2 = String(now2.getMonth() + 1).padStart(2, '0')
  return `${prefix}/${m2}/${y2}/${fallbackNum}`
}

/**
 * Preview the next document number for DocumentHistory without creating it.
 * Format: {PREFIX}/MM/YY/NNNN e.g. INV/06/25/0001
 */
export async function previewDocumentHistoryNumber(
  prefix: 'INV' | 'PEL' | 'PO' | 'SJ' | 'SPK',
  docType: string,
  dataFilter: Record<string, any>
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `${prefix}/${month}/${year}`
  const counterKey = buildCounterKey('documentHistory', prefix, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const docs = await db.documentHistory.findMany({
      where: {
        docType,
        nomor: { startsWith: `${prefix}/` },
        ...dataFilter,
      },
      select: { nomor: true },
    })
    let max = 0
    for (const d of docs) {
      const parts = d.nomor.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum) && lastNum > max) max = lastNum
    }
    const legacy = await legacyCounterMax('documentHistory', prefix, dataFilter)
    return Math.max(max, legacy)
  }

  const nextNum = await peekCounterNumber(counterKey, findCurrentMax)
  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}
