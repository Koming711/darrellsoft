# Worklog: Fix ERR_TOO_MANY_REDIRECTS on /dashboard

**Task ID**: 1
**Agent**: Code Fix Agent
**Date**: 2026-03-05

## Problem

Users experienced a redirect loop (ERR_TOO_MANY_REDIRECTS) when navigating to `/dashboard` via the "Halaman Utama" sidebar link. The issue was persistent across multiple fix attempts.

## Root Cause

The `DashboardLayout` component's permission check `useEffect` contained a `window.location.replace(firstAccessible)` call that would automatically redirect users to the first accessible path when they lacked permission for the current page. This created redirect loops because:

1. When `verify-session` API is slow or fails, permissions might not be loaded yet → `hasFeatureAccess` returns false → triggers redirect
2. The redirect target could itself fail the permission check (same unloaded permissions), creating a redirect chain/loop
3. `permVersion` changes from the periodic session check (every 10s) could re-trigger the permission check and redirect storm
4. `window.location.replace()` causes a full page reload, re-mounting `DashboardLayout` and re-running the entire init flow, which amplifies the problem

## Changes Made

### 1. `/home/z/my-project/src/components/dashboard-layout.tsx`

**Removed the hard redirect from the permission check useEffect:**

The permission check effect was changed from:
```typescript
if (!allowed) {
  const firstAccessible = getFirstAccessiblePath(user.role)
  if (firstAccessible && firstAccessible !== pathname) {
    window.location.replace(firstAccessible)  // <-- REMOVED: causes redirect loops
    return
  }
}
setNoAccess(!allowed)
```

To:
```typescript
const allowed = hasFeatureAccess(user.role, featureId)
setNoAccess(!allowed)
```

Now if a user doesn't have access to a page, they simply see the existing "Akses Ditolak" (Access Denied) screen with a "Kembali ke Beranda" button. This is a user-initiated navigation (button click), not an automatic redirect, so it cannot cause loops.

The `getFirstAccessiblePath` import is still needed because it's used by the "Kembali ke Beranda" button in the "No Access" screen.

### 2. `/home/z/my-project/src/app/dashboard/layout.tsx` (NEW FILE)

Created a pass-through layout for the `/dashboard` route:
```typescript
export default function DashboardRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

This ensures Next.js doesn't try to add any middleware-level redirects for the dashboard route and lets the `DashboardLayout` component handle everything.

## What Was NOT Changed

- Route structure and page locations remain the same
- Login redirect behavior (still goes to `/potong-kertas` after login)
- Permission defaults (all roles have `dashboard: true` by default)
- The "Belum Login" screen redirect to `/login` (safe since login page handles already-authenticated users)
- The periodic session check interval and logic

## Verification

- `bun run lint` passes with no new errors introduced by these changes
- Dev server compiles successfully
- The existing "No Access" screen provides a safe fallback with a user-initiated navigation button
