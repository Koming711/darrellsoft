import packageJson from '../../package.json';

/**
 * Versi aplikasi — sumber tunggal (single source of truth) dari package.json.
 * Naikkan versi dengan mengedit "version" di package.json.
 */
export const APP_VERSION: string = packageJson.version;
