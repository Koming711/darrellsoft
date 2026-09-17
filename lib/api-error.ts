/**
 * API Error Sanitization Utility
 * 
 * Prevents Prisma "pretty-print" error details from leaking to the frontend.
 * ALL API routes should use `sanitizeError()` in catch blocks and
 * NEVER include raw error objects in JSON responses.
 */

/**
 * Known Prisma error codes with user-friendly Indonesian messages.
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2000: 'Nilai data terlalu panjang',
  P2001: 'Data tidak ditemukan',
  P2002: 'Data sudah ada (duplikat)',
  P2003: 'Data terkait tidak ditemukan',
  P2004: 'Kesalahan constraint pada database',
  P2005: 'Format nilai tidak valid',
  P2006: 'Nilai tidak valid untuk field',
  P2007: 'Kesalahan validasi data',
  P2008: 'Kesalahan query',
  P2009: 'Kesalahan query',
  P2010: 'Kesalahan query',
  P2011: 'Nilai null tidak diperbolehkan',
  P2012: 'Field wajib tidak diisi',
  P2013: 'Parameter tidak lengkap',
  P2014: 'Tidak bisa menghapus data yang masih terkait',
  P2015: 'Data terkait tidak ditemukan',
  P2016: 'Kesalahan interpretasi query',
  P2017: 'Data tidak ditemukan',
  P2018: 'Data yang diperlukan tidak ditemukan',
  P2019: 'Kesalahan input',
  P2020: 'Nilai di luar jangkauan',
  P2021: 'Tabel tidak ditemukan',
  P2022: 'Kolom tidak ditemukan',
  P2023: 'Format data tidak valid',
  P2024: 'Batas koneksi database tercapai',
  P2025: 'Data tidak ditemukan',
  P2026: 'Kesalahan koneksi database',
  P2027: 'Kesalahan database',
  P2028: 'Kesalahan transaksi',
  P2029: 'Parameter query tidak valid',
  P2030: 'Kesalahan database',
  P2031: 'Kesalahan database',
  P2032: 'Kesalahan database',
  P2033: 'Kesalahan database',
  P2034: 'Kesalahan transaksi',
  P2035: 'Kesalahan database',
  P2036: 'Kesalahan database',
  P2037: 'Kesalahan database',
  P2038: 'Kesalahan database',
  P2039: 'Kesalahan database',
  P2040: 'Kesalahan database',
  P2041: 'Kesalahan database',
  P2042: 'Kesalahan database',
  P2043: 'Kesalahan database',
  P2044: 'Kesalahan database',
  P2045: 'Kesalahan database',
  P2046: 'Kesalahan database',
  P2047: 'Kesalahan database',
  P2048: 'Kesalahan database',
  P2049: 'Kesalahan database',
  P2050: 'Kesalahan database',
  P2051: 'Data tidak ditemukan',
  P2052: 'Kesalahan database',
  P2053: 'Kesalahan database',
  P2054: 'Data tidak ditemukan',
  P2055: 'Data tidak ditemukan',
  P2056: 'Kesalahan query',
  P2057: 'Kesalahan koneksi',
  P2058: 'Kesalahan koneksi',
  P2059: 'Kesalahan koneksi',
  P2060: 'Kesalahan database',
  P2061: 'Kesalahan database',
  P2062: 'Kesalahan database',
  P2063: 'Kesalahan database',
  P2064: 'Kesalahan database',
  P2065: 'Kesalahan database',
  P2066: 'Kesalahan database',
  P2067: 'Kesalahan database',
  P2068: 'Kesalahan database',
  P2069: 'Kesalahan database',
  P2070: 'Kesalahan database',
  P2071: 'Kesalahan database',
  P2072: 'Kesalahan database',
  P2073: 'Kesalahan database',
  P2074: 'Kesalahan database',
  P2075: 'Kesalahan database',
  P2076: 'Kesalahan database',
  P2077: 'Kesalahan database',
  P2078: 'Kesalahan database',
  P2079: 'Kesalahan database',
  P2080: 'Kesalahan database',
  P2081: 'Kesalahan database',
  P2082: 'Kesalahan database',
  P2083: 'Kesalahan database',
  P2084: 'Kesalahan database',
  P2085: 'Kesalahan database',
  P2086: 'Kesalahan database',
  P2087: 'Kesalahan database',
  P2088: 'Kesalahan database',
  P2089: 'Kesalahan database',
  P2090: 'Kesalahan database',
  P2091: 'Kesalahan database',
  P2092: 'Kesalahan database',
  P2093: 'Kesalahan database',
  P2094: 'Kesalahan database',
  P2095: 'Kesalahan database',
  P2096: 'Kesalahan database',
  P2097: 'Kesalahan database',
  P2098: 'Kesalahan database',
  P2099: 'Kesalahan database',
  P3000: 'Kesalahan migrasi database',
  P3001: 'Kesalahan migrasi database',
  P3002: 'Kesalahan migrasi database',
  P3003: 'Kesalahan migrasi database',
  P3004: 'Kesalahan migrasi database',
  P3005: 'Kesalahan migrasi database',
  P3006: 'Kesalahan migrasi database',
  P3009: 'Kesalahan migrasi database',
  P3010: 'Kesalahan migrasi database',
  P3011: 'Kesalahan migrasi database',
  P3012: 'Kesalahan migrasi database',
  P3013: 'Kesalahan migrasi database',
  P3014: 'Kesalahan migrasi database',
  P3015: 'Kesalahan migrasi database',
  P3016: 'Kesalahan migrasi database',
  P3017: 'Kesalahan migrasi database',
  P3018: 'Kesalahan migrasi database',
}

/**
 * Sanitize an error for safe API response.
 * 
 * NEVER expose raw Prisma error messages, stack traces, or pretty-print content.
 * Returns a clean, user-friendly Indonesian message.
 * 
 * @param error - The caught error (can be anything)
 * @param fallbackMessage - Optional fallback message (Indonesian)
 * @returns Clean error message safe for API response
 */
