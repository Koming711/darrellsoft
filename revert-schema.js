// Revert Prisma schema back to sqlite after Vercel build
// This ensures local development always uses SQLite (fast!)
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
let content = fs.readFileSync(schemaPath, 'utf8')

if (content.includes('provider = "postgresql"')) {
  content = content.replace('provider = "postgresql"', 'provider = "sqlite"')
  fs.writeFileSync(schemaPath, content)
  console.log('✅ Schema provider reverted to sqlite for local development')
} else {
  console.log('⏭️ Schema already set to sqlite, no revert needed')
}
