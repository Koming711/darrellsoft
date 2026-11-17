#!/bin/bash
# Deploy to Vercel with proper database swap
# Usage: bun run deploy
# 
# This script:
# 1. Swaps schema.prisma from sqlite → postgresql
# 2. Generates Prisma client for PostgreSQL
# 3. Pushes schema to Supabase (if needed)
# 4. Deploys to Vercel
# 5. Reverts schema.prisma back to sqlite
#
# LOCAL DATABASE STAYS SQLITE - FAST! 🚀

set -e

echo "🚀 Starting deployment to Vercel..."
echo ""

# Step 1: Swap to postgresql
echo "📦 Step 1: Swapping schema to postgresql..."
node scripts/prepare-build.js

# Step 2: Generate Prisma client for PostgreSQL
echo "📦 Step 2: Generating Prisma client for PostgreSQL..."
npx prisma generate

# Step 3: Push schema changes to Supabase (session mode port 5432 —
# worklog lesson: transaction mode 6543 timeout utk db push).
# NON-FATAL: bila URL tidak ditemukan / push gagal, deploy tetap lanjut.
echo "📦 Step 3: Pushing schema to Supabase..."
PUSH_URL="$(node scripts/build-push-url.js 2>/dev/null || true)"
if [ -n "$PUSH_URL" ]; then
  if DATABASE_URL="$PUSH_URL" npx prisma db push --skip-generate; then
    echo "✅ Schema pushed to Supabase"
  else
    echo "⚠️  prisma db push gagal (non-fatal) — lanjut deploy. Jalankan manual bila ada tabel baru."
  fi
else
  echo "⚠️  DATABASE_URL production tidak ditemukan — skip push schema (non-fatal)."
fi

# Step 4: Deploy to Vercel
# NOTE: vercel CLI v65+ menuntut --yes (tanpa prompt konfirmasi);
# .vercel/project.json (link ke project darrellsoft) wajib ada —
# bila hilang, jalankan dulu: npx vercel link --yes --project darrellsoft
echo "📦 Step 4: Deploying to Vercel..."
npx vercel --prod --yes --token "$VERCEL_TOKEN"

# Step 5: Revert schema back to sqlite
echo "📦 Step 5: Reverting schema to sqlite for local dev..."
node scripts/revert-schema.js

# Step 6: Regenerate Prisma client for SQLite
echo "📦 Step 6: Regenerating Prisma client for SQLite..."
npx prisma generate

echo ""
echo "✅ Deployment complete! Local dev still uses SQLite (fast!) 🚀"
