// Swap Prisma provider for Vercel build (sqlite → postgresql)
// Also transforms Supabase direct connection URL to pooler URL for IPv4 access
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
let content = fs.readFileSync(schemaPath, 'utf8')

// Force swap to postgresql regardless of current state
if (content.includes('provider = "sqlite"')) {
  content = content.replace('provider = "sqlite"', 'provider = "postgresql"')
  fs.writeFileSync(schemaPath, content)
  console.log('✅ Schema provider swapped to postgresql')
} else if (content.includes('provider = "postgresql"')) {
  console.log('⏭️ Schema already set to postgresql, no swap needed')
} else {
  console.warn('⚠️ Could not detect provider in schema.prisma')
  console.log('Current content around provider:')
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    if (line.includes('provider') || line.includes('datasource')) {
      console.log(`  Line ${i + 1}: ${line}`)
    }
  })
}

// Verify the swap worked
const verifyContent = fs.readFileSync(schemaPath, 'utf8')
if (verifyContent.includes('provider = "postgresql"')) {
  console.log('✅ Verified: schema.prisma now uses postgresql')
} else {
  console.error('❌ ERROR: schema.prisma still does not have postgresql provider!')
  console.error('This will cause Prisma client to be generated with wrong provider')
}

// Transform DATABASE_URL if it's a Supabase direct connection (IPv6-only)
// The pooler provides IPv4 access which Vercel serverless functions need
const dbUrl = process.env.DATABASE_URL || ''
console.log(`📋 DATABASE_URL starts with: ${dbUrl.substring(0, 30)}...`)
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
} else {
  console.log('📋 DATABASE_URL is not a Supabase direct connection, no transformation needed')
}
