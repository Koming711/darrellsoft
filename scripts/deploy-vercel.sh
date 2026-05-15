#!/bin/bash
# Deploy DarrellPOS to Vercel with Supabase Pooler Connection
# Run this script to deploy the app to Vercel production
#
# Usage: bash scripts/deploy-vercel.sh
#
# Prerequisites:
# - Install Vercel CLI: npm i -g vercel
# - Login to Vercel: vercel login
#
# This script will:
# 1. Deploy the app to Vercel production
# 2. The app will automatically use Supabase pooler for IPv4 access

set -e

echo "🚀 Deploying DarrellPOS to Vercel..."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it with: npm i -g vercel"
    exit 1
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel. Run: vercel login"
    exit 1
fi

echo "✅ Logged in to Vercel"
echo ""

# Deploy to production
echo "📦 Deploying to production..."
vercel deploy --prod --yes

echo ""
echo "✅ Deployment complete!"
echo ""
echo "⚠️  IMPORTANT: Make sure DATABASE_URL is set in Vercel Environment Variables:"
echo "   Key: DATABASE_URL"
echo "   Value: postgresql://postgres.nhmxpxafnehcthzjrhjp:GacTo8L7afIyScz3@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
echo ""
echo "   Set it at: https://vercel.com → darrellpos-new → Settings → Environment Variables"
