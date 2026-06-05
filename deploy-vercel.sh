#!/bin/bash
# Deploy to Vercel - darrellsoft.vercel.app
# Usage: VERCEL_TOKEN=your_token bash scripts/deploy-vercel.sh
#
# Get your token from: https://vercel.com/account/tokens

set -e

TOKEN=${VERCEL_TOKEN:-}

if [ -z "$TOKEN" ]; then
  echo "❌ VERCEL_TOKEN not set!"
  echo ""
  echo "Get your token from: https://vercel.com/account/tokens"
  echo "Then run: VERCEL_TOKEN=your_token bash scripts/deploy-vercel.sh"
  exit 1
fi

echo "🚀 Deploying to Vercel (darrellsoft.vercel.app)..."
echo ""

# Step 1: Swap schema to postgresql
echo "📦 Step 1: Swapping schema to postgresql..."
node scripts/prepare-build.js

# Step 2: Generate Prisma client for PostgreSQL
echo "📦 Step 2: Generating Prisma client for PostgreSQL..."
npx prisma generate

# Step 3: Push schema to Supabase (optional)
read -p "Push schema to Supabase? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "📦 Pushing schema to Supabase..."
  DATABASE_URL="postgresql://postgres.nhmxpxafnehcthzjrhjp:GacTo8L7afIyScz3@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres" npx prisma db push
  echo "✅ Schema pushed to Supabase"
fi

# Step 4: Deploy to Vercel
echo "📦 Step 4: Deploying to Vercel..."
vercel deploy --prod --token "$TOKEN"

# Step 5: Revert schema back to sqlite
echo "📦 Step 5: Reverting schema to sqlite for local dev..."
node scripts/revert-schema.js

# Step 6: Regenerate Prisma client for SQLite
echo "📦 Step 6: Regenerating Prisma client for SQLite..."
npx prisma generate

echo ""
echo "✅ Deployment complete! Live at: https://darrellsoft.vercel.app"
echo "🏠 Local dev still uses SQLite (fast!) 🚀"
