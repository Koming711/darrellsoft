import { create } from 'zustand';
import { authFetch } from '@/lib/auth-fetch';
import {
  DocumentType,
  InvoiceData,
  SuratJalanData,
  PurchaseOrderData,
  SPKData,
  AnyDocumentData,
  CompanySettings,
  CompanyInfo,
  createDefaultInvoice,
  createDefaultSuratJalan,
  createDefaultPurchaseOrder,
  createDefaultSPK,
  DEFAULT_SETTINGS,
} from './types';

const STORAGE_KEYS: Record<string, string> = {
  invoice: 'dokupro-invoice',
  'surat-jalan': 'dokupro-surat-jalan',
  'purchase-order': 'dokupro-purchase-order',
  spk: 'dokupro-spk',
  settings: 'dokupro-settings',
};

// Always return defaults on server to avoid hydration mismatch
function loadFromStorage<T>(key: string, fallback: T): T {
  return fallback;
}

function saveToStorage<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

interface DokuproState {
  activePage: DocumentType;
  setActivePage: (page: DocumentType) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  hydrated: boolean;
  companyLoaded: boolean;

  invoice: InvoiceData;
  setInvoice: (data: InvoiceData | ((prev: InvoiceData) => InvoiceData)) => void;
  invoiceEditingId: string | null;
  setInvoiceEditingId: (id: string | null) => void;

  suratJalan: SuratJalanData;
  setSuratJalan: (data: SuratJalanData | ((prev: SuratJalanData) => SuratJalanData)) => void;

  purchaseOrder: PurchaseOrderData;
  setPurchaseOrder: (data: PurchaseOrderData | ((prev: PurchaseOrderData) => PurchaseOrderData)) => void;

  spk: SPKData;
  setSPK: (data: SPKData | ((prev: SPKData) => SPKData)) => void;

  settings: CompanySettings;
  setSettings: (data: CompanySettings | ((prev: CompanySettings) => CompanySettings)) => void;

  syncSettingsToDocuments: () => void;
  resetDocument: (type: DocumentType) => void;
  getActiveDocument: () => AnyDocumentData | null;
  hydrate: () => void;
  loadCompanyFromAPI: () => Promise<void>;
}

// Read from localStorage (client-only)
function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return fallback;
}

// Clean up old/incompatible data from localStorage
function cleanOldStorage() {
  if (typeof window === 'undefined') return;
  const DOKUPRO_VERSION = 'v16';
  const versionKey = 'dokupro-version';

  try {
    const currentVersion = localStorage.getItem(versionKey);
    if (currentVersion !== DOKUPRO_VERSION) {
      // Version mismatch — clear all dokupro data and start fresh
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
      localStorage.setItem(versionKey, DOKUPRO_VERSION);
    }
  } catch {
    // ignore
  }
}

// --- Synchronous client-side preload of the user's saved company ---
// This ELIMINATES the ~1s flash of the hardcoded DEFAULT_COMPANY
// ("PT Karya Mandiri Sejahtera") that appeared between the store's initial
// creation (which used createDefaultInvoice() → DEFAULT_COMPANY) and the
// async loadCompanyFromAPI() call inside useEffect.
//
// On the server this returns DEFAULT_SETTINGS (no localStorage), so SSR is safe.
// On the client, it reads the previously-saved settings from localStorage so the
// very first paint already shows the user's real company (e.g. "Rajabowl").
function initClientSettings(): CompanySettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  cleanOldStorage();
  const saved = readStorage<CompanySettings>(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS });
  return saved;
}

const initialSettings: CompanySettings = initClientSettings();
const initialCompany: CompanyInfo =
  initialSettings.company?.nama
    ? { ...initialSettings.company }
    : { ...DEFAULT_SETTINGS.company };

// Create default documents but OVERRIDE the company with the user's saved
// company (from localStorage). This prevents the flash on first paint.
function createInitialInvoice(): InvoiceData {
  const inv = createDefaultInvoice();
  inv.company = { ...initialCompany };
  if (typeof initialCompany.ppn === 'number') inv.ppn = initialCompany.ppn;
  return inv;
}
function createInitialSuratJalan(): SuratJalanData {
  const sj = createDefaultSuratJalan();
  sj.company = { ...initialCompany };
  return sj;
}
function createInitialPurchaseOrder(): PurchaseOrderData {
  const po = createDefaultPurchaseOrder();
  po.company = { ...initialCompany };
  if (typeof initialCompany.ppn === 'number') po.ppn = initialCompany.ppn;
  return po;
}
function createInitialSPK(): SPKData {
  const spk = createDefaultSPK();
  spk.company = { ...initialCompany };
  return spk;
}

