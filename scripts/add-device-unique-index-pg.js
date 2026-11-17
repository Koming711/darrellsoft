/**
 * MIGRASI PRODUKSI — spesifikasi §4 (1 akun 1 perangkat):
 * 1. Dedupe: bila ada akun dgn >1 sesi 'active' (data lama), pertahankan
 *    SATU terbaru (loginAt, tie-break id), sisanya dicabut.
 * 2. Partial unique index "DeviceSession_one_active_per_user" ON
 *    DeviceSession(userId) WHERE status='active' — jangkar konkurensi:
 *    dua perangkat yang login bersamaan tidak mungkin sama-sama aktif.
 *
 * Idempotent — aman dijalankan berulang (CREATE UNIQUE INDEX IF NOT EXISTS).
 * Jalankan: bun run scripts/add-device-unique-index-pg.js
 */
const { Client } = require('pg')

const PROD_URL =
  process.env.PUSH_URL ||
  'postgresql://postgres.nhmxpxafnehcthzjrhjp:GacTo8L7afIyScz3@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

const IDX = 'DeviceSession_one_active_per_user'

async function main() {
  const c = new Client({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  // 1) Dedupe — pertahankan satu sesi aktif terbaru per akun.
  const dedupe = `
    UPDATE "DeviceSession" SET status = 'revoked', "logoutAt" = CURRENT_TIMESTAMP, "revokedBy" = ''
    WHERE status = 'active'
    AND id NOT IN (
      SELECT ds.id FROM "DeviceSession" ds
      WHERE ds.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM "DeviceSession" newer
        WHERE newer."userId" = ds."userId" AND newer.status = 'active'
        AND (newer."loginAt" > ds."loginAt" OR (newer."loginAt" = ds."loginAt" AND newer.id > ds.id))
      )
    )`
  const r1 = await c.query(dedupe)
  console.log('dedupe revoked rows:', r1.rowCount)

  // 2) Partial unique index.
  await c.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${IDX}" ON "DeviceSession"("userId") WHERE status = 'active'`
  )
  const chk = await c.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'DeviceSession' AND indexname = $1`,
    [IDX]
  )
  console.log('unique index present:', chk.rowCount === 1)

  const stat = await c.query(
    `SELECT status, COUNT(*)::int AS n FROM "DeviceSession" GROUP BY status ORDER BY n DESC`
  )
  console.log('status distribution:', stat.rows)

  await c.end()
}

main().catch((e) => {
  console.error('migration error:', e.message)
  process.exit(1)
})
