export type DocumentType = 'dashboard' | 'invoice' | 'surat-jalan' | 'purchase-order' | 'spk' | 'settings';

export interface DocumentItem {
  id: string;
  deskripsi: string;
  qty: number;
  satuan: string;
  harga: number; // Only for invoice & PO
}

export interface CompanyInfo {
  nama: string;
  telepon: string;
  alamat: string;
  email: string;
  npwp?: string;
  website?: string;
  ppn?: number;
  logo?: string; // base64 data URL
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  bankName2?: string;
  bankAccount2?: string;
  bankHolder2?: string;
}

export interface SignatureInfo {
  namaPenandatangan: string;
  jabatan: string;
}

export interface CompanySettings {
  company: CompanyInfo;
  signature: SignatureInfo;
}

export type CaraPembayaran = 'cash' | 'transfer' | 'giro';

export interface InvoiceData {
  type: 'invoice' | 'invoice-pelunasan';
  company: CompanyInfo;
  nomor: string;
  tanggal: string;
  referensi: string;
  client: {
    nama: string;
    kontak: string;
    alamat: string;
  };
  items: DocumentItem[];
  ppn: number; // percentage
  dp: number; // down payment percentage
  dpAmount?: number; // fixed DP nominal amount (saved so it doesn't change when items are added)
  catatan: string;
  tanggalJatuhTempo: string; // due date (empty = no due date)
  caraPembayaran: CaraPembayaran | ''; // payment method
  tanggalGiro: string; // giro date (only used when caraPembayaran === 'giro')
  lunas?: boolean; // whether final payment has been made
  tanggalPelunasan?: string; // date of final payment
  referensiInvoiceNomor?: string; // Nomor of the parent DP invoice (only for invoice-pelunasan type)
}

export interface SuratJalanData {
  type: 'surat-jalan';
  company: CompanyInfo;
  nomor: string;
  tanggal: string;
  referensi: string;
  penerima: {
    nama: string;
    kontak: string;
    alamat: string;
  };
  items: DocumentItem[];
  noKendaraan: string;
  pengemudi: string;
  catatan: string;
}

export interface PurchaseOrderData {
  type: 'purchase-order';
  company: CompanyInfo;
  nomor: string;
  tanggal: string;
  referensi: string;
  pemasok: {
    nama: string;
    jenisBarang: string;
    kontak: string;
    alamat: string;
  };
  items: DocumentItem[];
  ppn: number;
  catatan: string;
  tanggalJatuhTempo: string; // due date (empty = no due date / not yet set)
  riwayatPotongKertasId?: string;
}

export interface SPKData {
  type: 'spk';
  company: CompanyInfo;
  nomor: string;
  tanggal: string;
  referensi: string;
  penerima: {
    nama: string;
    kontak: string;
    alamat: string;
  };
  items: DocumentItem[];
  tanggalMulai: string;
  tanggalSelesai: string;
  lingkupPekerjaan: string;
  catatan: string;
}

export type AnyDocumentData = InvoiceData | SuratJalanData | PurchaseOrderData | SPKData;

export const DEFAULT_COMPANY: CompanyInfo = {
  nama: 'PT Karya Mandiri Sejahtera',
  telepon: '(021) 555-0199',
  alamat: 'Jl. Merdeka No. 12, Jakarta Pusat 10110',
  email: 'halo@karyamandiri.co.id',
  npwp: '',
  website: '',
  ppn: 11,
  logo: '',
};

export const DEFAULT_SIGNATURE: SignatureInfo = {
  namaPenandatangan: '',
  jabatan: '',
};

export const DEFAULT_SETTINGS: CompanySettings = {
  company: { ...DEFAULT_COMPANY },
  signature: { ...DEFAULT_SIGNATURE },
};

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. http://0.0.0.0)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createDefaultItem(): DocumentItem {
  return {
    id: generateId(),
    deskripsi: '',
    qty: 1,
    satuan: 'pcs',
    harga: 0,
  };
}

export function createDefaultInvoice(): InvoiceData {
  return {
    type: 'invoice',
    company: { ...DEFAULT_COMPANY },
    nomor: `INV/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}/0001`,
    tanggal: getToday(),
    referensi: '',
    client: { nama: '', kontak: '', alamat: '' },
    items: [createDefaultItem()],
    ppn: 11,
    dp: 0,
    catatan: '',
    tanggalJatuhTempo: '',
    caraPembayaran: '',
    tanggalGiro: '',
  };
}

export function createDefaultSuratJalan(): SuratJalanData {
  return {
    type: 'surat-jalan',
    company: { ...DEFAULT_COMPANY },
    nomor: `SJ/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}/0001`,
    tanggal: getToday(),
    referensi: '',
    penerima: { nama: '', kontak: '', alamat: '' },
    items: [createDefaultItem()],
    noKendaraan: 'B 1234 XYZ',
    pengemudi: 'Nama pengemudi',
    catatan: '',
  };
}

export function createDefaultPurchaseOrder(): PurchaseOrderData {
  return {
    type: 'purchase-order',
    company: { ...DEFAULT_COMPANY },
    nomor: `PO/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}/0001`,
    tanggal: getToday(),
    referensi: '',
    pemasok: { nama: '', jenisBarang: '', kontak: '', alamat: '' },
    items: [createDefaultItem()],
    ppn: 11,
    catatan: '',
    tanggalJatuhTempo: '',
    riwayatPotongKertasId: '',
  };
}

export function createDefaultSPK(): SPKData {
  return {
    type: 'spk',
    company: { ...DEFAULT_COMPANY },
    nomor: `SPK/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}/0001`,
    tanggal: getToday(),
    referensi: '',
    penerima: { nama: '', kontak: '', alamat: '' },
    items: [createDefaultItem()],
    tanggalMulai: '',
    tanggalSelesai: '',
    lingkupPekerjaan: 'Tuliskan ruang lingkup pekerjaan...',
    catatan: '',
  };
}

function getToday(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
