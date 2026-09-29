// Push RegisterOtp table ke production Supabase Postgres
// Flow: prepare-build (swap schema sqlite->postgres) -> prisma db push via pooler
// SESSION MODE port 5432 (transaksi mode 6543 timeout saat DDL, pelajaran worklog)
// -> revert schema -> regenerate sqlite client
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.production.local', 'utf8');
const m = envContent.match(/DATABASE_URL="(.*?)"/);
if (!m) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}
const url = m[1].replace(
  '@db.nhmxpxafnehcthzjrhjp.supabase.co:5432',
  '@aws-1-ap-southeast-1.pooler.supabase.com:5432'
);
console.log('Push target host:', new URL(url).host);

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}

run('node scripts/prepare-build.js');
run('npx prisma db push --accept-data-loss');
run('node scripts/revert-schema.js');
run('npx prisma generate');
console.log('PUSH COMPLETE');
