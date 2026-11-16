import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'

/**
 * GET /api/whatsapp/device — admin-only.
 *
 * Verifikasi PERANGKAT WhatsApp (Fonnte) yang aktif sebagai PENGIRIM OTP
 * pendaftaran akun baru & lupa password.
 *
 * Cara kerja:
 *  1. Baca `wa_api_key` (token Fonnte) + `wa_sender_number` (nomor pengirim
 *     yang diharapkan) dari tabel Setting.
 *  2. Panggil API Fonnte POST /device dgn token → daftar perangkat yang
 *     terhubung pada akun Fonnte tsb (nama, nomor, status, kuota, expired).
 *  3. Bandingkan nomor tiap perangkat dgn `wa_sender_number` → indikator
 *     cocok / tidak cocok, agar admin langsung tahu apakah OTP dikirim dari
 *     nomor yang diinginkan (mis. 085888082208, bukan 0818666711 lama).
 *
 * Respons:
 *  - Token belum diisi          → 200 { configured: false }
 *  - Perangkat berhasil dibaca  → 200 { configured: true, devices, match }
 *  - Fonnte menolak token       → 200 { configured: true, devices: [], error }
 */
export async function GET(request: NextRequest) {
  const adminErr = requireAdmin(request)
  if (adminErr) return adminErr

  try {
    const [apiKeySetting, apiUrlSetting, senderSetting] = await Promise.all([
      db.setting.findUnique({ where: { key: 'wa_api_key' } }),
      db.setting.findUnique({ where: { key: 'wa_api_url' } }),
      db.setting.findUnique({ where: { key: 'wa_sender_number' } }),
    ])

    const apiKey = apiKeySetting?.value?.trim() || ''
    const senderNumberRaw = senderSetting?.value?.trim() || ''

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        configured: false,
        senderNumber: senderNumberRaw,
        devices: [],
        match: null,
        message: 'API Key Fonnte belum diisi. OTP pendaftaran dikirim via WhatsApp hanya setelah API key diisi.',
      })
    }

    // Fonnte /device: info perangkat akun milik token ini.
    // Base dipakai sama dengan apiUrl (api.fonnte.com) — endpoint device = /device.
    const apiBase = (() => {
      const raw = apiUrlSetting?.value?.trim() || 'https://api.fonnte.com/send'
      try {
        const u = new URL(raw)
        return `${u.protocol}//${u.host}`
      } catch {
        return 'https://api.fonnte.com'
      }
    })()

    let fonnteJson: unknown = null
    let fonnteError: string | null = null
    try {
      const res = await fetch(`${apiBase}/device`, {
        method: 'POST',
        headers: { Authorization: apiKey },
      })
      const text = await res.text()
      try {
        fonnteJson = JSON.parse(text)
      } catch {
        fonnteError = text.slice(0, 180) || `HTTP ${res.status}`
      }
      if (res.status === 401 || res.status === 403) {
        fonnteError = 'Token ditolak Fonnte (401/403) — API key tidak valid atau sudah diganti.'
      }
    } catch (e: unknown) {
      fonnteError = e instanceof Error ? e.message : 'Gagal menghubungi Fonnte'
    }

    if (fonnteError) {
      return NextResponse.json({
        ok: false,
        configured: true,
        senderNumber: senderNumberRaw,
        devices: [],
        match: null,
        error: fonnteError,
        message: 'Gagal membaca perangkat dari Fonnte. Periksa API key.',
      })
    }

    const devices = extractDevices(fonnteJson)

    // Fonnte eksplisit menolak (status:false) → tampilkan sebagai error agar
    // admin tahu token bermasalah, bukan sekadar "tidak ada perangkat".
    const fonnteStatus = (fonnteJson as Record<string, unknown> | null)?.status
    if (fonnteStatus === false || fonnteStatus === 'false') {
      const reason =
        ((fonnteJson as Record<string, unknown>).reason as string) ||
        ((fonnteJson as Record<string, unknown>).message as string) ||
        'Token ditolak Fonnte — periksa API key.'
      return NextResponse.json({
        ok: false,
        configured: true,
        senderNumber: senderNumberRaw,
        devices: [],
        match: null,
        error: reason,
        message: 'Fonnte menolak permintaan info perangkat. Periksa API key.',
      })
    }

    const senderNorm = normalizeNumber(senderNumberRaw)

    // Cocok = minimal satu perangkat CONNECT yang nomornya = nomor target.
    const connected = devices.filter((d) => String(d.status || '').toLowerCase().includes('connect'))
    let match: boolean | null = null
    if (senderNorm) {
      match = connected.some((d) => normalizeNumber(d.number) === senderNorm)
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      senderNumber: senderNumberRaw,
      devices,
      match,
      message: devices.length
        ? match === true
          ? `Perangkat pengirim sudah sesuai nomor target (${displayNumber(senderNumberRaw)}).`
          : match === false
            ? `TIDAK COCOK: nomor pengirim aktif bukan ${displayNumber(senderNumberRaw)}. Periksa perangkat di dashboard Fonnte.`
            : 'Perangkat terbaca dari Fonnte.'
        : 'Tidak ada perangkat yang terbaca pada akun Fonnte ini.',
    })
  } catch (error: unknown) {
    console.error('WhatsApp device API error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { ok: false, configured: null, devices: [], match: null, error: 'Terjadi kesalahan saat memeriksa perangkat WhatsApp.' },
      { status: 500 }
    )
  }
}

