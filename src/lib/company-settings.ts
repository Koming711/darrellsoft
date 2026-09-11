import { authFetch } from '@/lib/auth-fetch';
import { DEFAULT_COMPANY, type CompanyInfo } from '@/lib/types';

/**
 * Ambil data toko (perusahaan) milik user yang sedang login dari /api/settings.
 * Dipakai sebagai fallback konten invoice untuk data riwayat LAMA yang tidak
 * menyimpan key `company` di dataJson — sehingga popup pratinjau & PDF WhatsApp
 * menampilkan logo/nama/alamat/bank toko user, bukan konten generik.
 */
const COMPANY_SETTING_KEYS = [
  'company_name',
  'company_logo',
  'company_address',
  'company_email',
  'company_phone',
  'bank_name',
  'bank_account',
  'bank_holder',
  'bank_name2',
  'bank_account2',
  'bank_holder2',
  'npwp',
  'ppn',
] as const;

export async function fetchUserCompany(): Promise<CompanyInfo> {
  try {
    const results = await Promise.all(
      COMPANY_SETTING_KEYS.map((k) =>
        authFetch(`/api/settings?key=${k}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );
    const val = (i: number): string => {
      const v = (results[i] as { value?: unknown } | null)?.value;
      return typeof v === 'string' ? v : '';
    };
    const ppnRaw = val(12);
    const ppnParsed = ppnRaw ? parseFloat(ppnRaw) : NaN;
    const company: CompanyInfo = {
      nama: val(0) || DEFAULT_COMPANY.nama,
      logo: val(1),
      alamat: val(2),
      email: val(3),
      telepon: val(4),
      bankName: val(5),
      bankAccount: val(6),
      bankHolder: val(7),
      bankName2: val(8),
      bankAccount2: val(9),
      bankHolder2: val(10),
      npwp: val(11),
      ppn: Number.isFinite(ppnParsed) ? ppnParsed : DEFAULT_COMPANY.ppn,
      website: '',
    };
    return company;
  } catch {
    return { ...DEFAULT_COMPANY };
  }
}
