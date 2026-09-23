/**
 * Phone number helpers for registration (OTP + duplicate detection).
 *
 * Indonesian numbers can be written in several ways:
 *   081234567890 / +62 812-3456-7890 / 6281234567890 / 62 0812...
 * All of them refer to the same number, so duplicate checks and OTP
 * storage MUST normalize before comparing.
 */

/** Keep digits only (also strips '+', spaces, dashes, parentheses). */
export function digitsOnly(raw: string): string {
  return (raw || '').replace(/\D/g, '')
}

/**
 * Normalize an Indonesian phone number to the canonical 62xxxxxxxxxx form.
 * Returns '' when the input contains no digits.
 */
export function normalizePhone(raw: string): string {
  let p = digitsOnly(raw)
  if (!p) return ''
  // 62 0 812... (user typed country code followed by leading zero)
  if (p.startsWith('620') && p.length > 11) {
    p = '62' + p.slice(3)
  } else if (p.startsWith('0')) {
    p = '62' + p.slice(1)
  }
  return p
}

/**
 * All plausible stored variants of a phone number, used for duplicate
 * lookups against existing DB rows that may be stored in any format
 * (e.g. '081234567890' or '6281234567890').
 */
export function phoneVariants(raw: string): string[] {
  const set = new Set<string>()
  const normalized = normalizePhone(raw)
  const digits = digitsOnly(raw)
  if (normalized) set.add(normalized)
  if (digits) set.add(digits)
  // Existing rows are often stored in the 0-prefix form (0812...).
  // When the user types 62-format, also probe the 0-format so the
  // duplicate check catches both storage variants (and vice versa).
  if (normalized.startsWith('62') && normalized.length > 10) {
    set.add('0' + normalized.slice(2))
  }
  return Array.from(set)
}

/** Mask a phone number for display: 62812****7890 */
export function maskPhone(raw: string): string {
  const p = normalizePhone(raw)
  if (p.length < 6) return p
  return `${p.slice(0, 5)}****${p.slice(-4)}`
}
