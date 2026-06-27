/**
 * Shared settings helpers — used by /api/settings and other routes that need
 * to distinguish GLOBAL system settings from PER-USER settings.
 *
 * Multi-tenant model:
 *  - `Setting` table       → global defaults & system-wide keys (key @unique)
 *  - `UserSetting` table   → per-user overrides (userId + key composite unique)
 *
 * Read merge:  UserSetting > Setting (fallback to global default)
 * Write:       system keys → Setting (global);  all other keys → UserSetting (per-user)
 */

/**
 * Exact system keys that are ALWAYS global (shared across all users).
 * These are admin/superadmin-managed and affect the whole deployment.
 */
export const SYSTEM_SETTING_KEYS: ReadonlySet<string> = new Set([
  'role_permissions',
  'custom_roles',
  'demo_days',
  'demo_message',
  'single_device',
  'single_device_message',
  'auto_logout_min',
  'logout_warning_sec',
  'auto_backup_days',
  'branding_default_v3',
  'appName',
  'currency',
])

/**
 * Prefixes for system keys (e.g. session_*, last_auto_backup_*, master_cleared_*).
 * Any key starting with one of these prefixes is treated as a GLOBAL system key.
 */
export const SYSTEM_SETTING_KEY_PREFIXES: readonly string[] = [
  'session_',
  'last_auto_backup_',
  'master_cleared_',
]

/**
 * Returns true if a setting key should be stored GLOBALLY (in `Setting`),
 * false if it should be stored PER-USER (in `UserSetting`).
 */
export function isSystemSettingKey(key: string): boolean {
  if (SYSTEM_SETTING_KEYS.has(key)) return true
  return SYSTEM_SETTING_KEY_PREFIXES.some((p) => key.startsWith(p))
}
