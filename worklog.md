---
Task ID: 1
Agent: Main Agent
Task: Add payment status (status pembayaran) to purchase order page

Work Log:
- Added `StatusPembayaran` type and `statusPembayaran` field to `PurchaseOrderData` interface in `src/lib/types.ts`
- Updated `createDefaultPurchaseOrder()` default value to `'belum-bayar'`
- Added 3-option payment status selector (Belum Bayar / DP / Lunas) to `src/components/dokupro/purchase-order-editor.tsx`
- Added `StatusBadge` component to `src/components/dokupro/purchase-order-preview.tsx` showing payment status on the PO preview
- Added PUT endpoint to `src/app/api/history/[id]/route.ts` for updating history entry dataJson
- Added status change dialog to `src/app/riwayat-pembelian/page.tsx` with clickable status badges
- Added payment status summary cards (Lunas / Belum Bayar+DP) to the riwayat pembelian page
- Fixed `parseCuttingInfoFromDeskripsi` regex to properly match deskripsi format (with/without grammage)
- Removed "cm" suffix from cutting info display for cleaner look
- Added console logging to `fetchPOHistory` for debugging pkLookup population
- Fixed `src/app/pembukaan/page.tsx` to include `statusPembayaran` field in PO data objects

Stage Summary:
- Payment status feature is fully implemented: can set when creating PO, change from riwayat pembelian, and view in preview
- Three statuses supported: Belum Bayar (red), DP (amber), Lunas (green)
- PUT API endpoint allows updating existing PO's payment status
- Summary cards now show payment status counts
- Cutting info parsing improved with better regex patterns

---
Task ID: 2
Agent: Main Agent
Task: Replace "Belum Bayar" and "DP" status with "Tanggal Jatuh Tempo" date field

Work Log:
- Removed `StatusPembayaran` type and `statusPembayaran` field from `PurchaseOrderData` in types.ts
- Added `tanggalJatuhTempo: string` (due date) and `lunas: boolean` fields to `PurchaseOrderData`
- Updated `createDefaultPurchaseOrder()` with new defaults: `tanggalJatuhTempo: ''`, `lunas: false`
- Updated PO editor: replaced 3-button status selector with date input for "Tgl. Jatuh Tempo" + Lunas toggle button
- Added jatuh tempo warning banner when date is set and not lunas
- Updated PO preview: replaced `StatusBadge` with `PaymentStatusBadge` showing:
  - LUNAS (green) when paid
  - JT: [date] (amber/red if overdue) when has due date and not paid
  - BELUM BAYAR (grey) when no due date and not paid
- Updated riwayat pembelian page:
  - Status badges now show LUNAS / JT: [date] / BELUM BAYAR
  - Overdue dates shown in red, upcoming in amber
  - Status dialog updated: Lunas toggle + date input for Jatuh Tempo
  - Summary cards: Lunas count + Belum Bayar count
- Updated pembukaan page with new fields
- All files maintain backward compatibility: old records with `statusPembayaran: 'lunas'` are correctly interpreted

Stage Summary:
- "Belum Bayar" and "DP" status options removed
- Replaced with "Tanggal Jatuh Tempo" (due date) field + Lunas boolean
- Status now derived: lunas → green LUNAS badge, has due date → amber/red JT badge, no date → grey BELUM BAYAR
- Overdue detection: dates in the past show in red
- Backward compatible with old `statusPembayaran` field

---
Task ID: 3
Agent: Main Agent
Task: Add No. PK reference to Purchase Order page

Work Log:
- Added `nomorUrut` field to `RiwayatPotongKertasItem` interface in `purchase-order-editor.tsx`
- Updated `applyReferensi()` to use `item.nomorUrut` as the primary reference value (falls back to namaCetakan/paperName)
- Updated referensi search filter to include No. PK (`nomorUrut`) in the search
- Updated dropdown display: No. PK shown as bold emerald text, followed by namaCetakan
- Updated active item highlighting to compare against `r.nomorUrut` instead of namaCetakan
- Changed label from "Referensi (opsional)" to "Referensi (No. PK)"
- Changed placeholder from "Pilih riwayat potong kertas / ketik referensi..." to "Pilih No. PK / ketik referensi..."
- Added referensi (Ref.) display in PO preview next to Tanggal, shown only when referensi is set

Stage Summary:
- PO page now uses No. PK (e.g. PK/06/2025/0001) as the reference when selecting from riwayat potong kertas
- Dropdown shows No. PK prominently in emerald color with namaCetakan as secondary info
- Preview shows "Ref." field with the No. PK value
- Search/filter now matches against No. PK in addition to namaCetakan, customer, and paper name