export const useDokuproStore = create<DokuproState>((set, get) => ({
  activePage: 'dashboard',
  setActivePage: (page) => set({ activePage: page }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => {
    const next = !state.sidebarCollapsed;
    saveToStorage('dokupro-sidebar-collapsed', next);
    return { sidebarCollapsed: next };
  }),

  hydrated: false,
  // Mark as loaded if we already have a real company name from localStorage —
  // this prevents editors from showing a loading state unnecessarily.
  companyLoaded: Boolean(initialSettings.company?.nama),

  invoice: createInitialInvoice(),
  invoiceEditingId: null,
  setInvoice: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.invoice) : data;
      saveToStorage(STORAGE_KEYS.invoice, newData);
      return { invoice: newData };
    });
  },
  setInvoiceEditingId: (id) => set({ invoiceEditingId: id }),

  suratJalan: createInitialSuratJalan(),
  setSuratJalan: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.suratJalan) : data;
      saveToStorage(STORAGE_KEYS['surat-jalan'], newData);
      return { suratJalan: newData };
    });
  },

  purchaseOrder: createInitialPurchaseOrder(),
  setPurchaseOrder: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.purchaseOrder) : data;
      saveToStorage(STORAGE_KEYS['purchase-order'], newData);
      return { purchaseOrder: newData };
    });
  },

  spk: createInitialSPK(),
  setSPK: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.spk) : data;
      saveToStorage(STORAGE_KEYS.spk, newData);
      return { spk: newData };
    });
  },

  settings: initialSettings,
  setSettings: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.settings) : data;
      saveToStorage(STORAGE_KEYS.settings, newData);
      return { settings: newData };
    });
  },

  hydrate: () => {
    const state = get();
    if (state.hydrated) return;
    // Clean old version data before loading
    cleanOldStorage();
    set({
      hydrated: true,
      sidebarCollapsed: readStorage('dokupro-sidebar-collapsed', false),
      invoice: readStorage(STORAGE_KEYS.invoice, createDefaultInvoice()),
      suratJalan: readStorage(STORAGE_KEYS['surat-jalan'], createDefaultSuratJalan()),
      purchaseOrder: readStorage(STORAGE_KEYS['purchase-order'], createDefaultPurchaseOrder()),
      spk: readStorage(STORAGE_KEYS.spk, createDefaultSPK()),
      settings: readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
    });
  },

  syncSettingsToDocuments: () => {
    const state = get();
    const company = state.settings.company;

    // Update invoice
    const inv = { ...state.invoice, company, ppn: company.ppn ?? state.invoice.ppn };
    saveToStorage(STORAGE_KEYS.invoice, inv);

    // Update surat jalan
    const sj = { ...state.suratJalan, company };
    saveToStorage(STORAGE_KEYS['surat-jalan'], sj);

    // Update purchase order
    const po = { ...state.purchaseOrder, company, ppn: company.ppn ?? state.purchaseOrder.ppn };
    saveToStorage(STORAGE_KEYS['purchase-order'], po);

    // Update SPK
    const spk = { ...state.spk, company };
    saveToStorage(STORAGE_KEYS.spk, spk);

    set({ invoice: inv, suratJalan: sj, purchaseOrder: po, spk });
  },

  resetDocument: (type) => {
    const state = get();
    const nextNumber = (currentNomor: string, prefix: string) => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()); // 4-digit year
      const newPrefix = `${prefix}/${month}/${year}/`;
      // If current nomor starts with same prefix (same month/year), increment the number
      let num = 1;
      if (currentNomor.startsWith(newPrefix)) {
        const parts = currentNomor.split('/');
        num = parseInt(parts[3], 10) || 1;
      }
      return `${newPrefix}${String(num + 1).padStart(4, '0')}`;
    };

    // Preserve the user's saved company settings across resets.
    // createDefaultInvoice/SuratJalan/etc. fall back to the hardcoded
    // DEFAULT_COMPANY ("PT Karya Mandiri Sejahtera"). When the user clicks
    // "Reset", they expect the FORM fields (nomor, tanggal, client, items,
    // catatan, dp, etc.) to be cleared — NOT their company identity to be
    // replaced by a stranger's default. So we re-apply the user's saved
    // company from settings (loaded via loadCompanyFromAPI) after reset.
    const savedCompany = state.settings?.company;
    const applyCompany = <T extends { company: CompanyInfo }>(doc: T): T => (
      savedCompany && savedCompany.nama
        ? { ...doc, company: { ...savedCompany } }
        : doc
    );

    switch (type) {
      case 'invoice': {
        const inv = applyCompany(createDefaultInvoice());
        inv.nomor = nextNumber(state.invoice.nomor, 'INV');
        // Keep PPN in sync with the user's saved company PPN setting
        if (savedCompany && typeof savedCompany.ppn === 'number') {
          inv.ppn = savedCompany.ppn;
        }
        saveToStorage(STORAGE_KEYS.invoice, inv);
        set({ invoice: inv, invoiceEditingId: null });
        break;
      }
      case 'surat-jalan': {
        const sj = applyCompany(createDefaultSuratJalan());
        sj.nomor = nextNumber(state.suratJalan.nomor, 'SJ');
        saveToStorage(STORAGE_KEYS['surat-jalan'], sj);
        set({ suratJalan: sj });
        break;
      }
      case 'purchase-order': {
        const po = applyCompany(createDefaultPurchaseOrder());
        po.nomor = nextNumber(state.purchaseOrder.nomor, 'PO');
        if (savedCompany && typeof savedCompany.ppn === 'number') {
          po.ppn = savedCompany.ppn;
        }
        saveToStorage(STORAGE_KEYS['purchase-order'], po);
        set({ purchaseOrder: po });
        break;
      }
      case 'spk': {
        const spk = applyCompany(createDefaultSPK());
        spk.nomor = nextNumber(state.spk.nomor, 'SPK');
        saveToStorage(STORAGE_KEYS.spk, spk);
        set({ spk: spk });
        break;
      }
    }
  },

  getActiveDocument: () => {
    const state = get();
    switch (state.activePage) {
      case 'invoice': return state.invoice;
      case 'surat-jalan': return state.suratJalan;
      case 'purchase-order': return state.purchaseOrder;
      case 'spk': return state.spk;
      default: return null;
    }
  },

  loadCompanyFromAPI: async () => {
    try {
      const keys = ['company_name', 'company_logo', 'company_address', 'company_email', 'company_phone', 'bank_name', 'bank_account', 'bank_holder', 'bank_name2', 'bank_account2', 'bank_holder2', 'npwp', 'ppn'];

      const results = await Promise.all(
        keys.map(k =>
          authFetch(`/api/settings?key=${k}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );

      // Check if we got any actual data from API
      const hasAnyData = results.some(r => r?.value);
      // Read LATEST state right before updating to avoid race conditions
      // (other async operations like auto-select from riwayatId may have updated the store)
      const state = get();
      if (!hasAnyData && state.companyLoaded) return;

      // Build CompanyInfo from settings, only override if value exists
      const currentCompany = state.settings.company;
      const company: CompanyInfo = {
        nama: results[0]?.value || currentCompany.nama,
        logo: results[1]?.value || currentCompany.logo,
        alamat: results[2]?.value || currentCompany.alamat,
        email: results[3]?.value || currentCompany.email,
        telepon: results[4]?.value || currentCompany.telepon,
        bankName: results[5]?.value || currentCompany.bankName,
        bankAccount: results[6]?.value || currentCompany.bankAccount,
        bankHolder: results[7]?.value || currentCompany.bankHolder,
        bankName2: results[8]?.value || currentCompany.bankName2,
        bankAccount2: results[9]?.value || currentCompany.bankAccount2,
        bankHolder2: results[10]?.value || currentCompany.bankHolder2,
        npwp: results[11]?.value || currentCompany.npwp,
        ppn: results[12]?.value ? parseFloat(results[12].value) : currentCompany.ppn,
        website: currentCompany.website,
      };

      const newSettings: CompanySettings = { ...state.settings, company };
      saveToStorage(STORAGE_KEYS.settings, newSettings);

      // Sync to all documents — use LATEST state to preserve any concurrent updates (e.g. auto-select from riwayatId)
      const inv = { ...state.invoice, company, ppn: company.ppn ?? state.invoice.ppn };
      const sj = { ...state.suratJalan, company };
      const po = { ...state.purchaseOrder, company, ppn: company.ppn ?? state.purchaseOrder.ppn };
      const spkData = { ...state.spk, company };

      saveToStorage(STORAGE_KEYS.invoice, inv);
      saveToStorage(STORAGE_KEYS['surat-jalan'], sj);
      saveToStorage(STORAGE_KEYS['purchase-order'], po);
      saveToStorage(STORAGE_KEYS.spk, spkData);

      set({
        companyLoaded: true,
        settings: newSettings,
        invoice: inv,
        suratJalan: sj,
        purchaseOrder: po,
        spk: spkData,
      });
    } catch {
      // silent — keep defaults
      set({ companyLoaded: true });
    }
  },
}));
