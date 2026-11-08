/**
 * READ-ONLY inspection of production RiwayatPotongKertas numbering state.
 * Usage: node scripts/inspect-pk-prod.js  (reads DATABASE_URL from .env.prod-inspect)
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')

function loadDatabaseUrl() {
  const envFile = path.join(__dirname, '..', '.env.prod-inspect')
  const content = fs.readFileSync(envFile, 'utf8')
  const m = content.match(/^DATABASE_URL="([^"]+)"/m)
  if (!m) throw new Error('DATABASE_URL not found in .env.prod-inspect')
  return m[1]
}

const POOLER_REGIONS = [
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'us-east-1', 'us-west-1', 'eu-central-1', 'eu-west-2',
]

async function makeClient() {
  const url = new URL(loadDatabaseUrl())
  const base = {
    port: 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  }
  const errors = []
  for (const region of POOLER_REGIONS) {
    const host = `aws-0-${region}.pooler.supabase.com`
    const client = new Client({ ...base, host })
    try {
      await client.connect()
      console.log(`[pooler] connected via ${host}`)
      return client
    } catch (e) {
      errors.push(`${host}: ${e.message}`)
      try { await client.end() } catch {}
    }
  }
  throw new Error('All pooler regions failed:\n' + errors.join('\n'))
}

async function main() {
  const client = await makeClient()

  console.log('===== RiwayatPotongKertas (all, ordered by createdAt) =====')
  const { rows: pk } = await client.query(
    `SELECT id, "nomorUrut", "userId", "createdAt", "namaCustomer", "namaCetakan"
     FROM "RiwayatPotongKertas" ORDER BY "createdAt" ASC`
  )
  for (const r of pk) {
    console.log(
      `${r.createdAt.toISOString()} | ${r.nomorUrut} | user=${r.userId} | ${r.namaCustomer} / ${r.namaCetakan} | id=${r.id}`
    )
  }
  console.log(`Total PK records: ${pk.length}`)

  console.log('\n===== DocumentCounter (riwayatPotongKertas keys) =====')
  const { rows: ctr } = await client.query(
    `SELECT key, "lastNum", "updatedAt" FROM "DocumentCounter" WHERE key LIKE 'riwayatPotongKertas|%' ORDER BY key`
  )
  for (const r of ctr) {
    console.log(`${r.key} | lastNum=${r.lastNum} | updatedAt=${r.updatedAt.toISOString()}`)
  }
  if (ctr.length === 0) console.log('(none)')

  console.log('\n===== DocumentCounter (legacy per-month keys any context w/ big lastNum>9999) =====')
  const { rows: big } = await client.query(
    `SELECT key, "lastNum", "updatedAt" FROM "DocumentCounter" WHERE "lastNum" > 9999 ORDER BY "lastNum" DESC LIMIT 30`
  )
  for (const r of big) {
    console.log(`${r.key} | lastNum=${r.lastNum} | updatedAt=${r.updatedAt.toISOString()}`)
  }
  if (big.length === 0) console.log('(none)')

  await client.end()
}

main().catch((e) => {
  console.error('INSPECT ERROR:', e)
  process.exit(1)
})
