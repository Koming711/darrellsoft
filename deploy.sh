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

# Step 3: Push schema changes to Supabase (optional - uncomment if needed)
# echo "📦 Step 3: Pushing schema to Supabase..."
# npx prisma db push
# echo "✅ Schema pushed to Supabase"

# Step 4: Deploy to Vercel
echo "📦 Step 4: Deploying to Vercel..."
npx vercel --prod

# Step 5: Revert schema back to sqlite
echo "📦 Step 5: Reverting schema to sqlite for local dev..."
node scripts/revert-schema.js

# Step 6: Regenerate Prisma client for SQLite
echo "📦 Step 6: Regenerating Prisma client for SQLite..."
npx prisma generate

echo ""
echo "✅ Deployment complete! Local dev still uses SQLite (fast!) 🚀"
