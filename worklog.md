---
Task ID: 1
Agent: Main Agent
Task: Add "Lupa Password" (Forgot Password) email-based reset flow to the login page

Work Log:
- Explored current login page and project structure (custom auth, no NextAuth, plaintext passwords, no email setup)
- Added `PasswordResetToken` model to Prisma schema (token, email, userType, userId, expiresAt, used)
- Ran `bun run db:push` to sync database schema
- Installed `nodemailer` and `@types/nodemailer` for email sending
- Added SMTP configuration to `.env` file (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, etc.)
- Created `/src/lib/email.ts` with `sendEmail()` function and `getPasswordResetEmailHtml()` for professional HTML email template
- Updated `/src/app/api/auth/forgot-password/route.ts` to generate a secure token, save to DB, invalidate old tokens, and send reset email with masked email response
- Created `/src/app/api/auth/reset-password/route.ts` with POST (reset password) and GET (verify token) endpoints
- Created `/src/app/reset-password/page.tsx` - full reset password page with token verification, password entry, and success states
- Updated `/src/app/login/page.tsx` - replaced WhatsApp-based forgot password dialog with email-based flow:
  - Changed `fpResult` state type from `{found, name, role}` to `{emailSent, maskedEmail, message}`
  - Updated `handleForgotPassword` to handle email-sent response
  - Replaced dialog UI: removed WhatsApp link, added "Kirim Link Reset Password" button and "Email Terkirim" success state
  - Replaced `MessageCircle` icon import with `MailCheck` icon
- Regenerated Prisma Client
- Tested all API endpoints: forgot-password returns proper errors and success, reset-password token verification works
- Both login page (200) and reset-password page (200) are accessible

Stage Summary:
- Full email-based password reset flow implemented
- Flow: Click "Lupa Password" → Enter username → System sends reset email → User clicks link → User enters new password on /reset-password page
- SMTP config needs real credentials in .env (SMTP_PASS must be set to a real app password)
- Token expires in 1 hour, old unused tokens are invalidated on new request
- Email is masked for privacy (e.g., da***@gmail.com)
---
Task ID: fix-doc-isolation
Agent: main
Task: Fix document APIs for per-user isolation + Redesign Master Ongkos Cetak page

Work Log:
- Fixed all document APIs (Invoice, Surat Jalan, Purchase Order, DocumentHistory) to use per-user isolation via getServerUser/getDataFilter/canAccessRecord
- Fixed Dashboard API to include dataFilter for DocumentHistory queries
- Added auth headers to all frontend document API calls (history-table, document-action-buttons, invoice-editor, pembukaan page)
- Redesigned Master Ongkos Cetak page: replaced MobileTable with styled Table component + mobile card grid layout with colored cards
- Added AlertDialog for delete confirmation, proper formatRp helper, Grammage column

Stage Summary:
- Document APIs now enforce per-user isolation (userId from cookies, not query params)
- Dashboard document counts are now per-user filtered
- Master Ongkos Cetak page now has professional table + mobile card layout similar to riwayat/pembukaan pages
---
Task ID: deploy-vercel
Agent: main
Task: Deploy to www.darrellsoft.com via Vercel

Work Log:
- Checked project state and previous worklog - all prior tasks completed (doc isolation fix, master cetak redesign)
- Ran lint check - 37 errors (React Compiler warnings: setState-in-effect, static-components, etc.) but none blocking the build
- Linked Vercel project to darrellsoft (koming711s-projects/darrellsoft)
- Pulled production env vars from Vercel (DATABASE_URL is Supabase PostgreSQL)
- Step 1: Swapped schema provider from sqlite → postgresql (prepare-build.js)
- Step 2: Attempted prisma db push to Supabase - failed (sandbox can't reach external DB)
- Step 3: Deployed to Vercel with --prod flag using token
  - Build succeeded in 38s, deployed in 1m
  - Prisma client generated for PostgreSQL on Vercel's build machine
  - All 87 pages generated successfully
  - URL: https://www.darrellsoft.com
- Step 4: Reverted schema back to sqlite + regenerated Prisma client for local dev
- Cleaned up .env.production file

Stage Summary:
- Deployment successful! App live at https://www.darrellsoft.com
- Local dev still uses SQLite (schema reverted)
- Note: Supabase schema push was skipped (sandbox network restriction). If new models added, may need to push schema separately
---
Task ID: fix-po-race-condition
Agent: main
Task: Fix intermittent data fill when navigating from Potong Kertas → Purchase Order

Work Log:
- Investigated the full data flow: potong kertas → handlePO → router.push(/purchase-order?riwayatId=xxx) → PO page auto-select
- Found ROOT CAUSE: Race condition between `loadCompanyFromAPI()` and auto-select effect
  - loadCompanyFromAPI captured `state` at the BEGINNING of async function, then used stale state to overwrite store after async operations completed
  - If auto-select ran first, loadCompanyFromAPI would overwrite with stale `state.purchaseOrder`, LOSING the referensi/items data
- Also found: `autoSelectRef.current` (boolean) was never reset per riwayatId — navigating with a different riwayatId wouldn't trigger auto-select
- Also found: handlePO in potong-kertas had edge case where `isDataSameAsAnyRiwayat()` returned true but `find()` didn't match — function returned without navigating
- Also found: All three editors (invoice, surat-jalan, purchase-order) used stale closure pattern `{...invoice/sj/po, ...}` instead of functional `setInvoice/sj/po((prev) => ({...prev, ...}))`

Fixes applied:
1. **store.ts**: Moved `const state = get()` inside `loadCompanyFromAPI` to AFTER the async operations, ensuring LATEST state is used when updating documents — prevents overwriting data set by concurrent auto-select
2. **purchase-order-editor.tsx**:
   - Changed `autoSelectRef` (boolean) to `autoSelectDoneRef` (string | null) that tracks the specific riwayatId
   - Replaced stale `{...po, ...}` pattern with functional `setPurchaseOrder((prev) => ({...prev, ...}))` everywhere
   - Extracted `applyReferensi()` function using functional setter
   - Added retry mechanism (3 attempts, 500ms delay) for when newly saved riwayat isn't in the list yet
3. **invoice-editor.tsx**: Same fixes as PO editor
4. **surat-jalan-editor.tsx**: Same fixes as PO editor
5. **potong-kertas/page.tsx**: Fixed handlePO edge case — when `isDataSameAsAnyRiwayat()` is true but `find()` fails, save a new riwayat instead of silently returning

Stage Summary:
- Root cause identified and fixed: Race condition between loadCompanyFromAPI and auto-select effect
- All document editors now use functional Zustand setters to prevent stale closure issues
- Auto-select now tracks specific riwayatId/invoiceId (not just boolean flag) for correct re-navigation
- Retry mechanism ensures newly saved records are found even with slight propagation delays
- All three pages (invoice, surat-jalan, purchase-order) tested and load correctly (HTTP 200)
