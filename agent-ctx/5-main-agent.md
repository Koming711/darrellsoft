# Task 5 - Main Agent: Update API routes to use `isSuperAdmin` for data visibility

## Summary
Replaced `isAdmin` with `isSuperAdmin` in all 8 API route files for data visibility/ownership checks, making regular admin users multi-tenant (their data is now isolated like regular users).

## Files Changed
1. `src/app/api/purchase-order/route.ts` — import + data filter check
2. `src/app/api/purchase-order/[id]/route.ts` — import + canAccess helper
3. `src/app/api/pembeli/route.ts` — import + 3 checks (GET filter, DELETE ownership, PUT ownership)
4. `src/app/api/calon-pembeli/route.ts` — import + 3 checks (GET filter, DELETE ownership, PUT ownership)
5. `src/app/api/dokupro-history/route.ts` — import + data filter check
6. `src/app/api/dokupro-history/[id]/route.ts` — import + 2 ownership checks (GET, DELETE)
7. `src/app/api/history/route.ts` — import + 2 checks (duplicate scope, data filter)
8. `src/app/api/history/[id]/route.ts` — import + 2 ownership checks (GET, DELETE)

## Key Decisions
- In all 8 files, `isAdmin` was ONLY used for data visibility/ownership, never for access control, so it was safe to replace entirely and remove from imports
- Access control checks (e.g., `requireAdmin`) in other files remain unchanged
- `isAdmin` function in `server-auth.ts` was NOT modified

## Lint
- Ran `bun run lint` — no new errors introduced
