import { db } from '@/lib/db'

/**
 * Generate the next sequential document number.
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
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

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Find the document with the highest number for this prefix
    const lastDoc = await (db[model] as any).findFirst({
      where: {
        ...dataFilter,
        [numberField]: { startsWith: datePrefix },
      },
      orderBy: { [numberField]: 'desc' },
    })

    let nextNum = 1
    if (lastDoc) {
      const existingNumber: string = lastDoc[numberField]
      const parts = existingNumber.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

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
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
 */
export async function generatePotongKertasNumber(
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `PK/${month}/${year}`

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastDoc = await db.riwayatPotongKertas.findFirst({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: datePrefix },
      },
      orderBy: { nomorUrut: 'desc' },
    })

    let nextNum = 1
    if (lastDoc) {
      const existingNumber: string = lastDoc.nomorUrut
      const parts = existingNumber.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

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

  const lastDoc = await db.riwayatPotongKertas.findFirst({
    where: {
      ...dataFilter,
      nomorUrut: { startsWith: datePrefix },
    },
    orderBy: { nomorUrut: 'desc' },
  })

  let nextNum = 1
  if (lastDoc) {
    const existingNumber: string = lastDoc.nomorUrut
    const parts = existingNumber.split('/')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1
    }
  }

  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}

/**
 * Generate the next sequential Hitung Cetakan number.
 * Format: HC/MM/YY/NNNN e.g. HC/06/25/0001
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
 */
export async function generateHitungCetakanNumber(
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `HC/${month}/${year}`

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastDoc = await db.riwayatCetakan.findFirst({
      where: {
        ...dataFilter,
        nomorUrut: { startsWith: datePrefix },
      },
      orderBy: { nomorUrut: 'desc' },
    })

    let nextNum = 1
    if (lastDoc) {
      const existingNumber: string = lastDoc.nomorUrut
      const parts = existingNumber.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

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

  const lastDoc = await db.riwayatCetakan.findFirst({
    where: {
      ...dataFilter,
      nomorUrut: { startsWith: datePrefix },
    },
    orderBy: { nomorUrut: 'desc' },
  })

  let nextNum = 1
  if (lastDoc) {
    const existingNumber: string = lastDoc.nomorUrut
    const parts = existingNumber.split('/')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1
    }
  }

  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}

/**
 * Generate the next sequential document number for DocumentHistory (Invoice, PO, SJ, SPK).
 * Format: {PREFIX}/MM/YY/NNNN e.g. INV/06/25/0001
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
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

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastDoc = await db.documentHistory.findFirst({
      where: {
        docType,
        nomor: { startsWith: datePrefix },
        ...dataFilter,
      },
      orderBy: { nomor: 'desc' },
    })

    let nextNum = 1
    if (lastDoc) {
      const existingNumber: string = lastDoc.nomor
      const parts = existingNumber.split('/')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    const docNumber = `${datePrefix}/${String(nextNum).padStart(4, '0')}`

    // Check if this exact nomor+docType already exists
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

  const lastDoc = await db.documentHistory.findFirst({
    where: {
      docType,
      nomor: { startsWith: datePrefix },
      ...dataFilter,
    },
    orderBy: { nomor: 'desc' },
  })

  let nextNum = 1
  if (lastDoc) {
    const existingNumber: string = lastDoc.nomor
    const parts = existingNumber.split('/')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1
    }
  }

  return `${datePrefix}/${String(nextNum).padStart(4, '0')}`
}
