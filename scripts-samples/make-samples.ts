// Sample data creator — PO → Stock Bahan (Stok Masuk)
// Run: bun scripts-samples/make-samples.ts
const BASE = 'http://localhost:3000'
const H = { 'Content-Type': 'application/json', 'x-user-id': 'user-superadmin', 'x-user-role': 'superadmin' }

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

const COMPANY = {
  nama: 'Darrell Soft', logo: '', alamat: 'Jl. Merdeka No. 12, Jakarta Pusat 10110',
  email: 'halo@karyamandiri.co.id', telepon: '(021) 555-0199', npwp: '', ppn: 11, website: '',
}

// ============ 1. SAMPLE BAHAN (stok 0 — diisi lewat PO) ============
const BAHAN_LIST = [
  { nama: 'HVS A4 80gsm',        kategori: 'Kertas',  satuan: 'rim',    stokMin: 10,  hargaSatuan: 52000,  pemasok: 'Toko Kertas Maju Jaya',   lokasi: 'Rak A1' },
  { nama: 'Art Paper 120gsm',    kategori: 'Kertas',  satuan: 'lembar', stokMin: 500, hargaSatuan: 900,    pemasok: 'CV Sinar Grafika',        lokasi: 'Rak A2' },
  { nama: 'Art Carton 260gsm',   kategori: 'Kertas',  satuan: 'lembar', stokMin: 300, hargaSatuan: 1850,   pemasok: 'CV Sinar Grafika',        lokasi: 'Rak A3' },
  { nama: 'Ivory Paper 250gsm',  kategori: 'Kertas',  satuan: 'lembar', stokMin: 200, hargaSatuan: 2100,   pemasok: 'PT Mitra Kertas Nusantara', lokasi: 'Rak B1' },
  { nama: 'Kertas NCR 3 Lapis',  kategori: 'Kertas',  satuan: 'rim',    stokMin: 5,   hargaSatuan: 285000, pemasok: 'CV Sinar Grafika',        lokasi: 'Rak B2' },
  { nama: 'Tinta Hitam Toyo',    kategori: 'Tinta',   satuan: 'kg',     stokMin: 5,   hargaSatuan: 145000, pemasok: 'PT Kimia Cetak Indah',    lokasi: 'Lemari Tinta' },
  { nama: 'Tinta Cyan Toyo',     kategori: 'Tinta',   satuan: 'kg',     stokMin: 3,   hargaSatuan: 158000, pemasok: 'PT Kimia Cetak Indah',    lokasi: 'Lemari Tinta' },
  { nama: 'Plate PSO CTP',       kategori: 'Lainnya', satuan: 'pcs',    stokMin: 50,  hargaSatuan: 22000,  pemasok: 'PT Grafika Teknik',       lokasi: 'Rak C1' },
]

const bahanId = new Map<string, string>()
for (const b of BAHAN_LIST) {
  if (bahanId.has(b.nama)) continue
  const created = await api('/api/stock-bahan', 'POST', { ...b, stok: 0, keterangan: '' })
  bahanId.set(b.nama, created.bahan?.id || created.id)
  console.log(`OK Bahan: ${b.nama} (${bahanId.get(b.nama)})`)
}

// ============ 2. SAMPLE PO ============
type PoSpec = {
  tanggal: string; suplier: { nama: string; jenisBarang: string; kontak: string; alamat: string }
  referensi: string; jatuhTempo: string; ppn: number; catatan: string
  items: { deskripsi: string; qty: number; satuan: string; harga: number; bahan?: string }[]
  terima: boolean
}

