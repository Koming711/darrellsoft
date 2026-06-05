const { Client } = require('pg');

const POOLER_URL = 'postgresql://postgres.nhmxpxafnehcthzjrhjp:GacTo8L7afIyScz3@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function seed() {
  const client = new Client({ connectionString: POOLER_URL });
  await client.connect();
  console.log('✅ Connected to Supabase');

  // Get the admin user (only user-admin, the one with actual local data)
  const users = await client.query(`SELECT id, username FROM "Pengguna" WHERE id = 'user-admin'`);
  if (users.rows.length === 0) {
    console.log('❌ user-admin not found in production DB');
    await client.end();
    return;
  }
  const userId = users.rows[0].id;
  console.log('Seeding for user:', users.rows[0].username, '(' + userId + ')');

  // ============================================================
  // ACTUAL LOCAL DATA from user-admin (NOT sample/template data)
  // ============================================================

  // Papers: only the 7 papers the user manually entered
  const papers = [
    { name: 'ivory', grammage: 210, width: 79, height: 109, pricePerRim: 1356233 },
    { name: 'ivory', grammage: 300, width: 79, height: 109, pricePerRim: 1937475 },
    { name: 'duplex', grammage: 270, width: 79, height: 109, pricePerRim: 1765000 },
    { name: 'duplek', grammage: 270, width: 90, height: 120, pricePerRim: 2210000 },
    { name: 'ivory', grammage: 210, width: 65, height: 100, pricePerRim: 1078350 },
    { name: 'art karton', grammage: 260, width: 65, height: 100, pricePerRim: 1394250 },
    { name: 'art karton', grammage: 260, width: 79, height: 109, pricePerRim: 1903031 },
  ];

  // Printing Costs: only the 3 the user manually entered
  const printingCosts = [
    { machineName: 'sm52', grammage: 0, printAreaWidth: 52, printAreaHeight: 37, pricePerColor: 62500, specialColorPrice: 80000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 60, platePricePerSheet: 18000 },
    { machineName: 'sm74', grammage: 0, printAreaWidth: 74, printAreaHeight: 52, pricePerColor: 130000, specialColorPrice: 160000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 120, platePricePerSheet: 36000 },
    { machineName: 'oliver 58', grammage: 150, printAreaWidth: 58, printAreaHeight: 44, pricePerColor: 100000, specialColorPrice: 150000, minimumPrintQuantity: 1000, priceAboveMinimumPerSheet: 70, platePricePerSheet: 20000 },
  ];

  // Finishings: only the 5 the user manually entered
  const finishings = [
    { name: 'laminating doff', minimumSheets: 0, minimumPrice: 180000, additionalPrice: 0, pricePerCm: 0.18 },
    { name: 'pond', minimumSheets: 1000, minimumPrice: 75000, additionalPrice: 40, pricePerCm: 0 },
    { name: 'laminating glossy', minimumSheets: 0, minimumPrice: 150000, additionalPrice: 0, pricePerCm: 0.16 },
    { name: 'spot uv', minimumSheets: 0, minimumPrice: 400000, additionalPrice: 0, pricePerCm: 0.25 },
    { name: 'jahit kawat 2 mata', minimumSheets: 0, minimumPrice: 100000, additionalPrice: 120, pricePerCm: 0 },
  ];

  // Step 1: Delete ALL existing master cetak data (both user-admin and any old sample data)
  console.log('\n🗑️  Clearing ALL existing master cetak data...');
  await client.query('DELETE FROM "Paper"');
  await client.query('DELETE FROM "PrintingCost"');
  await client.query('DELETE FROM "Finishing"');
  console.log('  ✅ Cleared all papers, printing costs, finishings');

  // Step 2: Insert ONLY the actual local data for user-admin
  console.log('\n🌱 Inserting actual local data...');

  // Insert Papers
  for (const p of papers) {
    const id = 'paper-' + p.name.toLowerCase().replace(/\s+/g, '') + '-' + p.grammage + '-' + p.width + 'x' + p.height;
    await client.query(
      'INSERT INTO "Paper" (id, name, grammage, width, height, "pricePerRim", "userId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET name=$2, grammage=$3, width=$4, height=$5, "pricePerRim"=$6, "updatedAt"=NOW()',
      [id, p.name, p.grammage, p.width, p.height, p.pricePerRim, userId]
    );
  }
  console.log('  ✅ Inserted', papers.length, 'papers');

  // Insert PrintingCosts
  for (const c of printingCosts) {
    const id = 'pc-' + c.machineName.toLowerCase().replace(/\s+/g, '') + '-' + c.grammage;
    await client.query(
      'INSERT INTO "PrintingCost" (id, "machineName", grammage, "printAreaWidth", "printAreaHeight", "pricePerColor", "specialColorPrice", "minimumPrintQuantity", "priceAboveMinimumPerSheet", "platePricePerSheet", "userId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET "machineName"=$2, grammage=$3, "printAreaWidth"=$4, "printAreaHeight"=$5, "pricePerColor"=$6, "specialColorPrice"=$7, "minimumPrintQuantity"=$8, "priceAboveMinimumPerSheet"=$9, "platePricePerSheet"=$10, "updatedAt"=NOW()',
      [id, c.machineName, c.grammage, c.printAreaWidth, c.printAreaHeight, c.pricePerColor, c.specialColorPrice, c.minimumPrintQuantity, c.priceAboveMinimumPerSheet, c.platePricePerSheet, userId]
    );
  }
  console.log('  ✅ Inserted', printingCosts.length, 'printing costs');

  // Insert Finishings
  for (const f of finishings) {
    const id = 'fin-' + f.name.toLowerCase().replace(/[\s/]+/g, '');
    await client.query(
      'INSERT INTO "Finishing" (id, name, "minimumSheets", "minimumPrice", "additionalPrice", "pricePerCm", "userId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET name=$2, "minimumSheets"=$3, "minimumPrice"=$4, "additionalPrice"=$5, "pricePerCm"=$6, "updatedAt"=NOW()',
      [id, f.name, f.minimumSheets, f.minimumPrice, f.additionalPrice, f.pricePerCm, userId]
    );
  }
  console.log('  ✅ Inserted', finishings.length, 'finishings');

  // Step 3: Set flags to prevent auto-reseed of sample data
  console.log('\n🛡️  Setting flags to prevent auto-reseed...');
  await client.query(
    `INSERT INTO "Setting" (id, key, value, "createdAt", "updatedAt") VALUES ('set-sample-disabled', 'sample_data_disabled', 'true', NOW(), NOW()) ON CONFLICT (key) DO UPDATE SET value = 'true', "updatedAt" = NOW()`
  );
  await client.query(
    `INSERT INTO "Setting" (id, key, value, "createdAt", "updatedAt") VALUES ('set-master-cleared-admin', 'master_cleared_user-admin', 'true', NOW(), NOW()) ON CONFLICT (key) DO UPDATE SET value = 'true', "updatedAt" = NOW()`
  );
  console.log('  ✅ Set sample_data_disabled = true');
  console.log('  ✅ Set master_cleared_user-admin = true');

  // Verify
  const paperCount = await client.query('SELECT count(*) FROM "Paper"');
  const pcCount = await client.query('SELECT count(*) FROM "PrintingCost"');
  const finCount = await client.query('SELECT count(*) FROM "Finishing"');

  console.log('\n📊 Production database now has:');
  console.log('  Papers:', paperCount.rows[0].count, '(should be 7)');
  console.log('  PrintingCosts:', pcCount.rows[0].count, '(should be 3)');
  console.log('  Finishings:', finCount.rows[0].count, '(should be 5)');

  await client.end();
  console.log('\n🎉 Production database updated with local data only!');
}

seed().catch(err => { console.error('Error:', err.message); process.exit(1); });
