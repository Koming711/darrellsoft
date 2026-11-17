/**
 * Bangun DATABASE_URL khusus `prisma db push` ke Supabase production.
 *
 * Pelajaran worklog: pooler TRANSACTION mode (port 6543) sering timeout untuk
 * prisma db push → wajib pakai SESSION mode (port 5432).
 *
 * Sumber URL (urut prioritas):
 *   1. env DATABASE_URL  (bila sudah di-set pemanggil)
 *   2. .env.production.local
 *   3. .env.prod-inspect
 * URL direct (db.<ref>.supabase.co) → dikonversi ke pooler session mode.
 * Keluaran: URL dicetak ke stdout; bila tidak ditemukan → exit 1 (pemanggil
 * deploy.sh menangani sebagai non-fatal).
 */
const fs = require('fs')
const path = require('path')

function readUrlFromEnvFile(file) {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    const m = content.match(/^DATABASE_URL="?([^"\n]+)"?/m)
    if (!m) return null
    const url = m[1].trim()
    if (!url || url.includes('[SENSITIVE]') || !url.startsWith('postgresql')) return null
    return url
  } catch {
    return null
  }
}

let url = process.env.DATABASE_URL || null
if (!url || !url.startsWith('postgresql')) url = readUrlFromEnvFile('.env.production.local')
if (!url || !url.startsWith('postgresql')) url = readUrlFromEnvFile('.env.prod-inspect')

if (!url) {
  console.error('DATABASE_URL production tidak ditemukan (.env.production.local / .env.prod-inspect / env).')
  process.exit(1)
}

const region = process.env.SUPABASE_REGION || 'ap-southeast-1'

// Direct host (IPv6-only) → pooler session mode port 5432 (IPv4).
// Pooler butuh username "postgres.<project-ref>" (bukan "postgres" polos).
const directMatch = url.match(/@db\.([a-z]+)\.supabase\.co:\d+/)
if (directMatch) {
  const ref = directMatch[1]
  url = url.replace(/^postgresql:\/\/([^@./]+):/, `postgresql://postgres.${ref}:`)
  url = url.replace(directMatch[0], `@aws-1-${region}.pooler.supabase.com:5432`)
}
// Pooler transaction mode 6543 → session mode 5432 (stabil utk db push)
url = url.replace(/(pooler\.supabase\.com):6543/, '$1:5432')

process.stdout.write(url)
