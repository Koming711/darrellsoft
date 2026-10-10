// Install Fonnte wa_api_key ke production Supabase Postgres (Setting table)
// Usage: node scripts/set-wa-api-key-prod.mjs [token]
import pg from 'pg';
import { readFileSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/set-wa-api-key-prod.mjs <token>');
  process.exit(1);
}

const envContent = readFileSync('.env.production.local', 'utf8');
const match = envContent.match(/DATABASE_URL="(.*?)"/);
if (!match) {
  console.error('DATABASE_URL not found in .env.production.local');
  process.exit(1);
}
let url = match[1];
// Direct host (IPv6-only) -> pooler session mode port 5432 (IPv4, worklog lesson)
url = url.replace('@db.nhmxpxafnehcthzjrhjp.supabase.co:5432', '@aws-1-ap-southeast-1.pooler.supabase.com:5432');
console.log('Connecting to host:', new URL(url).host);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const before = await client.query(
  `SELECT "key", "value" FROM "Setting" WHERE "key" IN ('wa_api_key','wa_api_url','otp_dev_mode')`
);
console.log('BEFORE:', JSON.stringify(before.rows));

import { randomUUID } from 'crypto';
await client.query(
  `INSERT INTO "Setting" ("id", "key", "value", "createdAt", "updatedAt")
   VALUES ($1, 'wa_api_key', $2, now(), now())
   ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()`,
  [randomUUID(), TOKEN]
);

const after = await client.query(
  `SELECT "key", LEFT("value", 4) || '...' || RIGHT("value", 4) AS masked, LENGTH("value") AS len FROM "Setting" WHERE "key" = 'wa_api_key'`
);
console.log('AFTER:', JSON.stringify(after.rows));

const tbl = await client.query(`SELECT to_regclass('"RegisterOtp"') AS t`);
console.log('RegisterOtp table:', tbl.rows[0].t);

await client.end();
console.log('DONE');
