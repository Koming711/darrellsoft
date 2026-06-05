# Task 2 - Multi-Tenant Architecture Fix

## Agent: main

## Task Summary
Fixed multi-tenant architecture so admin is platform-level and each user gets their own perusahaan.

## Changes Made

### Data Migration
- Migrated aming's CalonPembeli + all business data from perusahaan-default to new "Aming Company" perusahaan
- aming's new perusahaanId: cmppk37ae0000ly1mfk3n79bd

### API Routes Modified

1. **`/api/register/route.ts`** - Each registrant now gets their OWN Perusahaan (slug: `tenant-{username}-{timestamp}`). Essential settings copied from platform default perusahaan. Removed dependency on admin's perusahaanId cookie.

2. **`/api/calon-pembeli/route.ts`** - Admin sees ALL CalonPembeli across ALL companies (no perusahaanId filter). Non-admin sees own data only. Added perusahaanId to GET select. DELETE/PUT: Admin bypasses tenant check.

3. **`/api/calon-pembeli/convert/route.ts`** - Admin can convert CalonPembeli from any perusahaan. Settings copied from platform default perusahaan.

4. **`/api/pengguna/route.ts`** - Admin sees ALL Pengguna across ALL companies. DELETE/PUT: Admin bypasses tenant check.

5. **`/api/dashboard/route.ts`** - Split into `getAdminDashboard()` (platform stats) and `getUserDashboard()` (business data). Admin dashboard returns: totalPengguna, regularPengguna, adminPengguna, totalCalonPembeli, totalPerusahaan, activePerusahaan, new registrations in period, calonByStatus, perusahaanByPaket, recentCalonPembeli, recentPerusahaan, daily registration chart data.

### Frontend Modified

6. **`/src/app/dashboard/page.tsx`** - Split into `AdminDashboard` and `UserDashboard` components. Admin shows platform stats cards, status breakdowns, registration activity chart, recent tables. Non-admin shows calculation stats and activity tables.

## Architecture Decisions
- Admin's perusahaanId cookie remains "perusahaan-default" but queries bypass tenant filtering when `isAdmin()` is true
- Each new registrant gets `tenant-{username}-{timestamp}` slug for uniqueness
- Platform default perusahaan is used only for admin accounts and as settings template source
