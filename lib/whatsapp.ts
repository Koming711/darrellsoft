import { db } from '@/lib/db'

interface WhatsAppMessageResult {
  success: boolean
  error?: string
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
    // Get WhatsApp API settings from database
    const apiKeySetting = await db.setting.findUnique({ where: { key: 'wa_api_key' } })
    const apiUrlSetting = await db.setting.findUnique({ where: { key: 'wa_api_url' } })

    const apiKey = apiKeySetting?.value?.trim()
    const apiUrl = apiUrlSetting?.value?.trim() || 'https://api.fonnte.com/send'

    if (!apiKey) {
      return { success: false, error: 'WhatsApp API key belum dikonfigurasi. Hubungi administrator.' }
    }

    // Normalize target phone number
    let normalizedPhone = targetPhone.replace(/[\s\-()+]/g, '')
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '62' + normalizedPhone.substring(1)
    }

    // Send via Fonnte API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        target: normalizedPhone,
        message: message,
      }),
    })

    const data = await response.json()

    // Fonnte returns { status: true, ... } on success
    if (data.status === true || data.status === 'true' || response.ok) {
      return { success: true }
    }

    return {
      success: false,
      error: data.message || data.reason || data.error || 'Gagal mengirim pesan WhatsApp',
    }
  } catch (error: any) {
    console.error('WhatsApp send error:', error?.message || error)
    return {
      success: false,
      error: 'Gagal mengirim pesan WhatsApp. Periksa koneksi internet.',
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
