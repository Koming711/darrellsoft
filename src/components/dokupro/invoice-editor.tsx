'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { useDokuproStore } from '@/lib/store';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { hasProfitAccess, hasManualPriceAccess } from '@/lib/permissions';
import { ItemsFields, type BarangOption } from './items-fields';
import type { BarangFormSavedItem } from '@/components/views/barang-form-dialog';
import { CustomerFormDialog, type CustomerFormSavedCustomer } from '@/components/views/customer-form-dialog';
import { InvoicePreview } from './invoice-preview';
import { DocumentEditorLayout } from './document-editor-layout';
import { DocumentActionButtons } from './document-action-buttons';
import { formatRupiah } from '@/lib/format';
import { getAuthHeaders } from '@/lib/auth';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/types';

interface CustomerItem {
  id: string;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface RiwayatCetakanItem {
  id: string;
  nomorUrut: string;
  printName: string;
  customerName: string;
  paperName: string;
  paperGrammage: string;
  cutWidth: string;
  cutHeight: string;
  quantity: string;
  jumlahPesanan: string;
  berapaMata: string;
  warna: string;
  machineName: string;
  ongkosCetak: number;
  machineName2: string;
  ongkosCetak2: number;
  totalPaperPrice: number;
  pricePerSheet: number;
  finishingNames: string;
  finishingCost: number;
  packingCost: number;
  shippingCost: number;
  otherCost: number;
  otherCost2: number;
  otherCostLabel: string;
  otherCostLabel2: string;
  glueCost: number;
  glueBorongan: number;
  subTotal: number;
  profitPercent: number;
  profitAmount: number;
  grandTotal: number;
  createdAt: string;
}


export function InvoiceEditor({ dpDisabled = false, onSaved }: { dpDisabled?: boolean; onSaved?: (id: string) => void }) {
  const invoice = useDokuproStore((s) => s.invoice);
  const setInvoice = useDokuproStore((s) => s.setInvoice);
  const resetDocument = useDokuproStore((s) => s.resetDocument);
  const loadCompanyFromAPI = useDokuproStore((s) => s.loadCompanyFromAPI);
  const invoiceEditingId = useDokuproStore((s) => s.invoiceEditingId);
  const setInvoiceEditingId = useDokuproStore((s) => s.setInvoiceEditingId);
  const searchParams = useSearchParams();
  const riwayatIdFromUrl = searchParams.get('riwayatId');
  const autoSelectDoneRef = useRef<string | null>(null); // track which riwayatId was auto-selected

  // Daftar barang milik customer terpilih (Master Barang per pelanggan)
  const [barangList, setBarangList] = useState<BarangOption[]>([]);
  // Izin grup: anggota tanpa centangan "Profit (Laba Invoice)" tidak melihat baris Profit
  const [bisaLihatProfit, setBisaLihatProfit] = useState(true);
  useEffect(() => { setBisaLihatProfit(hasProfitAccess()); }, []);
  // id customer yang cocok dengan nama "Kepada Yth" (null = belum memilih).
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);
  // Nama customer sebelumnya — untuk mendeteksi perubahan customer
  const prevClientNameRef = useRef<string>(invoice.client.nama);
  // Nama yang diisi otomatis oleh pemilihan referensi (hitung cetakan) —
  // perubahan nama dari alur ini TIDAK boleh mengosongkan item yang baru diisi.
  const autoFillNameRef = useRef<string>('');

  // ===== HARGA CUSTOMER =====
  // Izin ubah harga manual di invoice (Owner/non-grup bebas; anggota grup
  // butuh izin 'harga-customer'/'master-barang' dari Owner).
  const [bisaEditHarga, setBisaEditHarga] = useState(true);
  useEffect(() => { setBisaEditHarga(hasManualPriceAccess()); }, []);
  // Repricing tertunda: customer diganti sementara baris item masih berisi —
  // harga baris di-refresh begitu daftar barang customer baru termuat.
  const repricePendingRef = useRef(false);
  const repriceRowsRef = useRef<BarangOption[]>([]);
  // Baris yang harganya pernah diedit manual — menunggu konfirmasi user.
  const [repriceConfirmRows, setRepriceConfirmRows] = useState<string[] | null>(null);

