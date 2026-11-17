'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import type { CompanyInfo } from '@/lib/types';

/**
 * REKENING BANK & EMAIL LIVE — sumber kebenaran tunggal untuk info rekening
 * bank + email perusahaan yang ditampilkan pada dokumen (InvoicePreview /
 * PDF invoice).
 *
 * LATAR BELAKANG BUG (permintaan user):
 * Setiap dokumen invoice menyimpan SNAPSHOT `company` (termasuk rekening
 * bank & email) ke dataJson saat disimpan. Ketika Owner menghapus/mengosongkan
 * nomor rekening atau email di Pengaturan → Data Perusahaan, invoice lama TETAP
 * menampilkan nilai lama karena snapshot-nya beku — ditambah DEFAULT_COMPANY
 * lama berisi email dummy "halo@karyamandiri.co.id" yang ikut tertanam.
 *
 * FIX: saat RENDER (preview / JPG / cetak / PDF), field rekening bank + email
 * SELALU dioverride dengan nilai TERKINI dari /api/settings. Kosong di
 * pengaturan = tidak tampil di invoice. Data lain (nama, alamat, logo)
 * tetap memakai snapshot agar dokumen lama tidak berubah identitas.
 */

export const COMPANY_SETTINGS_UPDATED_EVENT = 'company-settings-updated';

export interface BankFields {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  bankName2: string;
  bankAccount2: string;
  bankHolder2: string;
  /** Email perusahaan TERKINI (Pengaturan → Data Perusahaan). Kosong = tidak tampil. */
  email: string;
}

const BANK_KEYS: Array<keyof BankFields> = [
  'bankName',
  'bankAccount',
  'bankHolder',
  'bankName2',
  'bankAccount2',
  'bankHolder2',
  'email',
];

const SETTING_KEY_OF: Record<keyof BankFields, string> = {
  bankName: 'bank_name',
  bankAccount: 'bank_account',
  bankHolder: 'bank_holder',
  bankName2: 'bank_name2',
  bankAccount2: 'bank_account2',
  bankHolder2: 'bank_holder2',
  email: 'company_email',
};

const CACHE_TTL_MS = 30_000;

let cache: { data: BankFields; at: number } | null = null;
let inflight: Promise<BankFields | null> | null = null;

/** Buang cache rekening live — dipanggil setelah user menyimpan pengaturan. */
export function invalidateLiveBankCache(): void {
  cache = null;
  inflight = null;
}

/**
 * Ambil field rekening bank + email perusahaan TERKINI milik user yang login.
 * Memakai SATU bulk GET /api/settings (merge global + per-user).
 * Return `null` bila gagal → caller TIDAK mengoverride snapshot.
 */
export async function fetchLiveBankFields(): Promise<BankFields | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await authFetch('/api/settings');
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (!Array.isArray(json)) return null;

      const map = new Map<string, string>();
      for (const item of json) {
        if (item?.key && typeof item.value === 'string') map.set(item.key, item.value);
      }

      const data = {} as BankFields;
      for (const f of BANK_KEYS) {
        const v = map.get(SETTING_KEY_OF[f]);
        data[f] = typeof v === 'string' ? v : '';
      }
      cache = { data, at: Date.now() };
      return data;
    } catch {
      // Gagal fetch (offline dll) → biarkan snapshot dipakai apa adanya.
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Gabungkan field rekening bank + email live ke snapshot company (yang ada di dokumen). */
export function applyLiveBank(company: CompanyInfo, live: BankFields | null): CompanyInfo {
  if (!live) return company;
  return { ...company, ...live };
}

/**
 * Hook React: field rekening bank + email terkini (null = belum termuat / gagal).
 * Otomatis segar setelah event `company-settings-updated` di-dispatch
 * oleh halaman Pengaturan.
 */
export function useLiveBankFields(): BankFields | null {
  const [fields, setFields] = useState<BankFields | null>(() => cache?.data ?? null);

  useEffect(() => {
    let alive = true;
    void fetchLiveBankFields().then((f) => {
      if (alive && f) setFields(f);
    });
    const onUpdated = () => {
      invalidateLiveBankCache();
      void fetchLiveBankFields().then((f) => {
        if (alive && f) setFields(f);
      });
    };
    window.addEventListener(COMPANY_SETTINGS_UPDATED_EVENT, onUpdated);
    return () => {
      alive = false;
      window.removeEventListener(COMPANY_SETTINGS_UPDATED_EVENT, onUpdated);
    };
  }, []);

  return fields;
}
