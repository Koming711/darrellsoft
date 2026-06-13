---
Task ID: 1
Agent: Main
Task: Fix checkout "Bayar Sekarang" to auto-redirect to beranda after payment success

Work Log:
- Fixed double-transaction bug: checkout page's handlePay was creating a transaction AND then PaymentDialog was creating another one. Changed handlePay to just open PaymentDialog (let PaymentDialog handle transaction creation)
- Modified PaymentDialog to auto-redirect to beranda after payment success (1.5s delay after showing success message)
- Changed checkout page's onSuccess callback to always redirect to /pembukaan (beranda)
- Verified webhook creates Pengguna + Pembeli records correctly for both mock and real payment modes
- Verified both homepage and checkout page render correctly via agent-browser

Stage Summary:
- "Bayar Sekarang" now opens PaymentDialog directly (no double-transaction)
- After successful payment (mock or real), user is auto-redirected to /pembukaan (beranda) after 1.5s
- Data from webhook creates both Pengguna and Pembeli records, so they appear in "halaman pengguna" and "tab pembeli"
- No compilation errors
---
Task ID: 1
Agent: Main
Task: Fix invoices with DP not appearing in Editor Pelunasan

Work Log:
- Analyzed the filtering logic across multiple files
- Found the root cause: filter required `dpPercent > 0 && !lunas && sisa > 0` which excluded invoices where sisa=0 (e.g., 100% DP) or where dpAmount was saved but dpPercent was 0
- Updated filter in invoice-pelunasan-editor.tsx: `(dpPercent > 0 || dp > 0) && !lunas`
- Updated filter in invoice/page.tsx PelunasanTab: same change for both pending and lunas filters
- Updated badge count filter in invoice/page.tsx InvoicePage component
- Updated isLunas logic in riwayat tab (mobile + desktop): for invoices with DP, only the explicit `lunas` flag determines paid status (not sisa <= 0)
- Updated isLunas logic in pelunasan dialog: same business rule
- Verified fix with browser testing: invoices with DP now appear in Editor Pelunasan and Pelunasan tabs

Stage Summary:
- Business rule: "apabila ada dp, berarti belum lunas" — having DP = not yet fully paid
- Only the explicit `lunas` flag determines if an invoice with DP is fully paid
- The `sisa <= 0` auto-lunas logic no longer applies to invoices with DP
- For invoices without DP, the old `lunas || sisa <= 0` logic still applies
- JPG + WhatsApp functionality was already implemented from previous session

---
Task ID: 1
Agent: main
Task: Fix DP recalculation bug - when pelunasan adds items and marks lunas, DP should stay at original amount

Work Log:
- Analyzed the root cause: dpAmount was being recalculated from current total (which includes pelunasan additions) instead of preserving the original amount
- Fixed multiple code paths that incorrectly recalculated dpAmount:
  1. invoice/page.tsx handleStatusChange - was calculating dpAmount from current total
  2. invoice/page.tsx handleSimpanPelunasan - same issue
- Added `originalTotal` field to InvoiceData type to track total at first save
- Updated document-action-buttons.tsx to save dpAmount AND originalTotal at initial save
- Updated invoice-editor.tsx to save originalTotal and clear dpAmount when DP% changes
- Updated invoice-pelunasan-editor.tsx selectInvoice to detect incorrectly recalculated dpAmount
- Updated invoice-pelunasan-editor.tsx save to preserve originalTotal before item updates
- Updated all parseDocInfo functions to use originalTotal as fallback for dpAmount calculation
- Updated InvoicePreview to use originalTotal in dpAmount calculation
- Added manual DP amount override field in pelunasan editor for fixing wrong values

Stage Summary:
- Added `originalTotal` field to InvoiceData type for robust DP preservation
- All save paths now correctly save dpAmount and originalTotal
- DP is calculated from originalTotal (not current total) when dpAmount is not saved
- Pelunasan editor has manual DP amount field for correcting wrong values
- Existing data may still show wrong DP until re-saved through the pelunasan editor

---
Task ID: 2
Agent: main
Task: Fix DP recalculation bug permanently - always derive dpAmount from originalTotal

Work Log:
- Deleted image files: fitur-1.jpeg through fitur-5.jpeg, fitur-image.jpeg, fitur-small-1.jpeg, fitur-small-2.jpeg, invoice-editor-pelunasan-tab.png, invoice-editor-tab.png, invoice-page-riwayat-tab.png, invoice-pelunasan-tab.png, shot-sidebar-from-pembukaan.png (already deleted from previous session), and editor-pelunasan-verify.png
- Investigated DP recalculation bug in depth: traced data flow through database, API, and all frontend components
- Found root cause: previous fix relied on saved dpAmount values which could be stale/incorrect. The code checked `parsed.dpAmount !== undefined` and used the saved value even if it was wrong (recalculated from current total by older code)
- Applied comprehensive fix: changed ALL dpAmount calculations to ALWAYS derive from originalTotal instead of using saved dpAmount values:
  1. `parseDocInfo` in invoice/page.tsx - now always uses `originalTotal * dpPercent / 100`
  2. `parseDocInfo` in invoice-pelunasan-editor.tsx - same change
  3. `InvoicePreview` component - now derives dpAmount from originalTotal (only dpAmountOverride for real-time preview)
  4. `invoice-editor.tsx` dpAmount calculation - same change
  5. All save handlers now ALWAYS recalculate dpAmount from originalTotal (not just when undefined)
- Verified database data: dpAmount=1300000, originalTotal=2600000 for test invoice (correct values)
- Verified app compiles without errors

Stage Summary:
- dpAmount is now a DERIVED value (always = originalTotal * dpPercent / 100), never stored as a potentially-stale value
- This eliminates the possibility of incorrect dpAmount values from older saves
- For the example: invoice 2,600,000 with DP 50% → DP stays 1,300,000 even after adding ongkir 150,000
- Sisa pembayaran = newTotal - dpAmount = 2,750,000 - 1,300,000 = 1,450,000 (correct)
- dpAmountOverride is still used in pelunasan editor for real-time preview before saving