  // ===== HARGA CUSTOMER: repricing baris saat customer diganti =====
  // Baris dicocokkan berdasar nama barang. Baris otomatis langsung dipakai
  // harga customer baru; baris yang harganya pernah diedit manual TIDAK
  // diubah otomatis — dikumpulkan untuk dialog konfirmasi.
  const jalankanReprice = useCallback((rows: BarangOption[]) => {
    repriceRowsRef.current = rows;
    const inv = useDokuproStore.getState().invoice;
    const manual = new Set<string>();
    let changed = 0;
    const items = inv.items.map((it) => {
      const d = it.deskripsi.trim().toLowerCase();
      if (!d) return it;
      const b = rows.find((r) => r.name.trim().toLowerCase() === d);
      if (!b) return it;
      if (it.manualHarga) {
        manual.add(it.deskripsi.trim());
        return it;
      }
      const harga = (b.customerPrice ?? b.standardPrice) || 0;
      const modal = b.hpp ?? 0;
      if (harga === it.harga && modal === (it.modal ?? 0)) return it;
      changed += 1;
      return { ...it, harga, modal, manualHarga: false };
    });
    setInvoice((prev) => ({ ...prev, items }));
    if (manual.size > 0) {
      setRepriceConfirmRows(Array.from(manual));
    } else if (changed > 0) {
      toast.info(`Harga ${changed} baris diperbarui mengikuti customer baru`);
    }
  }, [setInvoice, setRepriceConfirmRows]);

