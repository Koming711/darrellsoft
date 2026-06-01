# Task 7: Fix login/page.tsx and inline-login.tsx hardcoded colors for dark mode support

## Summary
Applied dark mode variants to all hardcoded light-only Tailwind color classes in both `src/app/login/page.tsx` and `src/components/inline-login.tsx`.

## Key Changes

### Semantic Token Replacements
- `bg-slate-50` → `bg-background`
- `bg-white` (card/container) → `bg-card`
- `text-slate-800` → `text-foreground`
- `text-slate-700` → `text-foreground`
- `text-slate-500` → `text-muted-foreground`
- `text-slate-400` → `text-muted-foreground`
- `border-slate-200` → `border-border`
- `border-slate-300` (input borders) → `border-input`

### Dark Mode Variant Additions
- Red backgrounds/borders/text: `dark:bg-red-950`, `dark:border-red-800`, `dark:text-red-400`
- Green backgrounds/borders/text: `dark:bg-green-950`, `dark:border-green-800`, `dark:text-green-400`, `dark:bg-green-900/30`
- Amber backgrounds/borders/text: `dark:bg-amber-950`, `dark:border-amber-800`, `dark:text-amber-400`, `dark:bg-amber-900/30`
- Blue accent backgrounds/text: `dark:bg-blue-900/20`, `dark:bg-blue-900/30`, `dark:text-blue-400`
- Slate hover states: `dark:hover:text-slate-300`, `dark:hover:bg-slate-800`

### Special Fixes
- **Gradient fallback**: Replaced inline style `linear-gradient(to bottom right, #EFF6FF, #ffffff, #f1f5f9)` with conditional Tailwind gradient classes + dark mode variants
- **text-slate-600**: Added `dark:text-slate-300` for standalone, `dark:hover:text-slate-300` for hover states
- **bg-amber-500 button**: Fixed false match from `bg-amber-50` replace_all that corrupted the Ok button class

### Preserved Elements
- Blue submit buttons (`bg-blue-600 text-white`)
- Amber "Ok" button (`bg-amber-500 text-white`)
- Validation error borders (`border-red-300`)
- Custom `loginBgColor` inline style behavior (still uses inline style when custom color is set)

## Verification
- Both files read back without errors
- No new lint errors introduced
- All original hardcoded light-only classes replaced with dark mode variants
