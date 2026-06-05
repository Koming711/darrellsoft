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

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = createPrismaClient()
}

export const db = process.env.NODE_ENV === 'production'
  ? createPrismaClient()
  : globalForPrisma.prisma!
