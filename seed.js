"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seed: no sample data to sync.');
    // === DEFAULT SETTINGS ===
    const settings = [
        { key: 'appName', value: 'Sistem Cetak' },
        { key: 'companyName', value: 'Percetakan' },
        { key: 'currency', value: 'IDR' },
        { key: 'defaultProfitPercent', value: '10' },
        { key: 'packingCostDefault', value: '5000' },
        { key: 'shippingCostDefault', value: '15000' },
    ];
    for (const setting of settings) {
        await prisma.setting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        });
    }
    console.log(`✅ Synced ${settings.length} settings`);
    console.log('🎉 Seed completed!');
}
main()
    .catch((e) => { console.error('❌ Seed error:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