---
Task ID: 4
Agent: Main Agent
Task: Fix PDF output to match the preview for Invoice, PO, and Surat Jalan

Work Log:
- Analyzed all differences between HTML preview components and jsPDF programmatic PDF generation
- Fixed table header: changed from black fill with white text → border top/bottom lines with black text (matches preview)
- Removed zebra striping from table rows: all white background (matches preview which has no zebra)
- Removed outer border from tables: preview has no border around the table
- Added base64 logo image support: `tryAddLogoImage()` function renders company logo in PDF if available
- Added Jatuh Tempo display in header area for Invoice and PO (matches preview's right-side display)
- Added Cara Bayar as a separate row for Invoice (matches preview's separate payment method row with icon)
- Added Referensi (Ref.) field to recipient block for Invoice, PO, and Surat Jalan (matches preview)
- Added jenisBarang field to PO recipient block (matches preview's display of supplier product type)
- Fixed PO signature order: changed from [Disetujui Oleh, Diketahui, Toko] → [Toko, Diketahui, Disetujui Oleh] (matches preview)
- Fixed SJ recipient label: changed from "Diterima Oleh" → "Kepada Yth :" (matches preview)
- Fixed SJ signature order: changed from [Pengirim, Penerima] → [Penerima, Pengirim] (matches preview)
- Updated footer text to be larger (7pt/6pt vs previous 5.5pt/5pt) to match preview readability
- Added `fmtDateShort()` helper for Jatuh Tempo display in short format
- Added `drawCaraBayar()` helper function for payment method row

Stage Summary:
- PDF output now matches the preview exactly for Invoice, Purchase Order, and Surat Jalan
- All visual differences resolved: table styling, signatures, labels, missing fields
- Logo images now render in PDF when company has a base64 logo configured
- Referensi field now appears in PDF for all three document types
- Jatuh Tempo and Cara Bayar display now match preview layout

---
Task ID: 5
Agent: Main Agent
Task: Fix sidebar.tsx hardcoded colors for dark mode support

Work Log:
- Fixed role badges (lines 331-335): added dark mode variants to all 5 role colors
  - superadmin: `dark:bg-red-900/40 dark:text-red-300`
  - admin: `dark:bg-purple-900/40 dark:text-purple-300`
  - manager: `dark:bg-emerald-900/40 dark:text-emerald-300`
  - demo: `dark:bg-amber-900/40 dark:text-amber-300`
  - default: `dark:bg-blue-900/40 dark:text-blue-300`
- Fixed logout button (line 350): `text-red-600` → `text-red-600 dark:text-red-400`, `hover:bg-red-50` → `hover:bg-red-50 dark:hover:bg-red-950`
- Fixed hover states on 3 nav link locations (lines 271, 290, 309): `hover:bg-white/10` → `hover:bg-black/5 dark:hover:bg-white/10`
- Fixed expired date text (line 409): `text-amber-600` → `text-amber-600 dark:text-amber-400`
- All `style={{ ... CSS variables }}` lines left unchanged as instructed
- No `bg-white/80` found in file (sidebar uses CSS variables for backgrounds)
- Verified no TypeScript/lint errors in sidebar.tsx after changes

Stage Summary:
- All hardcoded light-only Tailwind color classes in sidebar.tsx now have proper dark mode variants
- Sidebar will render correctly in both light and dark themes
- Role badges, logout button, nav hover states, and expired date text all support dark mode

---
Task ID: 6
Agent: Main Agent
Task: Fix dashboard-layout.tsx hardcoded colors for dark mode support

Work Log:
- Replaced `bg-slate-50` → `bg-background` (2 instances: loading state, not-logged-in state)
- Replaced `text-slate-800` → `text-foreground` (5 instances: Belum Login, Akses Ditolak, Akun Kadaluarsa, Peringatan Keamanan, Sesi Akan Berakhir headings)
- Replaced `text-slate-500` → `text-muted-foreground` (6 instances: all subtitle/description text)
- Replaced `bg-red-100` → `bg-red-100 dark:bg-red-900/30` (3 instances: no-access icon, expired modal icon, session warning modal icon)
- Replaced `bg-red-50` → `bg-red-50 dark:bg-red-950` (2 instances: expired modal message box, session warning message box)
- Replaced `bg-amber-100` → `bg-amber-100 dark:bg-amber-900/30` (1 instance: countdown modal icon)
- Replaced `border-red-200` → `border-red-200 dark:border-red-800` (5 instances: modal borders, message box borders, logout button border)
- Replaced `border-amber-200` → `border-amber-200 dark:border-amber-800` (1 instance: countdown modal border)
- Replaced `bg-blue-100` → `bg-blue-100 dark:bg-blue-900/30` (1 instance: not-logged-in icon background)
- Replaced `text-red-700` → `text-red-700 dark:text-red-400` (2 instances: session warning message text)
- Added `dark:text-red-400` to `text-red-600` labels (4 instances: AlertTriangle icon, TimerOff icon, ShieldAlert/Smartphone icons, logout button text)
- Replaced `bg-slate-800 text-white hover:bg-slate-700` → `bg-primary text-primary-foreground hover:bg-primary/90` (1 instance: "Kembali ke Beranda" button)
- Added `dark:text-amber-400` to amber-colored text (2 instances: AlertTriangle icon, countdown number)
- Added `dark:hover:bg-red-950` to logout button hover state
- Kept intentionally colored accent buttons unchanged (blue login, red/amber action buttons)
- Did NOT change `style={{ backgroundColor: 'var(--app-content-bg)' }}` or `style={{ backgroundColor: 'var(--app-popup-bg)' }}` lines

Stage Summary:
- All hardcoded light-only Tailwind color classes in dashboard-layout.tsx now have proper dark mode variants
- Semantic color tokens (bg-background, text-foreground, text-muted-foreground, bg-primary, text-primary-foreground) used where appropriate
- Dark mode variants added for all red/amber/blue accent backgrounds, borders, and text
- No TypeScript or lint errors introduced by changes

---
Task ID: 7
Agent: Main Agent
Task: Fix login/page.tsx and inline-login.tsx hardcoded colors for dark mode support

Work Log:
- Fixed `src/app/login/page.tsx`:
  - Replaced `bg-slate-50` → `bg-background` (2 instances: Suspense fallback, isRedirecting state)
  - Replaced `bg-white rounded-2xl` → `bg-card rounded-2xl` (3 instances: main card, forgot password dialog, demo popup)
  - Replaced `text-slate-800` → `text-foreground` (4 instances: app name, "Pendaftaran Berhasil!", "Lupa Password?", "Akun Demo")
  - Replaced `text-slate-700` → `text-foreground` (11 instances: all form labels, demo popup message text)
  - Replaced `text-slate-500` → `text-muted-foreground` (8 instances: tagline, back button, "belum punya akun", "sudah punya akun", forgot password subtitle, back-to-login links)
  - Replaced `text-slate-400` → `text-muted-foreground` (15 instances: icon placeholders, hint text, copyright, close button, validation hints)
  - Replaced `text-slate-600 mt-2` → `text-slate-600 dark:text-slate-300 mt-2` (1 instance: registration success message)
  - Replaced `hover:text-slate-600` → `hover:text-slate-600 dark:hover:text-slate-300` (5 instances: eye toggle buttons, close button)
  - Replaced `hover:text-slate-800` → `hover:text-foreground` (via text-slate-800 replace_all, 1 instance: back button hover)
  - Replaced `hover:text-slate-700` → `hover:text-foreground` (via text-slate-700 replace_all, 3 instances: tab inactive hover, back links)
  - Replaced `hover:bg-slate-100` → `hover:bg-slate-100 dark:hover:bg-slate-800` (1 instance: close button)
  - Replaced `border-slate-200` → `border-border` (3 instances: card border, tab divider, forgot password dialog border)
  - Replaced `border-slate-300` → `border-input` (7+ instances: all input borders, template literal fallback borders)
  - Replaced `bg-red-50 border` → `bg-red-50 dark:bg-red-950 border` (4 instances: error message boxes)
  - Replaced `border-red-200` → `border-red-200 dark:border-red-800` (4 instances: error box borders)
  - Replaced `text-red-700` → `text-red-700 dark:text-red-400` (4 instances: error message text)
  - Replaced `bg-green-50` → `bg-green-50 dark:bg-green-950` (2 instances: forgot password success/found boxes)
  - Replaced `border-green-200` → `border-green-200 dark:border-green-800` (2 instances)
  - Replaced `text-green-700` → `text-green-700 dark:text-green-400` (2 instances)
  - Replaced `text-green-800` → `text-green-800 dark:text-green-400` (1 instance: success heading)
  - Replaced `bg-green-100` → `bg-green-100 dark:bg-green-900/30` (1 instance: success checkmark circle)
  - Replaced `bg-amber-50 border` → `bg-amber-50 dark:bg-amber-950 border` (1 instance: demo popup message box)
  - Replaced `border-amber-200` → `border-amber-200 dark:border-amber-800` (2 instances: demo popup border, message box border)
  - Replaced `bg-amber-100` → `bg-amber-100 dark:bg-amber-900/30` (1 instance: demo popup icon)
  - Replaced `text-amber-700` → `text-amber-700 dark:text-amber-400` (1 instance: demo remaining days text)
  - Replaced `bg-blue-50/50` → `bg-blue-50/50 dark:bg-blue-900/20` (2 instances: tab active background)
  - Replaced `bg-blue-100` → `bg-blue-100 dark:bg-blue-900/30` (1 instance: forgot password icon background)
  - Replaced `text-blue-600` → `text-blue-600 dark:text-blue-400` (5 instances: tab active text, KeyRound icon, link buttons)
  - Replaced `hover:text-blue-700` → `hover:text-blue-700 dark:hover:text-blue-300` (3 instances: link button hovers)
  - Fixed gradient fallback: changed inline style with light-only gradient to conditional Tailwind gradient classes with dark mode support (`bg-gradient-to-br from-blue-50 via-white to-slate-100 dark:from-slate-900 dark:via-card dark:to-slate-900`)
  - Kept intentionally colored elements unchanged (blue submit buttons with `text-white`, amber "Ok" button, validation red borders)

- Fixed `src/components/inline-login.tsx`:
  - Same replacement patterns applied (smaller file, fewer instances)
  - Replaced `bg-white rounded-2xl` → `bg-card rounded-2xl` (2 instances: main card, demo popup)
  - Replaced `text-slate-800` → `text-foreground` (2 instances)
  - Replaced `text-slate-700` → `text-foreground` (8 instances)
  - Replaced `text-slate-500` → `text-muted-foreground` (5 instances)
  - Replaced `text-slate-400` → `text-muted-foreground` (9 instances)
  - Replaced `border-slate-200` → `border-border` (2 instances)
  - Replaced `border-slate-300` → `border-input` (8 instances)
  - Replaced `bg-red-50` → `bg-red-50 dark:bg-red-950` (2 instances)
  - Replaced `border-red-200` → `border-red-200 dark:border-red-800` (2 instances)
  - Replaced `text-red-700` → `text-red-700 dark:text-red-400` (2 instances)
  - Replaced `bg-amber-50` → `bg-amber-50 dark:bg-amber-950` (1 instance)
  - Replaced `border-amber-200` → `border-amber-200 dark:border-amber-800` (2 instances)
  - Replaced `bg-amber-100` → `bg-amber-100 dark:bg-amber-900/30` (1 instance)
  - Replaced `text-amber-700` → `text-amber-700 dark:text-amber-400` (1 instance)
  - Replaced `bg-blue-50/50` → `bg-blue-50/50 dark:bg-blue-900/20` (2 instances)
  - Replaced `text-blue-600` → `text-blue-600 dark:text-blue-400` (4 instances)
  - Replaced `hover:text-blue-700` → `hover:text-blue-700 dark:hover:text-blue-300` (2 instances)
  - Replaced `hover:text-slate-600` → `hover:text-slate-600 dark:hover:text-slate-300` (3 instances)
  - Added dark gradient: `bg-gradient-to-br from-blue-50 via-white to-slate-100 dark:from-slate-900 dark:via-card dark:to-slate-900`
  - Fixed `bg-amber-500` button that was incorrectly matched by `bg-amber-50` replace_all (restored to original)

Stage Summary:
- All hardcoded light-only Tailwind color classes in login/page.tsx and inline-login.tsx now have proper dark mode variants
- Semantic color tokens (bg-background, bg-card, text-foreground, text-muted-foreground, border-border, border-input) used where appropriate
- Login page gradient now works in both light and dark modes using Tailwind classes instead of inline styles for fallback
- Intentionally colored elements (blue buttons, amber brand buttons, validation borders) preserved as-is
- No new lint errors introduced by changes

---
Task ID: 8
Agent: Main Agent
Task: Add dark mode (Mode Gelap) toggle to Pengaturan Tampilan tab

Work Log:
- Created NextThemesProvider wrapper component at `/src/components/providers/next-themes-provider.tsx`
- Updated root layout (`/src/app/layout.tsx`) to wrap app with NextThemesProvider (attribute="class", defaultTheme="light", enableSystem=false)
- Updated custom ThemeProvider (`/src/contexts/theme-context.tsx`) to coordinate with next-themes:
  - Uses `useTheme()` from next-themes to sync dark mode
  - On init, reads `theme_dark_mode` setting from API and applies via `setTheme()`
  - On theme change, clears inline style overrides for dark mode so .dark CSS vars take effect
  - Added `clearInlineOverridesForDarkMode()` function to remove all inline `--app-*` variable overrides
  - Added `DARK_MODE_CLEARED_VARS` array listing all variables that should be cleared in dark mode
- Added dark mode toggle UI to Pengaturan Tampilan tab in settings page:
  - Toggle switch with Moon/Sun icons
  - Uses `useTheme()` from next-themes to control theme
  - `darkMode` state synced with `setTheme()`
  - On toggle: clears inline overrides for dark mode, re-applies colors for light mode
- Updated `handleSaveTampilan` to save `theme_dark_mode` setting to API
- Updated `handleResetColors` to reset dark mode to false/light
- Updated `fetchColorSettings` to load dark mode setting first (before applying colors)
- Updated all `applySidebarColor/applyBgColor/applyPopupColor/applyBannerColor/applyLoginColor` functions to check `isDarkActive()` and skip inline style overrides when dark mode is active
- Fixed ColorPicker selected state: added `dark:border-blue-400 dark:ring-blue-800`
- Fixed various color icons in ColorPicker for dark mode (popup, banner, login)
- Fixed Landmark icon: added `dark:text-teal-400`
- Fixed fallback logo background: conditional dark/light color
- Fixed AlertTriangle icon in dashboard-layout: added `dark:text-blue-400`
- Fixed login page: don't override `--app-login-bg` in dark mode
- Existing `.dark` CSS variables in globals.css already include all `--app-*` variables

Stage Summary:
- Dark mode feature fully implemented in Pengaturan Tampilan tab
- Uses next-themes for class-based dark mode toggling
- Persists dark mode preference to API settings (key: theme_dark_mode)
- When dark mode is active, inline style overrides are cleared so .dark CSS variables take effect
- When switching back to light mode, saved color settings are re-applied
- All key UI components already had dark mode support from previous work (sidebar, dashboard-layout, login page)

---
Task ID: 9
Agent: Main Agent
Task: Fix dark mode not applying on landing page and login page

Work Log:
- Identified root cause: ThemeProvider only applied dark mode when user was authenticated, so landing/login pages never got dark mode
- Updated ThemeProvider (`src/contexts/theme-context.tsx`):
  - Added localStorage key `darrellsoft_dark_mode` to persist dark mode preference
  - For non-authenticated pages, now reads localStorage and applies dark mode via `setTheme()`
  - When authenticated user has dark mode setting, also saves to localStorage
  - Exported new `persistDarkMode()` function for settings page to call
- Updated settings page (`src/app/administrasi/pengaturan/page.tsx`):
  - Added `persistDarkMode()` import from theme-context
  - Called `persistDarkMode()` in 3 places: save handler, toggle handler, reset handler
- Updated landing page (`src/app/page.tsx`) with 73 `dark:` variant additions:
  - Main wrapper: `dark:from-stone-950 dark:via-stone-950 dark:to-stone-950`
  - Navbar: `dark:bg-stone-900/80`, `dark:border-stone-800`, `dark:text-blue-300`, `dark:text-gray-400`, `dark:hover:text-blue-400`, `dark:hover:bg-stone-800`, `dark:bg-gray-300` (hamburger), `dark:bg-stone-900` (mobile menu)
  - Hero: `dark:bg-blue-900/10` (decorations), `dark:text-gray-100` (headings), `dark:text-gray-400` (paragraphs), `dark:text-blue-400` (blue text), trust signals converted from inline `color:'#000'` to `text-gray-900 dark:text-gray-100`, `dark:border-stone-800` (image), `dark:bg-card dark:border-stone-700` (floating badges)
  - Fitur/Keunggulan/Cara Kerja/Testimoni/FAQ sections: `dark:bg-stone-950` backgrounds, `dark:bg-card` for cards, `dark:text-gray-100/300/400` for text hierarchy
  - FeatureCard/TestimonialCard: `dark:bg-card`, proper dark text variants
  - Sections already dark (Stats, Pricing, CTA, Footer) left unchanged
- Updated login page (`src/app/login/page.tsx`):
  - Added `useTheme` import from next-themes
  - Added `resolvedTheme` and `isDark` state tracking
  - Fixed `loginBgColor` override: when dark mode is active, inline background style is NOT applied, letting dark gradient take effect
  - Condition: `!loginBgColor || isDark` for gradient classes, `loginBgColor && !isDark` for inline style

Stage Summary:
- Dark mode now applies on ALL pages including landing and login (not just authenticated pages)
- Dark mode preference persisted in localStorage for cross-page consistency
- Landing page fully supports dark mode with 73 dark: variants added
- Login page properly skips custom login background color when dark mode is active
- Settings page saves dark mode preference to both API and localStorage

---
Task ID: 10
Agent: Main Agent
Task: Fix dark mode to be true black everywhere - "klo dark mode harusnya hitam semua. kotaknya juga bikin hitam"

Work Log:
- Updated globals.css .dark CSS variables: changed from warm stone colors (#1c1917, #292524) to true black (#000000 background, #111111 cards)
  - --background: #000000, --card: #111111, --popover: #111111
  - --app-content-bg: #000000, --app-popup-bg: #111111, --app-banner-bg: #111111
  - --app-sidebar-bg: #111111, --app-login-bg: #000000
  - --sidebar: #111111, --secondary: #1a1a1a, --muted: #1a1a1a
- Added comprehensive global CSS dark mode overrides in globals.css:
  - .dark .bg-slate-50 / .bg-gray-50 → #1a1a1a
  - .dark .bg-slate-50/60, /80 → rgba(26,26,26,0.6)
  - .dark .bg-slate-100 / .bg-gray-100 → #1a1a1a
  - .dark .border-slate-200 / .border-gray-200 → rgba(255,255,255,0.1)
  - .dark .border-slate-300 / .border-gray-300 → rgba(255,255,255,0.15)
  - .dark .border-slate-100 → rgba(255,255,255,0.06)
  - .dark .divide-slate-100/200 → dark border colors
  - .dark .text-slate-800 → #e2e8f0, .text-slate-700 → #cbd5e1, .text-slate-600 → #94a3b8
  - .dark .text-gray-900 → #f1f5f9, .text-gray-800 → #e2e8f0, etc.
  - .dark input.bg-white / select.bg-white → #1a1a1a with light text
  - .dark .hover\:bg-slate-50:hover → dark hover
- Fixed landing page (page.tsx): replaced all stone-950 with black, stone-900 with black, stone-800 with white/10
  - FeatureCard/TestimonialCard: dark:bg-[#111]
  - Floating badges: dark:bg-[#111] dark:border-white/10
  - Sections: dark:bg-black
  - Navbar: dark:bg-black/80 dark:border-white/10
  - Advantage cards: dark:bg-[#111] dark:border-white/10
  - FAQ cards: dark:bg-[#111] dark:border-white/10
- Fixed login page: dark:from-black dark:via-[#111] dark:to-black
- Fixed sidebar: rgba(255,255,255,0.08) → var(--app-sidebar-active-bg)
- Fixed bg-white containers across ALL dashboard pages (25 pages): bg-white → bg-card on card/container divs
  - Batch 1: hitung-cetakan, hitung-ongkos-cetak, hitung-harga-kertas, hitung-finishing, potong-kertas
  - Batch 2: pembukaan, riwayat, riwayat-pembelian, invoice-editor, surat-jalan-editor, purchase-order-editor
  - Batch 3: master-harga-kertas, master-ongkos-cetak, master-finishing, master-customer, master-toko-pemasok, administrasi, hak-akses, pengguna, keamanan, reset-password
  - Also fixed: document-editor-layout, history-table, company-fields (dokupro components)
- Fixed pengguna page: tab triggers dark:data-[state=active]:bg-[#111], TabsList dark:bg-[#1a1a1a]
- Fixed filter buttons on pembukaan, riwayat, riwayat-pembelian: dark:bg-[#1a1a1a] dark:text-slate-400 dark:border-white/10
- All 25 pages compile and return 200 status

Stage Summary:
- Dark mode now uses TRUE BLACK backgrounds (#000000) with #111111 for cards/containers
- Global CSS overrides handle common hardcoded Tailwind light-mode classes automatically
- All dashboard pages' card containers now use bg-card which switches between white (#ffffff) and dark (#111111)
- Border, text, and background colors all properly invert in dark mode
- Print preview areas remain white for proper printing
- Toggle knobs and small UI elements preserved with appropriate colors
