// Revert Prisma schema back to sqlite after Vercel build
// This ensures local development always uses SQLite (fast!)
const fs = require('fs')
const path = require('path')

// Revert BOTH schema files (root and prisma/) to ensure consistency
const schemaPaths = [
  path.join(__dirname, '..', 'prisma', 'schema.prisma'),
  path.join(__dirname, '..', 'schema.prisma'),
]

for (const schemaPath of schemaPaths) {
  if (!fs.existsSync(schemaPath)) continue

  let content = fs.readFileSync(schemaPath, 'utf8')

  if (content.includes('provider = "postgresql"')) {
    content = content.replace('provider = "postgresql"', 'provider = "sqlite"')
    fs.writeFileSync(schemaPath, content)
    console.log(`✅ ${path.basename(path.dirname(schemaPath))}/${path.basename(schemaPath)} provider reverted to sqlite for local development`)
  } else {
    console.log(`⏭️ ${path.basename(path.dirname(schemaPath))}/${path.basename(schemaPath)} already set to sqlite, no revert needed`)
  }
}
