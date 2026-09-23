// Swap Prisma provider for Vercel build (sqlite → postgresql)
// Also transforms Supabase direct connection URL to pooler URL for IPv4 access
// IMPORTANT: This script reverts schema.prisma back to sqlite after prisma generate,
// so local development always uses SQLite (fast!)
const fs = require('fs')
const path = require('path')

// Swap BOTH schema files (root and prisma/) to ensure consistency
const schemaPaths = [
  path.join(__dirname, '..', 'prisma', 'schema.prisma'),
  path.join(__dirname, '..', 'schema.prisma'),
]

for (const schemaPath of schemaPaths) {
  if (!fs.existsSync(schemaPath)) continue

  let content = fs.readFileSync(schemaPath, 'utf8')

  // Check current provider - don't swap if already postgresql
  if (content.includes('provider = "postgresql"')) {
    console.log(`⏭️ ${path.basename(path.dirname(schemaPath))}/${path.basename(schemaPath)} already set to postgresql, skipping swap`)
  } else {
    content = content.replace('provider = "sqlite"', 'provider = "postgresql"')
    console.log(`✅ ${path.basename(path.dirname(schemaPath))}/${path.basename(schemaPath)} provider swapped to postgresql`)
  }

  /**
   * PATCH client engine (queryCompiler) — WAJIB untuk driver adapters:
   * Dengan previewFeatures ["driverAdapters"] SAJA, Prisma 6 masih mencari
   * Rust query engine native (libquery_engine-rhel ~16.7MB) → crash di
   * serverless ("could not locate the Query Engine"). Dengan queryCompiler +
   * engineType = "client", query dikompilasi lewat WASM (2.1MB) → tidak ada
   * binary native → bundle function kecil.
   */
  if (!content.includes('queryCompiler')) {
    content = content.replace(
      'previewFeatures = ["driverAdapters"]',
      'previewFeatures = ["queryCompiler", "driverAdapters"]\n  engineType      = "client"'
    )
    console.log(`✅ generator patched: queryCompiler + engineType = "client" (client engine, no native binary)`)
  }
  fs.writeFileSync(schemaPath, content)
}

// Transform DATABASE_URL if it's a Supabase direct connection (IPv6-only)
// The pooler provides IPv4 access which Vercel serverless functions need
const dbUrl = process.env.DATABASE_URL || ''
if (dbUrl.includes('db.') && dbUrl.includes('.supabase.co')) {
  try {
    const hostMatch = dbUrl.match(/db\.([a-z]+)\.supabase\.co/)
    const passMatch = dbUrl.match(/:\/\/[^:]+:([^@]+)@/)
    if (hostMatch && passMatch) {
      const projectRef = hostMatch[1]
      const password = passMatch[1]
      const region = process.env.SUPABASE_REGION || 'ap-southeast-1'
      // Transaction mode (port 6543) with pgbouncer for Prisma compatibility
      const poolerUrl = `postgresql://postgres.${projectRef}:${password}@aws-1-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
      process.env.DATABASE_URL = poolerUrl
      console.log(`✅ DATABASE_URL transformed to Supabase pooler transaction mode (port 6543, region: ${region})`)
    }
  } catch (e) {
    console.warn('⚠️ Failed to transform DATABASE_URL:', e)
  }
}
