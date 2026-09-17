import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Transform Supabase direct connection URL to pooler URL.
 * Supabase direct connections (db.xxx.supabase.co) only resolve to IPv6,
 * which is not accessible from Vercel serverless functions.
 * The Supavisor pooler (aws-X-region.pooler.supabase.com) provides IPv4 access.
 *
 * Uses transaction mode (port 6543) with ?pgbouncer=true because:
 * - Session mode (port 5432) has a max connection limit (20 on free plan)
 * - Serverless functions can exhaust session mode connections quickly
 * - Transaction mode recycles connections efficiently
 *
 * IMPORTANT: With pgbouncer=true, Prisma disables prepared statements
 * and interactive transactions. Use regular queries and $transaction([])
 * batch syntax instead of callback-style $transaction(async () => {...})
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || ''

  // Only transform in production (Vercel) and when it's a Supabase direct connection
  if (process.env.NODE_ENV === 'production' && url.includes('db.') && url.includes('.supabase.co')) {
    try {
      // Extract project ref from hostname: db.nhmxpxafnehcthzjrhjp.supabase.co → nhmxpxafnehcthzjrhjp
      const hostMatch = url.match(/db\.([a-z]+)\.supabase\.co/)
      if (hostMatch) {
        const projectRef = hostMatch[1]
        // Extract password from URL
        const passMatch = url.match(/:\/\/[^:]+:([^@]+)@/)
        if (passMatch) {
          const password = passMatch[1]
          // Get region from SUPABASE_REGION env var or default to ap-southeast-1
          const region = process.env.SUPABASE_REGION || 'ap-southeast-1'
          // Transaction mode (port 6543) with pgbouncer flag for Prisma compatibility
          const poolerUrl = `postgresql://postgres.${projectRef}:${password}@aws-1-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
          console.log(`🔄 Transformed Supabase direct URL → pooler URL (region: ${region})`)
          return poolerUrl
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed to transform Supabase URL:', e)
    }
  }

  return url
}

function createPrismaClient() {
  // Override DATABASE_URL with pooler URL if needed
  const poolerUrl = getDatabaseUrl()
  if (poolerUrl !== process.env.DATABASE_URL) {
    process.env.DATABASE_URL = poolerUrl
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

/* ------------------------------------------------------------------ */
/* Resilient client: auto-retry transient connection errors            */
/* ------------------------------------------------------------------ */
/**
 * Setelah instance serverless idle ~30 menit, koneksi TCP yang tersimpan
 * di dalam pool Prisma bisa mati (ditutup sisi pooler/server). Query
 * PERTAMA setelah idle sering gagal (P1001/P2024/"closed the connection")
 * padahal retry berikutnya pasti sukses karena Prisma membuat koneksi baru.
 *
 * Efek sebelum fix: user membuka aplikasi → data tidak muncul → harus
 * refresh manual. Efek sesudah fix: gagal pertama di-retry otomatis
 * (maks 2x, hanya untuk error koneksi transien) → data langsung muncul.
 *
 * Aman terhadap kuota: retry hanya terjadi saat GAGAL, bukan polling.
 */

const WRITE_OPS = new Set([
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany', 'updateManyAndReturn',
  'delete', 'deleteMany', 'upsert',
  'executeRaw', 'executeRawUnsafe',
])

// Prisma error codes that mean the query never reached/ran on the database
const POOL_CODES = new Set(['P1001', 'P1008', 'P1017', 'P2024'])

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Transient error = masalah koneksi, bukan bug logic.
 * allowConnectionReset=true (read ops) → pola koneksi putus di tengah jalan
 * juga di-retry karena read aman diulang.
 * Write ops hanya di-retry jika query PASTI belum dieksekusi (mencegah
 * duplikasi data saat kegagalan ambigu seperti ECONNRESET setelah commit).
 */
function isTransientError(error: unknown, allowConnectionReset: boolean): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code && POOL_CODES.has(code)) return true

  const msg = errorMessage(error)
  if (/ECONNREFUSED|ETIMEDOUT|EPIPE/i.test(msg)) return true
  if (
    allowConnectionReset &&
    /ECONNRESET|closed the connection|connection terminated|terminating connection/i.test(msg)
  ) {
    return true
  }
  return false
}

async function withTransientRetry<T>(
  run: () => Promise<T>,
  operation: string,
  retries = 2
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const isWrite = WRITE_OPS.has(operation)
    if (!isTransientError(error, !isWrite)) throw error

    let lastError = error
    for (let attempt = 1; attempt <= retries; attempt++) {
      // Backoff pendek: 400ms, 800ms
      await new Promise((resolve) => setTimeout(resolve, attempt * 400))
      try {
        console.warn(`⟳ [db] Retrying ${operation} (attempt ${attempt}/${retries}) after transient connection error`)
        return await run()
      } catch (retryError) {
        lastError = retryError
        if (!isTransientError(retryError, !isWrite)) break
      }
    }
    throw lastError
  }
}

function createResilientClient(): PrismaClient {
  const base = createPrismaClient()
  const extended = base.$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          return withTransientRetry(() => query(args), operation)
        },
      },
    },
  })
  // Extended client punya API publik yang sama (model delegates, $transaction,
  // $queryRaw, ...) — di-cast agar seluruh kode lama tetap ter-type PrismaClient.
  return extended as unknown as PrismaClient
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = createResilientClient()
}

export const db = process.env.NODE_ENV === 'production'
  ? createResilientClient()
  : globalForPrisma.prisma!
