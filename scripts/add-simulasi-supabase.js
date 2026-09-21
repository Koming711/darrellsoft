// One-off: tambahkan kolom simulasiCepat ke tabel "RiwayatCetakan" di Supabase Postgres produksi.
// Kolom menyimpan Tabel Simulasi Cepat (JSON array) yang ikut tersimpan saat Simpan Riwayat.
// Pakai pooler (IPv4) karena sandbox/Vercel tidak punya IPv6.
// URL diambil dari /tmp/vercel-prod-env.txt (DATABASE_URL="postgresql://...").
const fs = require('fs')
const { Client } = require('pg')

const raw = fs.readFileSync('/tmp/vercel-prod-env.txt', 'utf8')
const m = raw.match(/DATABASE_URL="(postgresql:\/\/[^"]+)"/)
if (!m) { console.error('DATABASE_URL tidak ditemukan'); process.exit(1) }
let url = m[1]

// db.<ref>.supabase.co (IPv6-only) → pooler transaction mode (IPv4)
const dm = url.match(/db\.([a-z]+)\.supabase\.co/)
if (dm) {
  const u = url.match(/:\/\/([^:]+):([^@]+)@/)
  let user = u[1]
  const password = u[2]
  if (!user.includes('.')) user = `${user}.${dm[1]}`
  url = `postgresql://${user}:${password}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
  console.log('Menggunakan pooler URL (host disamarkan)')
}

async function main() {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const col = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='RiwayatCetakan' AND column_name='simulasiCepat'`)
  if (col.rows.length > 0) {
    console.log('Kolom simulasiCepat SUDAH ada — tidak ada perubahan')
  } else {
    await c.query(`ALTER TABLE "RiwayatCetakan" ADD COLUMN "simulasiCepat" TEXT NOT NULL DEFAULT ''`)
    console.log('Kolom simulasiCepat DITAMBAHKAN ke tabel "RiwayatCetakan"')
  }
  const check = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='RiwayatCetakan' AND column_name IN ('grandTotal','simulasiCepat','photoUrl') ORDER BY ordinal_position`)
  console.log('Verifikasi kolom:', check.rows.map(r => r.column_name).join(', '))
  await c.end()
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1) })
