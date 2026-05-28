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
