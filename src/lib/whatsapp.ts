import { db } from '@/lib/db'

interface WhatsAppMessageResult {
  success: boolean
  error?: string
}

interface WhatsAppApiConfig {
  apiKey: string
  apiUrl: string
}

export const WHATSAPP_NOT_CONFIGURED_ERROR =
  'WhatsApp API key belum dikonfigurasi. Hubungi administrator.'

/**
 * Read the global WhatsApp API configuration (Fonnte-compatible).
 *
 * Keys `wa_api_key` / `wa_api_url` are SYSTEM settings stored in the global
 * `Setting` table (see SYSTEM_SETTING_KEYS in settings-shared.ts).
 *
 * Self-healing: older builds accidentally saved these keys into the per-user
 * `UserSetting` table, so if the global value is empty we look for the first
 * non-empty value in `UserSetting`, promote (copy) it to the global `Setting`
 * table, and use it — one-time migration, no re-save needed by the admin.
 */
export async function getWhatsAppApiConfig(): Promise<WhatsAppApiConfig | null> {
  const [apiKeySetting, apiUrlSetting] = await Promise.all([
    db.setting.findUnique({ where: { key: 'wa_api_key' } }),
    db.setting.findUnique({ where: { key: 'wa_api_url' } }),
  ])

  let apiKey = apiKeySetting?.value?.trim() || ''
  const apiUrl = apiUrlSetting?.value?.trim() || 'https://api.fonnte.com/send'

  if (!apiKey) {
    // Self-heal: promote a per-user value (saved by older builds) to global.
    const orphan = await db.userSetting.findFirst({
      where: { key: 'wa_api_key', value: { not: '' } },
      orderBy: { updatedAt: 'asc' },
    })
    const orphanKey = orphan?.value?.trim() || ''
    if (orphanKey) {
      await db.setting.upsert({
        where: { key: 'wa_api_key' },
        update: { value: orphanKey },
        create: { key: 'wa_api_key', value: orphanKey },
      })
      apiKey = orphanKey
    }
  }

  if (!apiKey) return null
  return { apiKey, apiUrl }
}

/** Normalize an Indonesian phone number to the 62… international format. */
export function normalizeWaPhone(targetPhone: string): string {
  let normalizedPhone = targetPhone.replace(/[\s\-()+]/g, '')
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '62' + normalizedPhone.substring(1)
  }
  return normalizedPhone
}

/**
 * Interpret a Fonnte (or compatible) API response.
 *
 * Fonnte returns HTTP 200 even on failures — the body decides:
 *   success: { status: true }  |  failure: { status: false, reason: "unknown token" }
 * So `response.ok` alone is NOT success; the body `status` field wins.
 * Only when the body carries no `status` field (other compatible providers)
 * do we fall back to the HTTP status code.
 */
async function interpretWaResponse(
  response: Response,
  fallbackError: string
): Promise<WhatsAppMessageResult> {
  let data: any = null
  try {
    data = await response.json()
  } catch {
    // Non-JSON body — fall back to HTTP status only.
    if (response.ok) return { success: true }
    return { success: false, error: `${fallbackError} (HTTP ${response.status})` }
  }

  const bodyStatus = data?.status
  if (bodyStatus === false || bodyStatus === 'false') {
    return {
      success: false,
      error: data?.message || data?.reason || data?.error || fallbackError,
    }
  }
  if (bodyStatus === true || bodyStatus === 'true') {
    return { success: true }
  }
  // Body without a status field — treat HTTP 2xx as success.
  if (response.ok) return { success: true }
  return {
    success: false,
    error: data?.message || data?.reason || data?.error || `${fallbackError} (HTTP ${response.status})`,
  }
}

/**
 * Send a WhatsApp message using Fonnte API (or compatible service)
 * Requires wa_api_key and wa_api_url to be configured in settings
 */
export async function sendWhatsAppMessage(
  targetPhone: string,
  message: string
): Promise<WhatsAppMessageResult> {
  try {
    const config = await getWhatsAppApiConfig()

    if (!config) {
      return { success: false, error: WHATSAPP_NOT_CONFIGURED_ERROR }
    }

    // Send via Fonnte API
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.apiKey,
      },
      body: JSON.stringify({
        target: normalizeWaPhone(targetPhone),
        message: message,
      }),
    })

    return interpretWaResponse(response, 'Gagal mengirim pesan WhatsApp')
  } catch (error: any) {
    console.error('WhatsApp send error:', error?.message || error)
    return {
      success: false,
      error: 'Gagal mengirim pesan WhatsApp. Periksa koneksi internet.',
    }
  }
}

/**
 * Send a WhatsApp document (PDF) using Fonnte API
 * Requires wa_api_key and wa_api_url to be configured in settings
 */
export async function sendWhatsAppDocument(
  targetPhone: string,
  message: string,
  pdfBase64: string,
  fileName: string
): Promise<WhatsAppMessageResult> {
  try {
    const config = await getWhatsAppApiConfig()

    if (!config) {
      return { success: false, error: WHATSAPP_NOT_CONFIGURED_ERROR }
    }

    // Send document via Fonnte API
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.apiKey,
      },
      body: JSON.stringify({
        target: normalizeWaPhone(targetPhone),
        message: message,
        document: pdfBase64,
        filename: fileName,
      }),
    })

    return interpretWaResponse(response, 'Gagal mengirim dokumen WhatsApp')
  } catch (error: any) {
    console.error('WhatsApp send document error:', error?.message || error)
    return {
      success: false,
      error: 'Gagal mengirim dokumen WhatsApp. Periksa koneksi internet.',
    }
  }
}

/**
 * Send a WhatsApp image (JPG/PNG) using Fonnte API
 * Requires wa_api_key and wa_api_url to be configured in settings
 *
 * The image is sent with an optional caption (message).
 * Fonnte accepts base64-encoded image data in the `image` field.
 */
export async function sendWhatsAppImage(
  targetPhone: string,
  message: string,
  imageBase64: string,
  fileName: string
): Promise<WhatsAppMessageResult> {
  try {
    const config = await getWhatsAppApiConfig()

    if (!config) {
      return { success: false, error: WHATSAPP_NOT_CONFIGURED_ERROR }
    }

    // Ensure the base64 string has the correct data URL prefix for an image.
    // Fonnte accepts either raw base64 or a data URL; we send a data URL for clarity.
    const imageDataUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`

    // Send image via Fonnte API.
    // `message` acts as the caption for the image.
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.apiKey,
      },
      body: JSON.stringify({
        target: normalizeWaPhone(targetPhone),
        message: message,
        image: imageDataUrl,
        filename: fileName,
      }),
    })

    return interpretWaResponse(response, 'Gagal mengirim gambar WhatsApp')
  } catch (error: any) {
    console.error('WhatsApp send image error:', error?.message || error)
    return {
      success: false,
      error: 'Gagal mengirim gambar WhatsApp. Periksa koneksi internet.',
    }
  }
}

/**
 * Generate a random password of specified length
 */
export function generateRandomPassword(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}
