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
    console.log(`✅ ${path.basename(path.dirname(schemaPath))}/${path.basename(schemaPath)} provider reverted to sqlite for local development`)
  } else {
    console.log(`⏭️ ${path.basename(path.dirname(schemaPath))}/${path.basename(schemaPath)} already set to sqlite, no revert needed`)
  }

  // Remove build-time client-engine patch (local dev uses library engine + sqlite)
  if (content.includes('queryCompiler')) {
    content = content.replace(
      'previewFeatures = ["queryCompiler", "driverAdapters"]\n  engineType      = "client"',
      'previewFeatures = ["driverAdapters"]'
    )
    console.log(`✅ generator reverted: queryCompiler + engineType "client" removed (local dev = library engine)`)
  }
  fs.writeFileSync(schemaPath, content)
}