const PO_LIST: PoSpec[] = [
  {
    tanggal: '2026-09-22',
    suplier: { nama: 'CV Sinar Grafika', jenisBarang: 'Kertas & Bahan Grafika', kontak: '(021) 8899-1122', alamat: 'Jl. Percetakan Raya No. 45, Jakarta Timur' },
    referensi: 'PK/09/26/0112', jatuhTempo: '2026-09-29', ppn: 11, catatan: 'Stok rutin bulan September',
    items: [
      { deskripsi: 'Art Paper 120gsm', qty: 2000, satuan: 'lembar', harga: 900, bahan: 'Art Paper 120gsm' },
      { deskripsi: 'Tinta Cyan Toyo', qty: 10, satuan: 'kg', harga: 158000, bahan: 'Tinta Cyan Toyo' },
    ],
    terima: true,
  },
  {
    tanggal: '2026-09-24',
    suplier: { nama: 'Toko Kertas Maju Jaya', jenisBarang: 'Kertas', kontak: '(021) 6230-8877', alamat: 'Jl. Glodok Jaya No. 12, Jakarta Barat' },
    referensi: 'PK/09/26/0115', jatuhTempo: '2026-10-01', ppn: 11, catatan: '',
    items: [
      { deskripsi: 'HVS A4 80gsm', qty: 40, satuan: 'rim', harga: 52000, bahan: 'HVS A4 80gsm' },
      { deskripsi: 'Ivory Paper 250gsm', qty: 500, satuan: 'lembar', harga: 2100, bahan: 'Ivory Paper 250gsm' },
    ],
    terima: true,
  },
  {
    tanggal: '2026-09-25',
    suplier: { nama: 'PT Kimia Cetak Indah', jenisBarang: 'Tinta & Kimia Grafika', kontak: '0812-9987-3311', alamat: 'Kawasan Industri Pulogadung Blok F-9, Jakarta Timur' },
    referensi: 'NB-8891', jatuhTempo: '', ppn: 0, catatan: 'Tinta hitam untuk mesin offset 1',
    items: [
      { deskripsi: 'Tinta Hitam Toyo', qty: 20, satuan: 'kg', harga: 145000, bahan: 'Tinta Hitam Toyo' },
    ],
    terima: true,
  },
  {
    tanggal: '2026-09-26',
    suplier: { nama: 'PT Mitra Kertas Nusantara', jenisBarang: 'Kertas Karton', kontak: '(021) 4402-7788', alamat: 'Jl. Raya Bekasi Km 22, Jakarta Timur' },
    referensi: 'PK/09/26/0118', jatuhTempo: '2026-10-02', ppn: 11, catatan: 'Untuk pesanan box pelanggan PT Aneka Grafika',
    items: [
      { deskripsi: 'Art Carton 260gsm', qty: 1000, satuan: 'lembar', harga: 1850, bahan: 'Art Carton 260gsm' },
      { deskripsi: 'Kertas NCR 3 Lapis', qty: 5, satuan: 'rim', harga: 285000, bahan: 'Kertas NCR 3 Lapis' },
    ],
    terima: false,
  },
  {
    tanggal: '2026-09-27',
    suplier: { nama: 'PT Grafika Teknik', jenisBarang: 'Peralatan Cetak', kontak: '0815-6100-2299', alamat: 'Jl. Cikini Raya No. 30, Jakarta Pusat' },
    referensi: '', jatuhTempo: '2026-10-04', ppn: 11, catatan: 'Plate untuk bulan Oktober',
    items: [
      { deskripsi: 'Plate PSO CTP', qty: 200, satuan: 'pcs', harga: 22000, bahan: 'Plate PSO CTP' },
    ],
    terima: false,
  },
]

for (const spec of PO_LIST) {
  // nomor berikutnya dari server
  const preview = await api('/api/history?preview=next-number&docType=purchase-order', 'GET')
  const nomor = preview.nextNumber as string

  const poData = {
    type: 'purchase-order', company: COMPANY, nomor, tanggal: spec.tanggal,
    referensi: spec.referensi, pemasok: spec.suplier,
    items: spec.items.map(it => ({ id: crypto.randomUUID(), deskripsi: it.deskripsi, qty: it.qty, satuan: it.satuan, harga: it.harga })),
    ppn: spec.ppn, catatan: spec.catatan, tanggalJatuhTempo: spec.jatuhTempo,
  }
  const saved = await api('/api/history', 'POST', {
    docType: 'purchase-order', nomor, tanggal: spec.tanggal, pihakKedua: spec.suplier.nama,
    total: '-', customNomor: nomor, dataJson: JSON.stringify(poData),
  })
  console.log(`OK PO: ${nomor} — ${spec.suplier.nama} (${spec.items.length} item)`)

  if (spec.terima) {
    const items = spec.items
      .map((it, idx) => it.bahan && bahanId.get(it.bahan)
        ? { itemIndex: idx, bahanId: bahanId.get(it.bahan)!, qty: it.qty, hargaSatuan: it.harga }
        : null)
      .filter(Boolean)
    const rec = await api('/api/purchase-order/receive', 'POST', { poId: saved.id, items })
    const stok = rec.stokSekarang.map((s: { nama: string; stok: number; satuan: string }) => `${s.nama}=${s.stok} ${s.satuan}`).join(', ')
    console.log(`  -> DITERIMA: ${rec.jumlahItem} item masuk stok | ${stok}`)
  } else {
    console.log(`  -> dibiarkan "Belum" (untuk uji tombol Terima)`)
  }
}

console.log('\nSELESAI — sample PO & Stock Bahan dibuat.')