export function sanitizeError(error: unknown, fallbackMessage = 'Terjadi kesalahan. Silakan coba lagi.'): string {
  if (!error) return fallbackMessage
  
  // Check for Prisma-specific error with code
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    
    // Prisma errors have a `code` property like "P2002"
    if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
      const prismaMsg = PRISMA_ERROR_MESSAGES[err.code]
      if (prismaMsg) return prismaMsg
    }
    
    // Check for Prisma client validation errors (e.g., unknown field names)
    if (err.name === 'PrismaClientValidationError') {
      return 'Data tidak valid. Periksa kembali input Anda.'
    }
    if (err.name === 'PrismaClientKnownRequestError') {
      const code = err.code as string
      if (code && PRISMA_ERROR_MESSAGES[code]) return PRISMA_ERROR_MESSAGES[code]
      return 'Kesalahan database. Silakan coba lagi.'
    }
    if (err.name === 'PrismaClientUnknownRequestError') {
      return 'Kesalahan database. Silakan coba lagi.'
    }
    if (err.name === 'PrismaClientRustPanicError') {
      return 'Kesalahan database. Silakan coba lagi.'
    }
    if (err.name === 'PrismaClientInitializationError') {
      return 'Kesalahan koneksi database. Silakan coba lagi.'
    }
  }
  
  // Handle standard Error objects - NEVER expose the message directly
  // because Prisma error messages contain pretty-print source code
  if (error instanceof Error) {
    const msg = error.message
    
    // If the message contains Prisma-specific content, hide it
    if (
      msg.includes('Prisma') ||
      msg.includes('prisma') ||
      msg.includes('pretty-print') ||
      msg.includes('Invalid `prisma.') ||
      msg.includes('did not find') ||
      msg.includes('Unknown arg') ||
      msg.includes('Argument') && msg.includes('is missing') ||
      msg.includes('Unable to fit') ||
      msg.includes('Expected') && msg.includes('found') ||
      msg.length > 200 // Prisma errors are usually very long
    ) {
      return fallbackMessage
    }
    
    // For short, clean error messages, it's safe to pass through
    if (msg.length <= 200 && !msg.includes('\n') && !msg.includes('  ')) {
      return msg
    }
  }
  
  // String errors
  if (typeof error === 'string') {
    if (error.length <= 200 && !error.includes('Prisma') && !error.includes('prisma') && !error.includes('\n')) {
      return error
    }
    return fallbackMessage
  }
  
  return fallbackMessage
}

/**
 * Safely log an error to the console without including full Prisma pretty-print.
 * Only logs the error type and a truncated message.
 */
export function safeLogError(context: string, error: unknown): void {
  if (error instanceof Error) {
    // Truncate message to prevent flooding the console with Prisma pretty-print
    const truncated = error.message.length > 300 
      ? error.message.substring(0, 300) + '...[truncated]' 
      : error.message
    console.error(`${context}: [${error.name}] ${truncated}`)
  } else {
    console.error(`${context}:`, String(error).substring(0, 300))
  }
}

/**
 * Sanitize an error message from the frontend.
 * Use this when displaying API error responses to the user.
 * Catches any Prisma content that might have leaked through.
 */
export function sanitizeFrontendMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return 'Terjadi kesalahan. Silakan coba lagi.'
  
  // If message contains technical Prisma content, replace with generic message
  if (
    msg.includes('Prisma') ||
    msg.includes('prisma') ||
    msg.includes('pretty-print') ||
    msg.includes('Invalid `prisma.') ||
    msg.includes('did not find') ||
    msg.includes('Unknown arg') ||
    msg.includes('Query interpretation error') ||
    msg.includes('Got invalid value') ||
    msg.includes('Argument') && msg.includes('is missing') ||
    msg.includes('at prisma') ||
    msg.includes('at Object') && msg.includes('.prisma') ||
    msg.includes('node_modules/@prisma') ||
    // Also catch multiline/source-code-like content
    msg.includes('\n') ||
    msg.includes('  ') && msg.length > 100 ||
    msg.length > 300
  ) {
    return 'Terjadi kesalahan. Silakan coba lagi.'
  }
  
  return msg
}

// ─── Aliases for backward compatibility with existing API routes ───
// API routes import these names, so we re-export with the expected names
export { sanitizeError as sanitizeApiError }
export { safeLogError as safeErrorLog }
export { sanitizeFrontendMessage as sanitizeErrorMessage }
