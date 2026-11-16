// Pasang token Fonnte baru + nomor pengirim OTP ke production Supabase Postgres (Setting table)
// Usage: node scripts/set-wa-otp-sender-prod.mjs <token> <nomor_pengirim>
// Idempotent: upsert wa_api_key + wa_sender_number; otp_dev_mode TIDAK disentuh.
import pg from 'pg';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const TOKEN = process.argv[2];
const SENDER = process.argv[3] || '085888082208';
if (!TOKEN) {
  console.error('Usage: node scripts/set-wa-otp-sender-prod.mjs <token> [nomor_pengirim]');
  process.exit(1);
}

const envContent = readFileSync('.env.production.local', 'utf8');
const match = envContent.match(/DATABASE_URL="(.*?)"/) || envContent.match(/DATABASE_URL=(.*)/);
if (!match) {
  console.error('DATABASE_URL not found in .env.production.local');
  process.exit(1);
}
let url = match[1].trim().replace(/^"|"$/g, '');
// Direct host (IPv6-only) -> pooler session mode port 5432 (IPv4, worklog lesson)
url = url.replace('@db.nhmxpxafnehcthzjrhjp.supabase.co:5432', '@aws-1-ap-southeast-1.pooler.supabase.com:5432');
console.log('Connecting to host:', new URL(url).host);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const before = await client.query(
  `SELECT "key", CASE WHEN "key"='wa_api_key' THEN LEFT("value",4)||'...'||RIGHT("value",4) ELSE "value" END AS v
   FROM "Setting" WHERE "key" IN ('wa_api_key','wa_api_url','wa_sender_number','otp_dev_mode')`
);
console.log('BEFORE:', JSON.stringify(before.rows));

for (const [key, value] of [['wa_api_key', TOKEN], ['wa_sender_number', SENDER]]) {
  await client.query(
    `INSERT INTO "Setting" ("id", "key", "value", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()`,
    [randomUUID(), key, value]
  );
}

const after = await client.query(
  `SELECT "key", CASE WHEN "key"='wa_api_key' THEN LEFT("value",4)||'...'||RIGHT("value",4)||' (len '||LENGTH("value")||')' ELSE "value" END AS v
   FROM "Setting" WHERE "key" IN ('wa_api_key','wa_api_url','wa_sender_number','otp_dev_mode')`
);
console.log('AFTER:', JSON.stringify(after.rows, null, 1));

await client.end();
console.log('DONE');