/** Ekstrak daftar perangkat dari respons Fonnte (defensif — bentuk bisa array/objek). */
function extractDevices(json: unknown): Array<{ name: string; number: string; status: string; quota: string; expired: string }> {
  const out: Array<{ name: string; number: string; status: string; quota: string; expired: string }> = []
  const pushRow = (row: Record<string, unknown>) => {
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = row[k]
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
      }
      return ''
    }
    const name = pick('device', 'name', 'nama')
    const number = pick('number', 'nomor', 'phone', 'msisdn', 'device')
    const status = pick('status', 'state', 'device_status')
    const quota = pick('quota', 'kuota')
    const expired = pick('expired', 'expiry', 'masa_aktif')
    if (name || number) out.push({ name, number, status, quota, expired })
  }

  if (Array.isArray(json)) {
    for (const row of json) {
      if (row && typeof row === 'object') pushRow(row as Record<string, unknown>)
    }
    return out
  }

  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    const data = obj.data ?? obj.devices ?? obj.result
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row && typeof row === 'object') pushRow(row as Record<string, unknown>)
      }
    } else if (data && typeof data === 'object') {
      pushRow(data as Record<string, unknown>)
    } else if (obj.status !== undefined || obj.device || obj.nomor || obj.number) {
      // Respons FLAT 1 perangkat dari Fonnte /device:
      // { status:true, device:"08..", device_status:"connect", name, quota, expired }
      // Di bentuk ini `device` = NOMOR perangkat (bukan nama), dan `status` =
      // status REQUEST (bukan status perangkat — status perangkat ada di `device_status`).
      if (typeof obj.device === 'string' && obj.device.trim() !== '') {
        pushRow({
          number: obj.device,
          name: obj.name,
          status: obj.device_status !== undefined && obj.device_status !== null ? obj.device_status : obj.status,
          quota: obj.quota,
          expired: obj.expired,
        })
      } else {
        pushRow(obj)
      }
    }
  }
  return out
}

/** Normalisasi nomor untuk pembandingan: buang non-digit, 0xx → 62xx. */
function normalizeNumber(raw: string): string {
  let n = (raw || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

/** Tampilan nomor ramah: 62xxx → 0xxx. */
function displayNumber(raw: string): string {
  const n = (raw || '').replace(/\D/g, '')
  if (n.startsWith('62') && n.length > 4) return '0' + n.slice(2)
  return raw
}
