import { create } from 'zustand';
import {
  DocumentType,
  InvoiceData,
  SuratJalanData,
  PurchaseOrderData,
  SPKData,
  AnyDocumentData,
  CompanySettings,
  createDefaultInvoice,
  createDefaultSuratJalan,
  createDefaultPurchaseOrder,
  createDefaultSPK,
  DEFAULT_SETTINGS,
} from './dokupro-types';

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

  invoice: InvoiceData;
  setInvoice: (data: InvoiceData | ((prev: InvoiceData) => InvoiceData)) => void;

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
  const DOKUPRO_VERSION = 'v6';
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

  invoice: createDefaultInvoice(),
  setInvoice: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.invoice) : data;
      saveToStorage(STORAGE_KEYS.invoice, newData);
      return { invoice: newData };
    });
  },

  suratJalan: createDefaultSuratJalan(),
  setSuratJalan: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.suratJalan) : data;
      saveToStorage(STORAGE_KEYS['surat-jalan'], newData);
      return { suratJalan: newData };
    });
  },

  purchaseOrder: createDefaultPurchaseOrder(),
  setPurchaseOrder: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.purchaseOrder) : data;
      saveToStorage(STORAGE_KEYS['purchase-order'], newData);
      return { purchaseOrder: newData };
    });
  },

  spk: createDefaultSPK(),
  setSPK: (data) => {
    set((state) => {
      const newData = typeof data === 'function' ? data(state.spk) : data;
      saveToStorage(STORAGE_KEYS.spk, newData);
      return { spk: newData };
    });
  },

  settings: { ...DEFAULT_SETTINGS },
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
      const parts = currentNomor.split('/');
      let num = 1;
      if (parts.length >= 3) {
        num = parseInt(parts[2], 10) || 1;
      }
      return `${prefix}/${new Date().getFullYear()}/${String(num + 1).padStart(4, '0')}`;
    };

    switch (type) {
      case 'invoice': {
        const inv = createDefaultInvoice();
        inv.nomor = nextNumber(state.invoice.nomor, 'INV');
        saveToStorage(STORAGE_KEYS.invoice, inv);
        set({ invoice: inv });
        break;
      }
      case 'surat-jalan': {
        const sj = createDefaultSuratJalan();
        sj.nomor = nextNumber(state.suratJalan.nomor, 'SJ');
        saveToStorage(STORAGE_KEYS['surat-jalan'], sj);
        set({ suratJalan: sj });
        break;
      }
      case 'purchase-order': {
        const po = createDefaultPurchaseOrder();
        po.nomor = nextNumber(state.purchaseOrder.nomor, 'PO');
        saveToStorage(STORAGE_KEYS['purchase-order'], po);
        set({ purchaseOrder: po });
        break;
      }
      case 'spk': {
        const spk = createDefaultSPK();
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
}));
