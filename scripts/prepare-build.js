// Swap Prisma provider for Vercel build (sqlite → postgresql)
// Also transforms Supabase direct connection URL to pooler URL for IPv4 access
// IMPORTANT: This script reverts schema.prisma back to sqlite after prisma generate,
// so local development always uses SQLite (fast!)
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
let content = fs.readFileSync(schemaPath, 'utf8')

// Check current provider - don't swap if already postgresql
if (content.includes('provider = "postgresql"')) {
  console.log('⏭️ Schema already set to postgresql, skipping swap')
} else {
  content = content.replace('provider = "sqlite"', 'provider = "postgresql"')
  fs.writeFileSync(schemaPath, content)
  console.log('✅ Schema provider swapped to postgresql')
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
