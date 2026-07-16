import { db } from '@/lib/db'

// ============================================================
// Persistent counter helpers
//
// The DocumentCounter table stores a monotonically-increasing sequence
// number per (context, prefix, period, user). Unlike the old MAX()+1
// approach, the counter NEVER decreases when documents are deleted —
// so deleted numbers are truly never reused.
// ============================================================

/**
 * Build a unique counter key from context + prefix + period + user.
 * Example: "documentHistory|INV|2607|user123"
 */
function buildCounterKey(
  context: string,
  prefix: string,
  year: string,
  month: string,
  dataFilter: Record<string, any>
): string {
  const userId = (dataFilter.userId as string) || 'global'
  return `${context}|${prefix}|${year}${month}|${userId}`
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
  const counterKey = buildCounterKey(model, prefix, year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await (db[model] as any).findFirst({
      where: {
        ...dataFilter,
        [numberField]: { startsWith: datePrefix },
      },
      orderBy: { [numberField]: 'desc' },
    })
    if (lastDoc) {
      const existingNumber: string = lastDoc[numberField]
      const parts = existingNumber.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
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
 * Uses a persistent counter so that deleted numbers are never reused.
 */
export async function generatePotongKertasNumber(
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `PK/${month}/${year}`
  const counterKey = buildCounterKey('riwayatPotongKertas', 'PK', year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await db.riwayatPotongKertas.findFirst({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: datePrefix },
      },
      orderBy: { nomorUrut: 'desc' },
    })
    if (lastDoc) {
      const parts = lastDoc.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
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
  const counterKey = buildCounterKey('riwayatPotongKertas', 'PK', year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await db.riwayatPotongKertas.findFirst({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: datePrefix },
      },
      orderBy: { nomorUrut: 'desc' },
    })
    if (lastDoc) {
      const parts = lastDoc.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
  }

  const nextNum = await peekCounterNumber(counterKey, findCurrentMax)
  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}

/**
 * Generate the next sequential Hitung Cetakan number.
 * Format: HC/MM/YY/NNNN e.g. HC/06/25/0001
 * Uses a persistent counter so that deleted numbers are never reused.
 */
export async function generateHitungCetakanNumber(
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `HC/${month}/${year}`
  const counterKey = buildCounterKey('riwayatCetakan', 'HC', year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await db.riwayatCetakan.findFirst({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: datePrefix },
      },
      orderBy: { nomorUrut: 'desc' },
    })
    if (lastDoc) {
      const parts = lastDoc.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
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
  const counterKey = buildCounterKey('riwayatCetakan', 'HC', year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await db.riwayatCetakan.findFirst({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: datePrefix },
      },
      orderBy: { nomorUrut: 'desc' },
    })
    if (lastDoc) {
      const parts = lastDoc.nomorUrut.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
  }

  const nextNum = await peekCounterNumber(counterKey, findCurrentMax)
  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}

/**
 * Generate the next sequential document number for DocumentHistory (Invoice, PO, SJ, SPK).
 * Format: {PREFIX}/MM/YY/NNNN e.g. INV/06/25/0001
 * Uses a persistent counter so that deleted numbers are NEVER reused —
 * even if the document with the highest number is deleted, the counter
 * keeps advancing.
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
  const counterKey = buildCounterKey('documentHistory', prefix, year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await db.documentHistory.findFirst({
      where: {
        docType,
        nomor: { startsWith: datePrefix },
        ...dataFilter,
      },
      orderBy: { nomor: 'desc' },
    })
    if (lastDoc) {
      const parts = lastDoc.nomor.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
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
  const counterKey = buildCounterKey('documentHistory', prefix, year, month, dataFilter)

  const findCurrentMax = async (): Promise<number> => {
    const lastDoc = await db.documentHistory.findFirst({
      where: {
        docType,
        nomor: { startsWith: datePrefix },
        ...dataFilter,
      },
      orderBy: { nomor: 'desc' },
    })
    if (lastDoc) {
      const parts = lastDoc.nomor.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) return lastNum
    }
    return 0
  }

  const nextNum = await peekCounterNumber(counterKey, findCurrentMax)
  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}