  // Riwayat cetakan dropdown state
  const [riwayatList, setRiwayatList] = useState<RiwayatCetakanItem[]>([]);
  const [referensiInput, setReferensiInput] = useState(invoice.referensi);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Customer dropdown state
  const [customerList, setCustomerList] = useState<CustomerItem[]>([]);
  const [clientInput, setClientInput] = useState(invoice.client.nama);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientTyping, setClientTyping] = useState(false);
  // Popup "Tambah Customer" (CustomerFormDialog — sama persis dgn Master Pelanggan)
  const [customerFormOpen, setCustomerFormOpen] = useState(false);

  const fetchRiwayatCetakan = useCallback(async () => {
    try {
      const res = await fetch('/api/riwayat-cetakan', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRiwayatList(data);
        return data;
      }
    } catch {
      // silently fail
    }
    return [];
  }, []);

  // Fetch customer list
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCustomerList(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadCompanyFromAPI() }, [loadCompanyFromAPI]);
  useEffect(() => { fetchRiwayatCetakan() }, [fetchRiwayatCetakan]);
  useEffect(() => { fetchCustomers() }, [fetchCustomers]);

  // Muat daftar barang milik customer terpilih (Master Barang per pelanggan).
  // Jika customer tidak dikenal / belum memilih, daftar barang = kosong.
  useEffect(() => {
    const nama = invoice.client.nama.trim().toLowerCase();
    const found = nama
      ? customerList.find((c) => c.name.trim().toLowerCase() === nama)
      : undefined;
    setMatchedCustomerId(found?.id ?? null);
    if (!found) {
      setBarangList([]);
      if (repricePendingRef.current) {
        repricePendingRef.current = false;
        // Customer bebas teks / tidak terdaftar → tidak ada harga khusus:
        // baris kembali memakai harga standar Master Produk.
        fetch('/api/items?active=1', { headers: getAuthHeaders() })
          .then((res) => (res.ok ? res.json() : { items: [] }))
          .then((data) => {
            const rows = Array.isArray(data?.items) ? data.items : [];
            jalankanReprice(rows.map((r: { id: string; name: string; unit: string; standardPrice: number; hpp: number | null; qty?: number }) => ({
              id: r.id,
              name: r.name,
              unit: r.unit || 'pcs',
              standardPrice: r.standardPrice || 0,
              customerPrice: null,
              hpp: r.hpp ?? null,
              qty: r.qty ?? 0,
            })));
          })
          .catch(() => {});
      }
      return;
    }
    let cancelled = false;
    // all=1 → SEMUA barang master tampil di dropdown (bukan hanya barang
    // terdaftar customer). Harga khusus customer yang aktif & berlaku sudah
    // dihitung server (customerPrice) — barang tanpa harga khusus otomatis
    // memakai harga standar Master Produk (aturan prioritas harga).
    fetch(`/api/items?customerId=${encodeURIComponent(found.id)}&active=1&all=1`, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.items) ? data.items : [];
        const mapped = rows.map((r: { id: string; name: string; unit: string; standardPrice: number; customerPrice?: number | null; hpp: number | null; qty?: number }) => ({
          id: r.id,
          name: r.name,
          unit: r.unit || 'pcs',
          standardPrice: r.standardPrice || 0,
          customerPrice: r.customerPrice ?? null,
          hpp: r.hpp ?? null,
          qty: r.qty ?? 0,
        }));
        setBarangList(mapped);
        if (repricePendingRef.current) {
          repricePendingRef.current = false;
          jalankanReprice(mapped);
        }
      })
      .catch(() => { if (!cancelled) setBarangList([]); });
    return () => { cancelled = true; };
  }, [invoice.client.nama, customerList, jalankanReprice]);

  // Barang BARU berhasil disimpan dari popup "Tambah Barang" (BarangFormDialog
  // — sama persis dgn Master Barang) di header Item. Bila barang terdaftar
  // untuk customer invoice ini → langsung masuk daftar dropdown nama barang.
  const handleBarangCreated = useCallback((saved: BarangFormSavedItem | null, customerId: string) => {
    if (!saved) return;
    if (customerId && customerId === matchedCustomerId) {
      const option: BarangOption = {
        id: saved.id,
        name: saved.name,
        unit: saved.unit || 'pcs',
        standardPrice: saved.standardPrice || 0,
        hpp: saved.hpp,
        qty: saved.qty ?? 0,
      };
      // Daftar dropdown kini memuat SEMUA barang master (all=1) — barang baru
      // bisa saja sudah ada di daftar: ganti entri lama, bukan menambah dobel.
      setBarangList((prev) => {
        const ada = prev.some((b) => b.id === option.id);
        return ada ? prev.map((b) => (b.id === option.id ? { ...b, ...option } : b)) : [...prev, option];
      });
    }
  }, [matchedCustomerId]);

  // Customer BARU berhasil disimpan dari popup "Tambah Customer" (CustomerFormDialog
  // — sama persis dgn Master Pelanggan). Segarkan daftar dropdown lalu pilih
  // otomatis customer baru utk invoice ini (kontak & alamat ikut terisi).
  const handleCustomerCreated = (saved: CustomerFormSavedCustomer | null) => {
    if (!saved) return;
    void fetchCustomers();
    setClientInput(saved.name);
    setClientTyping(false);
    setClientDropdownOpen(false);
    setInvoice((prev) => ({
      ...prev,
      client: {
        nama: saved.name,
        kontak: saved.phone || saved.email || '',
        alamat: saved.address || '',
      },
    }));
  };

  // Ganti customer → HARGA baris item di-refresh mengikuti customer baru
  // (baris TIDAK dikosongkan lagi — aturan Harga Customer):
  //  - baris otomatis → langsung pakai harga khusus/standar customer baru
  //  - baris yang harganya pernah diedit manual → minta konfirmasi dulu
  // Pengecualian: nama yang diisi otomatis oleh pemilihan referensi cetakan.
  useEffect(() => {
    const nama = invoice.client.nama.trim();
    const prev = prevClientNameRef.current.trim();
    if (nama !== prev) {
      prevClientNameRef.current = invoice.client.nama;
      if (autoFillNameRef.current && nama === autoFillNameRef.current.trim()) {
        // Diisi otomatis oleh applyReferensi — jangan repricing
        autoFillNameRef.current = '';
        return;
      }
      autoFillNameRef.current = '';
      if (invoice.items.some((it) => it.deskripsi.trim() !== '')) {
        // Tandai repricing tertunda — dieksekusi begitu daftar barang
        // customer baru termuat (efek fetch barang di atas).
        repricePendingRef.current = true;
      }
    }
  }, [invoice.client.nama, invoice.items, setInvoice]);

  // Fetch next Invoice number from server (only when creating new, not editing)
  const fetchNextNumber = useCallback(() => {
    // Read current editingId from store to avoid stale closure
    const currentEditingId = useDokuproStore.getState().invoiceEditingId;
    if (currentEditingId) return; // Don't overwrite nomor when editing
    fetch('/api/history?preview=next-number&docType=invoice', { headers: getAuthHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.nextNumber) setInvoice((prev) => ({ ...prev, nomor: data.nextNumber })) })
      .catch(() => {});
  }, [setInvoice]);

  useEffect(() => { fetchNextNumber() }, [fetchNextNumber]);

  // Re-fetch next number after a document is saved
  useEffect(() => {
    const handler = () => { fetchNextNumber() };
    window.addEventListener('dokupro:history-updated', handler);
    return () => { window.removeEventListener('dokupro:history-updated', handler) };
  }, [fetchNextNumber]);

  // Mode Regular (dpDisabled): paksa DP = 0 dan sembunyikan input DP
  useEffect(() => {
    if (dpDisabled) {
      setInvoice((prev) => (prev.dp === 0 ? prev : ({ ...prev, dp: 0 })));
    }
  }, [dpDisabled, setInvoice]);

  // Sync referensiInput when invoice.referensi changes externally
  useEffect(() => { setReferensiInput(invoice.referensi) }, [invoice.referensi]);
  // Sync clientInput when invoice.client.nama changes externally
  useEffect(() => { setClientInput(invoice.client.nama) }, [invoice.client.nama]);

  // Filter riwayat list — when dropdown is open show all, otherwise not used
  const filteredRiwayatList = riwayatList;

  const handleReferensiInputChange = (value: string) => {
    setReferensiInput(value);
    setInvoice((prev) => ({ ...prev, referensi: value }));
    setDropdownOpen(true);
  };

  // Apply referensi data using functional setInvoice to avoid stale closure
  const applyReferensi = (item: RiwayatCetakanItem) => {
    const ref = item.nomorUrut || item.printName || '';
    setReferensiInput(ref);

    // Build single item with multi-line description
    const descLines: string[] = [];
    if (item.printName) descLines.push(item.printName);

    const bahanParts: string[] = [];
    if (item.paperName) bahanParts.push(item.paperName);
    if (item.paperGrammage) bahanParts.push(item.paperGrammage + 'g');
    if (bahanParts.length > 0) descLines.push(bahanParts.join(' '));

    if (item.finishingNames) {
      const finishings = item.finishingNames.split(',').map(f => f.trim()).filter(Boolean);
      descLines.push('Finishing:');
      finishings.forEach(f => descLines.push(f));
    }

    const deskripsi = descLines.join('\n');
    const jumlahPesanan = parseInt(item.jumlahPesanan) || 1;
    const hargaPerPcs = jumlahPesanan > 0 ? Math.round(item.grandTotal / jumlahPesanan) : 0;

    const newItems: InvoiceData['items'] = [{
      id: 'riwayat-0',
      deskripsi: deskripsi || ref,
      qty: jumlahPesanan,
      satuan: 'pcs',
      harga: hargaPerPcs,
    }];

    // Tandai bahwa perubahan nama customer berikutnya berasal dari alur
    // referensi cetakan — jangan kosongkan item yang baru saja diisi.
    if (item.customerName) autoFillNameRef.current = item.customerName;

    // Use functional form to always get the LATEST state
    setInvoice((prev) => ({
      ...prev,
      referensi: ref,
      client: {
        ...prev.client,
        nama: item.customerName || prev.client.nama,
      },
      items: newItems,
      catatan: '',
      uangCapek: item.profitAmount || 0,
    }));
    setDropdownOpen(false);
  };

  const handleReferensiSelect = (item: RiwayatCetakanItem) => {
    applyReferensi(item);
  };

  // Auto-select referensi when coming from hitung cetakan with riwayatId
  // Fetches the specific riwayat directly by ID for reliability (no race condition with list loading)
  useEffect(() => {
    if (!riwayatIdFromUrl) return;
    if (autoSelectDoneRef.current === riwayatIdFromUrl) return;

    let cancelled = false;

    const fetchAndApply = async () => {
      // First, try to find it in the already-loaded list (fast path)
      const foundInList = riwayatList.find((r) => r.id === riwayatIdFromUrl);
      if (foundInList) {
        if (!cancelled) {
          autoSelectDoneRef.current = riwayatIdFromUrl;
          applyReferensi(foundInList);
        }
        return;
      }

      // Not in list yet — fetch directly by ID from the API (reliable path)
      try {
        const res = await fetch(`/api/riwayat-cetakan?id=${riwayatIdFromUrl}`, { headers: getAuthHeaders() });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data && !data.error) {
            autoSelectDoneRef.current = riwayatIdFromUrl;
            applyReferensi(data as RiwayatCetakanItem);
          }
        }
      } catch {
        // Fallback: retry once after a short delay
        if (cancelled) return;
        await new Promise(r => setTimeout(r, 800));
        if (cancelled) return;
        try {
          const res = await fetch(`/api/riwayat-cetakan?id=${riwayatIdFromUrl}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            if (data && !data.error) {
              autoSelectDoneRef.current = riwayatIdFromUrl;
              applyReferensi(data as RiwayatCetakanItem);
            }
          }
        } catch {
          // Give up silently
        }
      }
    };

    fetchAndApply();

    return () => { cancelled = true; };
  }, [riwayatIdFromUrl]);

  // Filter customer list (only when user is actively typing)
  const filteredCustomerList = useMemo(() =>
    clientTyping
      ? customerList.filter((c) => {
          const search = clientInput.toLowerCase().trim();
          if (!search) return true;
          return c.name.toLowerCase().includes(search) ||
                 (c.companyName || '').toLowerCase().includes(search) ||
                 (c.phone || '').toLowerCase().includes(search) ||
                 (c.address || '').toLowerCase().includes(search);
        })
      : customerList
  , [clientTyping, customerList, clientInput]);

  const handleClientInputChange = (value: string) => {
    setClientInput(value);
    setClientTyping(true);
    updateClient('nama', value);
    setClientDropdownOpen(true);
  };

  const handleClientSelect = (item: CustomerItem) => {
    setClientInput(item.name);
    setClientTyping(false);
    setInvoice((prev) => ({
      ...prev,
      client: {
        nama: item.name,
        kontak: item.phone || item.email || '',
        alamat: item.address || '',
      },
    }));
    setClientDropdownOpen(false);
  };

  // Pilih barang dari dropdown Master Barang customer → isi deskripsi + Qty
  // (dari master) + satuan + harga satuan + harga modal otomatis.
  // HARGA CUSTOMER: harga khusus customer yang aktif & berlaku PRIORITAS —
  // bila tidak ada, pakai harga standar master (aturan prioritas harga).
  const handlePickBarang = (itemIndex: number, barang: BarangOption) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (
        i === itemIndex
          ? {
              ...it,
              deskripsi: barang.name,
              satuan: barang.unit || it.satuan || 'pcs',
              qty: barang.qty > 0 ? barang.qty : it.qty,
              harga: (barang.customerPrice ?? barang.standardPrice) || 0,
              modal: barang.hpp ?? 0,
              manualHarga: false,
            }
          : it
      )),
    }));
  };

  // Konfirmasi: baris manual ikut memakai harga customer baru.
  const konfirmasiRepriceManual = () => {
    const rows = repriceRowsRef.current;
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (!it.manualHarga) return it;
        const d = it.deskripsi.trim().toLowerCase();
        const b = rows.find((r) => r.name.trim().toLowerCase() === d);
        if (!b) return it;
        return {
          ...it,
          harga: (b.customerPrice ?? b.standardPrice) || 0,
          modal: b.hpp ?? 0,
          manualHarga: false,
        };
      }),
    }));
    setRepriceConfirmRows(null);
    toast.success('Harga baris manual diperbarui mengikuti customer baru');
  };

  // Pertahankan harga manual (tidak jadi diganti).
  const pertahankanHargaManual = () => {
    setRepriceConfirmRows(null);
    toast.info('Harga manual dipertahankan');
  };

  const updateClient = (field: string, value: string) => {
    setInvoice((prev) => ({
      ...prev,
      client: { ...prev.client, [field]: value },
    }));
  };

  const subtotal = invoice.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const ppnAmount = subtotal * (invoice.ppn / 100);
  const total = subtotal + ppnAmount;
  // Profit: total (termasuk PPN) − HPP (snapshot modal per item). Fallback invoice
  // tanpa snapshot modal → pakai uangCapek (profit dari referensi hitung cetakan).
  // Selaras rumus Laba Kotor di beranda & laporan rugi-laba.
  const adaModal = invoice.items.some((it) => it.modal != null && it.modal > 0);
  const hppItems = invoice.items.reduce(
    (sum, it) => sum + (it.modal != null && it.modal > 0 ? it.qty * it.modal : 0),
    0
  );
  const profit = adaModal ? Math.max(0, total - hppItems) : invoice.uangCapek || 0;
  // DP: NOMINAL (Rp) adalah acuan utama — customer membayar sejumlah uang
  // (mis. "DP dulu 500rb"), persen hanyalah turunannya. Fallback: dihitung
  // dari persen (kompatibilitas data lama yang belum menyimpan dpAmount).
  const dpAmount = invoice.dpAmount !== undefined && invoice.dpAmount > 0
    ? invoice.dpAmount
    : total * ((invoice.dp || 0) / 100);
  const dpPercentDisplay = total > 0 && dpAmount > 0
    ? Math.round((dpAmount / total) * 10000) / 100
    : 0;
  const sisa = Math.max(0, total - dpAmount);

  // Input DP nominal: set dpAmount (Rp) + dp (persen turunan, dibulatkan 2
  // desimal — dipakai filter daftar pelunasan & label "DP (x%)" di dokumen).
  const handleDpNominalChange = (v: number) => {
    setInvoice((prev) => ({
      ...prev,
      dpAmount: v > 0 ? v : undefined,
      dp: v > 0 ? (total > 0 ? Math.round((v / total) * 10000) / 100 : 0) : 0,
    }));
  };

  // Input DP persen: set dp (persen) + dpAmount (nominal turunan dari total
  // saat ini) — perilaku lama tetap berfungsi.
  const handleDpPercentChange = (p: number) => {
    setInvoice((prev) => ({
      ...prev,
      dp: p,
      dpAmount: p > 0 ? total * (p / 100) : undefined,
    }));
  };

  // Saat DP diisi NOMINAL dan total berubah (item diedit), persen tersimpan
  // selalu disinkronkan terhadap total terkini.
  useEffect(() => {
    const amt = invoice.dpAmount ?? 0;
    if (amt <= 0) return;
    const pct = total > 0 ? Math.round((amt / total) * 10000) / 100 : 0;
    if ((invoice.dp || 0) !== pct) {
      setInvoice((prev) => ({ ...prev, dp: pct }));
    }
  }, [total, invoice.dpAmount, invoice.dp, setInvoice]);

  // Pratinjau langsung muncul begitu ada data inti (referensi dipilih /
  // customer terisi / ada barang) — tanpa tombol "Lihat Pratinjau A5".
  const hasPreviewData = Boolean(
    referensiInput.trim() ||
    invoice.client.nama.trim() ||
    invoice.items.some((it) => it.deskripsi.trim() !== '')
  );

  return (
    <>
      <DocumentEditorLayout
        title="Invoice"
        previewMode="inline-bottom"
        previewMaxWidth={560}
        previewContent={
          hasPreviewData ? (
            <InvoicePreview data={invoice} />
          ) : (
            <div className="flex min-h-[320px] w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <p className="max-w-[280px] text-sm text-slate-400">
                Pratinjau invoice akan muncul di sini setelah Anda memilih referensi (No. HC) atau customer.
              </p>
            </div>
          )
        }
        actions={
          <DocumentActionButtons
            docType="invoice"
            documentLabel="Invoice"
            currentData={invoice}
            onReset={() => resetDocument('invoice')}
            editingId={invoiceEditingId}
            onUpdateSuccess={() => setInvoiceEditingId(null)}
            showPrintActions={false}
            onSaved={onSaved}
          />
        }
      >
        {/* FORM 2 KOLOM (desktop) — KIRI: Detail Dokumen + Informasi Pembayaran +
            Kepada Yth, KANAN: Item + Informasi Tambahan. Kotak Data Perusahaan
            dihapus (data perusahaan diatur di halaman Pengaturan). */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-5 items-start">
        {/* ===== KOLOM KIRI ===== */}
        <div className="space-y-3 lg:space-y-5 min-w-0">
        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detail Dokumen
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">No. Invoice</Label>
              <Input
                value={invoice.nomor}
                readOnly
                className="bg-slate-50 text-slate-500 cursor-not-allowed text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={invoice.tanggal}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggal: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Referensi (No. HC)</Label>
            <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <PopoverAnchor asChild>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(true)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-slate-50 px-3 py-2 text-sm shadow-xs outline-none cursor-pointer hover:bg-slate-100 transition-colors text-left"
                >
                  <span className={referensiInput ? 'text-slate-900' : 'text-slate-400'}>
                    {referensiInput || 'Pilih No. HC...'}
                  </span>
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                className="p-0 w-[var(--radix-popover-trigger-width)] max-h-52 overflow-y-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {filteredRiwayatList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Riwayat Hitung Cetakan</div>
                    {filteredRiwayatList.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleReferensiSelect(r) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${invoice.referensi === r.nomorUrut ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="font-semibold text-xs text-emerald-700">{r.nomorUrut || '-'}</span>
                        <span className="ml-1.5 truncate">{r.printName || ''}</span>
                        {r.customerName && <span className="text-slate-400 ml-1.5 text-[11px]">({r.customerName})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {filteredRiwayatList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada riwayat cetakan</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Informasi Pembayaran - moved below Detail Dokumen */}
        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Pembayaran
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tgl. Jatuh Tempo</Label>
              <Input
                type="date"
                value={invoice.tanggalJatuhTempo}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggalJatuhTempo: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cara Pembayaran</Label>
              <div className="flex gap-1.5">
                {(['cash', 'transfer', 'giro'] as const).map((method) => {
                  const labels: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', giro: 'Giro' };
                  const isSelected = invoice.caraPembayaran === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setInvoice((prev) => ({
                        ...prev,
                        caraPembayaran: prev.caraPembayaran === method ? '' : method,
                        tanggalGiro: method === 'giro' && prev.caraPembayaran !== method ? prev.tanggalGiro : (method !== 'giro' ? '' : prev.tanggalGiro),
                      }))}
                      className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                        isSelected
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-offset-1 ring-emerald-400 shadow-sm'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {labels[method]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {invoice.caraPembayaran === 'giro' && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Tgl. Giro</Label>
              <Input
                type="date"
                value={invoice.tanggalGiro}
                onChange={(e) => setInvoice((prev) => ({ ...prev, tanggalGiro: e.target.value }))}
                className="text-sm"
              />
            </div>
          )}
          {invoice.tanggalJatuhTempo && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs text-amber-700">
                Jatuh tempo: <span className="font-semibold">{new Date(invoice.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kepada Yth :
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Nama Customer</Label>
              {/* Tombol Tambah Customer (permintaan owner): buka popup tambah
                  pelanggan SAMA PERSIS dgn halaman Master Pelanggan;
                  customer baru langsung terpilih utk invoice ini. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomerFormOpen(true)}
                title="Tambah pelanggan baru"
                className="h-7 text-xs"
              >
                <UserPlus className="mr-1 h-3 w-3" />
                Tambah Customer
              </Button>
            </div>
            <Popover open={clientDropdownOpen} onOpenChange={setClientDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik atau pilih customer..."
                    value={clientInput}
                    onChange={(e) => handleClientInputChange(e.target.value)}
                    onFocus={() => { setClientDropdownOpen(true); setClientTyping(false); }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] pr-9"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onMouseDown={(e) => { e.preventDefault(); setClientTyping(false); setClientDropdownOpen(!clientDropdownOpen); }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {filteredCustomerList.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Master Customer</div>
                    {filteredCustomerList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleClientSelect(c) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${invoice.client.nama === c.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <span className="truncate">{c.name}</span>
                        {c.companyName && <span className="text-slate-400 ml-1.5 text-[11px]">({c.companyName})</span>}
                        {(c.phone || c.address) && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.phone && <span>{c.phone}</span>}
                            {c.phone && c.address && <span> · </span>}
                            {c.address && <span className="truncate">{c.address}</span>}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {filteredCustomerList.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada data customer</div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nomor Telp</Label>
            <Input
              value={invoice.client.kontak}
              onChange={(e) => updateClient('kontak', e.target.value)}
              placeholder="No. telepon / email"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Alamat</Label>
            <Input
              value={invoice.client.alamat}
              onChange={(e) => updateClient('alamat', e.target.value)}
              placeholder="Alamat lengkap"
              className="text-sm"
            />
          </div>
        </div>
        </div>

        {/* ===== KOLOM KANAN ===== */}
        <div className="space-y-3 lg:space-y-5 min-w-0">
        <ItemsFields
          items={invoice.items}
          onChange={(items) =>
            setInvoice((prev) => {
              // HARGA CUSTOMER: tandai baris yang HARGANYA diubah manual di
              // invoice — baris manual tidak ikut repricing otomatis saat
              // customer diganti (minta konfirmasi dulu), dan statusnya
              // tersimpan di dokumen (DocumentItem.manualHarga).
              const hargaLama = new Map(prev.items.map((it) => [it.id, it.harga]));
              return {
                ...prev,
                items: items.map((it) =>
                  hargaLama.has(it.id) &&
                  hargaLama.get(it.id) !== it.harga &&
                  it.deskripsi.trim() !== ''
                    ? { ...it, manualHarga: true }
                    : it
                ),
              };
            })
          }
          showPrice
          showModal
          barangOptions={barangList}
          lockPrices={!bisaEditHarga}
          emptyBarangMessage={
            invoice.client.nama.trim()
              ? 'Belum ada barang di Master Produk — pakai tombol "Tambah Barang"'
              : 'Pilih customer terlebih dahulu'
          }
          onPickBarang={handlePickBarang}
          barangFormCustomers={customerList.map((c) => ({ id: c.id, name: c.name, companyName: c.companyName ?? null }))}
          barangFormCustomerFilter={matchedCustomerId ?? 'all'}
          barangFormLockedNote="Mengikuti customer pada invoice ini."
          onBarangCreated={handleBarangCreated}
        />

        <div className="rounded-lg border bg-card p-3 sm:p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informasi Tambahan
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs">PPN (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={invoice.ppn || ''}
              onChange={(e) => setInvoice((prev) => ({ ...prev, ppn: e.target.value === '' ? 0 : Number(e.target.value) || 0 }))}
              className="text-sm"
            />
          </div>
          {!dpDisabled && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">DP Dibayar (Rp)</Label>
                <Input
                  type="number"
                  min={0}
                  value={dpAmount > 0 ? Math.round(dpAmount) : ''}
                  onChange={(e) => handleDpNominalChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0))}
                  placeholder="mis. 500000"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">DP (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={dpAmount > 0 ? dpPercentDisplay : (invoice.dp || '')}
                  onChange={(e) => handleDpPercentChange(e.target.value === '' ? 0 : Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  placeholder="0"
                  className="text-sm"
                />
              </div>
            </div>
          )}
          {/* Profit ditampilkan sebagai informasi (bukan input) — nilai dari
              snapshot modal per item, fallback uangCapek dari referensi. */}
          <div className="mt-3 rounded-lg bg-emerald-50 p-3 space-y-1">
            <p className="text-sm text-emerald-800">
              Total: <span className="font-bold">{formatRupiah(total)}</span>
            </p>
            {bisaLihatProfit && (
              <p className="text-sm text-emerald-800" data-testid="informasi-profit">
                Profit: <span className="font-bold">{formatRupiah(profit)}</span>
              </p>
            )}
            {(dpAmount > 0) && (
              <>
                <p className="text-sm text-emerald-800">
                  DP Dibayar: <span className="font-bold">{formatRupiah(dpAmount)}</span>
                  {dpPercentDisplay > 0 ? ` (${dpPercentDisplay}%)` : ''}
                </p>
                <p className="text-sm text-emerald-800">
                  Sisa Pembayaran (Piutang): <span className="font-bold">{formatRupiah(sisa)}</span>
                </p>
              </>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <Label className="text-xs">Catatan</Label>
            <Textarea
              value={invoice.catatan}
              onChange={(e) => setInvoice((prev) => ({ ...prev, catatan: e.target.value }))}
              placeholder="Catatan tambahan..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
        </div>
        </div>
      </DocumentEditorLayout>

      {/* Popup "Tambah Customer" — komponen bersama CustomerFormDialog: isi &
          perilaku SAMA PERSIS dengan popup Tambah/Edit di halaman Master
          Pelanggan (kode otomatis, nama*, telepon, email, alamat, catatan).
          Customer yang disimpan langsung terpilih di kotak Nama Customer. */}
      {/* Konfirmasi repricing baris manual (aturan Harga Customer): baris yang
          harganya pernah diedit manual tidak diganti diam-diam saat customer
          berubah — user memilih ganti atau pertahankan. */}
      <AlertDialog
        open={repriceConfirmRows !== null}
        onOpenChange={(o) => !o && setRepriceConfirmRows(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ganti harga baris manual?</AlertDialogTitle>
            <AlertDialogDescription>
              Baris berikut harganya pernah diedit manual:{' '}
              <span className="font-medium text-foreground">{(repriceConfirmRows ?? []).join(', ')}</span>.
              Ganti dengan harga untuk customer &quot;{invoice.client.nama.trim()}&quot;? Baris otomatis sudah memakai harga customer baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={pertahankanHargaManual}>Pertahankan</AlertDialogCancel>
            <AlertDialogAction onClick={konfirmasiRepriceManual}>Ya, Ganti</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        onSaved={handleCustomerCreated}
      />
    </>
  );
}
