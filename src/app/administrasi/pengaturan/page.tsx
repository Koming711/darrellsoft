'use client'

import { Wrench, Save, Database, Palette, Monitor, Percent, Loader2, RefreshCw, CalendarDays, Clock, UserCircle, Upload, X, ImageIcon, Download, Trash2, HardDrive, AlertTriangle, RotateCcw, FileJson, Timer, Pipette, Undo2, Camera, ArrowUpDown, Landmark, Eye, ChevronDown, ChevronUp, Building2, Phone, Mail, MapPin, CreditCard, Hash, FileText, MessageCircle } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { Language, TranslationKey } from '@/lib/i18n'
import { notifyDataChange } from '@/lib/data-sync'

// Preset color palettes with stabilo (bright neon highlighter) colors
// Background lightened 17% total, popup lightened 25% total
const colorPresets = {
  sidebar: [
    { name: 'Default', value: '#ffffff' },
    { name: 'Biru Logo DS', value: '#1D4ED8' },
    { name: 'Stabilo Kuning', value: '#FFF176' },
    { name: 'Stabilo Hijau', value: '#69F0AE' },
    { name: 'Stabilo Pink', value: '#FF80AB' },
    { name: 'Stabilo Biru', value: '#80D8FF' },
    { name: 'Stabilo Orange', value: '#FFAB40' },
    { name: 'Stabilo Ungu', value: '#EA80FC' },
    { name: 'Stabilo Merah', value: '#FF8A80' },
    { name: 'Stabilo Tosca', value: '#84FFFF' },
    { name: 'Stabilo Lime', value: '#CCFF90' },
    { name: 'Stabilo Peach', value: '#FFD180' },
    { name: 'Stabilo Lavender', value: '#B388FF' },
  ],
  background: [
    { name: 'Default', value: '#fcfdfe' },
    { name: 'Biru Logo DS', value: '#DBEAFE' },
    { name: 'Stabilo Kuning', value: '#fffad3' },
    { name: 'Stabilo Hijau', value: '#d0ead1' },
    { name: 'Stabilo Pink', value: '#f9c6d7' },
    { name: 'Stabilo Biru', value: '#c6e3fb' },
    { name: 'Stabilo Orange', value: '#ffe5be' },
    { name: 'Stabilo Ungu', value: '#e6c9eb' },
    { name: 'Stabilo Merah', value: '#ffd5d9' },
    { name: 'Stabilo Tosca', value: '#beeef5' },
    { name: 'Stabilo Lime', value: '#e2f0d1' },
    { name: 'Stabilo Peach', value: '#ffd4c7' },
    { name: 'White', value: '#ffffff' },
  ],
  popup: [
    { name: 'Default', value: '#ffffff' },
    { name: 'Biru Logo DS', value: '#EFF6FF' },
    { name: 'Stabilo Kuning', value: '#fffad1' },
    { name: 'Stabilo Hijau', value: '#cafbd7' },
    { name: 'Stabilo Pink', value: '#f9cbdb' },
    { name: 'Stabilo Biru', value: '#c5ebfd' },
    { name: 'Stabilo Orange', value: '#ffe8c4' },
    { name: 'Stabilo Ungu', value: '#daace1' },
    { name: 'Stabilo Merah', value: '#f3b2b2' },
    { name: 'Stabilo Tosca', value: '#9ee6f3' },
    { name: 'Stabilo Lime', value: '#c2de9f' },
    { name: 'Stabilo Peach', value: '#ffbfab' },
    { name: 'Snow', value: '#fbfbfb' },
  ],
  banner: [
    { name: 'Default', value: '#ffffff' },
    { name: 'Biru Logo DS', value: '#2563EB' },
    { name: 'Stabilo Kuning', value: '#FFF9C4' },
    { name: 'Stabilo Hijau', value: '#C8E6C9' },
    { name: 'Stabilo Pink', value: '#F8BBD0' },
    { name: 'Stabilo Biru', value: '#BBDEFB' },
    { name: 'Stabilo Orange', value: '#FFE0B2' },
    { name: 'Stabilo Ungu', value: '#E1BEE7' },
    { name: 'Stabilo Merah', value: '#FFCDD2' },
    { name: 'Stabilo Tosca', value: '#B2EBF2' },
    { name: 'Stabilo Lime', value: '#DCEDC8' },
    { name: 'Stabilo Peach', value: '#FFCCBC' },
    { name: 'Snow', value: '#fafafa' },
  ],
  login: [
    { name: 'Default', value: '#EFF6FF' },
    { name: 'Biru Logo DS', value: '#DBEAFE' },
    { name: 'Stabilo Kuning', value: '#FFFDE7' },
    { name: 'Stabilo Hijau', value: '#E8F5E9' },
    { name: 'Stabilo Pink', value: '#FCE4EC' },
    { name: 'Stabilo Biru', value: '#E3F2FD' },
    { name: 'Stabilo Orange', value: '#FFF3E0' },
    { name: 'Stabilo Ungu', value: '#F3E5F5' },
    { name: 'Stabilo Merah', value: '#FFEBEE' },
    { name: 'Stabilo Tosca', value: '#E0F7FA' },
    { name: 'Stabilo Lime', value: '#F1F8E9' },
    { name: 'Stabilo Peach', value: '#FBE9E7' },
    { name: 'White', value: '#ffffff' },
  ],
}

export default function PengaturanPage() {
  const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors'
  const [activeTab, setActiveTab] = useState('umum')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Profit setting
  const [profitPercent, setProfitPercent] = useState<string>('10')

  // PPN setting
  const [ppnPercent, setPpnPercent] = useState<string>('11')

  // General settings
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Preview toggle
  const [showPreview, setShowPreview] = useState(false)

  // Bank settings
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [bankName2, setBankName2] = useState('')
  const [bankAccount2, setBankAccount2] = useState('')
  const [bankHolder2, setBankHolder2] = useState('')
  const [npwp, setNpwp] = useState('')

  // WhatsApp API settings
  const [waApiKey, setWaApiKey] = useState('')
  const [waApiUrl, setWaApiUrl] = useState('https://api.fonnte.com/send')
  const [waTestLoading, setWaTestLoading] = useState(false)

  // Database settings
  const [autoBackupDays, setAutoBackupDays] = useState(7)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [backups, setBackups] = useState<Array<{ fileName: string; size: number; sizeFormatted: string; createdAt: string; timestamp: string; tableCount: number; rowCount: number }>>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [riwayatLoading, setRiwayatLoading] = useState<string | null>(null)
  const [riwayatCounts, setRiwayatCounts] = useState<Record<string, number>>({})
  const [masterLoading, setMasterLoading] = useState<string | null>(null)
  const [masterCounts, setMasterCounts] = useState<Record<string, number>>({})

  // Display settings
  const [fontSize, setFontSize] = useState('medium')

  // Color settings
  const [sidebarColor, setSidebarColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState('#f8fafc')
  const [popupColor, setPopupColor] = useState('#ffffff')
  const [bannerColor, setBannerColor] = useState('#ffffff')
  const [loginColor, setLoginColor] = useState('#EFF6FF')
  const [sidebarTextColor, setSidebarTextColor] = useState('dark')
  // savingColors removed - colors are now saved via handleSaveTampilan

  // Language
  const { language: appLanguage, setLanguage: setAppLanguage, t } = useLanguage()

  // User profile
  const [userProfile, setUserProfile] = useState<{ namaLengkap: string; username: string; role: string; createdAt: string; validUntil: string | null } | null>(null)

  // Fetch user profile
  const fetchProfile = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/me', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUserProfile({
          namaLengkap: data.namaLengkap,
          username: data.username,
          role: data.role,
          createdAt: data.createdAt,
          validUntil: data.validUntil,
        })
      }
    } catch { /* silent */ }
  }, [])

  // Fetch profit
  const fetchProfitSetting = useCallback(async () => {
    try {
      const res = await authFetch('/api/settings?key=profit', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.value !== null && data.value !== undefined && data.value !== '') {
          setProfitPercent(data.value.toString())
        }
      }
    } catch { /* silent */ }
  }, [])

  // Fetch PPN
  const fetchPpnSetting = useCallback(async () => {
    try {
      const res = await authFetch('/api/settings?key=ppn', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.value !== null && data.value !== undefined && data.value !== '') {
          setPpnPercent(data.value.toString())
        }
      }
    } catch { /* silent */ }
  }, [])

  // Fetch general settings
  const fetchGeneralSettings = useCallback(async () => {
    try {
      const keys = ['company_name', 'company_logo', 'company_address', 'company_email', 'company_phone', 'bank_name', 'bank_account', 'bank_holder', 'bank_name2', 'bank_account2', 'bank_holder2', 'npwp', 'wa_api_key', 'wa_api_url']
      const results = await Promise.all(keys.map(k => authFetch(`/api/settings?key=${k}`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null)))
      if (results[0]?.value) setCompanyName(results[0].value)
      if (results[1]?.value) setCompanyLogo(results[1].value)
      if (results[2]?.value) setAddress(results[2].value)
      if (results[3]?.value) setEmail(results[3].value)
      if (results[4]?.value) setPhone(results[4].value)
      if (results[5]?.value) setBankName(results[5].value)
      if (results[6]?.value) setBankAccount(results[6].value)
      if (results[7]?.value) setBankHolder(results[7].value)
      if (results[8]?.value) setBankName2(results[8].value)
      if (results[9]?.value) setBankAccount2(results[9].value)
      if (results[10]?.value) setBankHolder2(results[10].value)
      if (results[11]?.value) setNpwp(results[11].value)
      if (results[12]?.value) setWaApiKey(results[12].value)
      if (results[13]?.value) setWaApiUrl(results[13].value)
    } catch { /* silent */ }
  }, [])

  // Fetch color settings
  const fetchColorSettings = useCallback(async () => {
    try {
      const keys = ['theme_sidebar_color', 'theme_bg_color', 'theme_popup_color', 'theme_banner_color', 'theme_login_color', 'app_font_size']
      const results = await Promise.all(keys.map(k => authFetch(`/api/settings?key=${k}`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null)))
      if (results[0]?.value) { setSidebarColor(results[0].value); applySidebarColor(results[0].value) }
      if (results[1]?.value) { setBgColor(results[1].value); applyBgColor(results[1].value) }
      if (results[2]?.value) { setPopupColor(results[2].value); applyPopupColor(results[2].value) }
      if (results[3]?.value) { setBannerColor(results[3].value); applyBannerColor(results[3].value) }
      if (results[4]?.value) { setLoginColor(results[4].value); applyLoginColor(results[4].value) }
      if (results[5]?.value) { setFontSize(results[5].value); applyFontSizeLive(results[5].value) }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    Promise.all([fetchProfile(), fetchProfitSetting(), fetchPpnSetting(), fetchGeneralSettings(), fetchColorSettings()]).finally(() => setLoading(false))
  }, [fetchProfile, fetchProfitSetting, fetchPpnSetting, fetchGeneralSettings, fetchColorSettings])

  // Apply colors to CSS variables (immediate live preview)
  const applySidebarColor = (color: string) => {
    const isLight = isLightColor(color)
    document.documentElement.style.setProperty('--app-sidebar-bg', color)
    document.documentElement.style.setProperty('--app-sidebar-border', isLight ? '#e2e8f0' : 'rgba(255,255,255,0.12)')
    document.documentElement.style.setProperty('--app-sidebar-text', isLight ? '#1e293b' : '#f1f5f9')
    document.documentElement.style.setProperty('--app-sidebar-text-muted', isLight ? '#64748b' : '#94a3b8')
    document.documentElement.style.setProperty('--app-sidebar-active-bg', isLight ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.15)')
    document.documentElement.style.setProperty('--app-sidebar-active-text', isLight ? '#2563eb' : '#93c5fd')
    setSidebarTextColor(isLight ? 'dark' : 'light')
  }

  const applyBgColor = (color: string) => {
    document.documentElement.style.setProperty('--app-content-bg', color)
  }

  const applyPopupColor = (color: string) => {
    document.documentElement.style.setProperty('--app-popup-bg', color)
    document.documentElement.style.setProperty('--popover', color)
    document.documentElement.style.setProperty('--card', color)
    document.documentElement.style.setProperty('--background', color)
  }

  const applyBannerColor = (color: string) => {
    const isLight = isLightColor(color)
    document.documentElement.style.setProperty('--app-banner-bg', color)
    document.documentElement.style.setProperty('--app-banner-text', isLight ? '#1e293b' : '#f1f5f9')
    document.documentElement.style.setProperty('--app-banner-text-muted', isLight ? '#64748b' : '#94a3b8')
  }

  const applyLoginColor = (color: string) => {
    document.documentElement.style.setProperty('--app-login-bg', color)
  }

  const applyFontSizeLive = (size: string) => {
    const map: Record<string, string> = {
      small: '15px',
      medium: '17px',
      large: '19px',
      'extra-large': '20px',
    }
    const fs = map[size] || '16px'
    document.documentElement.style.setProperty('--app-font-size', fs)
    document.documentElement.style.setProperty('--app-font-size-sm', `${parseInt(fs) - 2}px`)
    document.documentElement.style.setProperty('--app-font-size-lg', `${parseInt(fs) + 2}px`)
    document.documentElement.style.setProperty('--app-font-size-xs', `${parseInt(fs) - 4}px`)
  }

  // Live preview: apply immediately when color changes
  const handleSidebarColorChange = (color: string) => {
    setSidebarColor(color)
    applySidebarColor(color)
  }
  const handleBgColorChange = (color: string) => {
    setBgColor(color)
    applyBgColor(color)
  }
  const handlePopupColorChange = (color: string) => {
    setPopupColor(color)
    applyPopupColor(color)
  }
  const handleBannerColorChange = (color: string) => {
    setBannerColor(color)
    applyBannerColor(color)
  }
  const handleLoginColorChange = (color: string) => {
    setLoginColor(color)
    applyLoginColor(color)
  }

  const isLightColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 128
  }

  const handleResetColors = () => {
    const defaults = { sidebar: '#ffffff', bg: '#f8fafc', popup: '#ffffff', banner: '#ffffff', login: '#EFF6FF' }
    setSidebarColor(defaults.sidebar)
    setBgColor(defaults.bg)
    setPopupColor(defaults.popup)
    setBannerColor(defaults.banner)
    setLoginColor(defaults.login)
    applySidebarColor(defaults.sidebar)
    applyBgColor(defaults.bg)
    applyPopupColor(defaults.popup)
    applyBannerColor(defaults.banner)
    applyLoginColor(defaults.login)
    // Reset additional CSS variables to defaults
    document.documentElement.style.setProperty('--app-sidebar-active-bg', 'rgba(59,130,246,0.08)')
    document.documentElement.style.setProperty('--app-sidebar-active-text', '#2563eb')
    document.documentElement.style.setProperty('--app-banner-text', '#1e293b')
    document.documentElement.style.setProperty('--app-banner-text-muted', '#64748b')
    toast.success(t('color_reset_success'))
  }

  // Save profit
  const saveProfitSetting = async () => {
    const val = parseFloat(profitPercent)
    if (isNaN(val) || val < 0) { toast.error(t('profit_error_positive')); return false }
    try {
      const res = await authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'profit', value: val.toString() }) })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Save profit failed:', res.status, data)
        toast.error(data?.error || t('profit_error_save'))
        return false
      }
      return true
    } catch (err) {
      console.error('Save profit error:', err)
      toast.error(t('profit_error_save'))
      return false
    }
  }

  const handleSaveProfit = async () => {
    setSaving(true)
    const success = await saveProfitSetting()
    setSaving(false)
    if (success) toast.success(t('profit_success'))
    if (success) notifyDataChange('settings')
  }

  // Save PPN
  const savePpnSetting = async () => {
    const val = parseFloat(ppnPercent)
    if (isNaN(val) || val < 0) { toast.error('PPN harus angka positif'); return false }
    try {
      const res = await authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ppn', value: val.toString() }) })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Save PPN failed:', res.status, data)
        toast.error(data?.error || 'Gagal menyimpan PPN')
        return false
      }
      return true
    } catch (err) {
      console.error('Save PPN error:', err)
      toast.error('Gagal menyimpan PPN')
      return false
    }
  }

  const handleSavePpn = async () => {
    setSaving(true)
    const success = await savePpnSetting()
    setSaving(false)
    if (success) {
      toast.success('PPN berhasil disimpan')
      notifyDataChange('settings')
    }
  }

  // Reset company info (Umum tab)
  const handleResetCompany = async () => {
    setSaving(true)
    try {
      await Promise.all([
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_name', value: '' }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_address', value: '' }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_email', value: '' }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_phone', value: '' }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_logo', value: '' }) }),
      ])
      setCompanyName('')
      setAddress('')
      setEmail('')
      setPhone('')
      setCompanyLogo(null)
      toast.success(t('setting_reset_success'))
    } catch { toast.error(t('setting_error_save')) }
    finally { setSaving(false) }
  }

  // Save company info (Umum tab)
  const handleSaveCompany = async () => {
    setSaving(true)
    try {
      await Promise.all([
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_name', value: companyName }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_address', value: address }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_email', value: email }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_phone', value: phone }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'bank_name', value: bankName }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'bank_account', value: bankAccount }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'bank_holder', value: bankHolder }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'bank_name2', value: bankName2 }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'bank_account2', value: bankAccount2 }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'bank_holder2', value: bankHolder2 }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'npwp', value: npwp }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'wa_api_key', value: waApiKey }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'wa_api_url', value: waApiUrl }) }),
      ])
      toast.success(t('setting_saved'))
      notifyDataChange('settings')
    } catch { toast.error(t('setting_error_save')) }
    finally { setSaving(false) }
  }

  // Save display changes only (Tampilan tab - colors, language, font size)
  const handleSaveTampilan = async () => {
    setSaving(true)
    try {
      await Promise.all([
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_sidebar_color', value: sidebarColor }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_bg_color', value: bgColor }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_popup_color', value: popupColor }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_banner_color', value: bannerColor }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_login_color', value: loginColor }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'app_language', value: appLanguage }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'app_font_size', value: fontSize }) }),
      ])
      applySidebarColor(sidebarColor)
      applyBgColor(bgColor)
      applyPopupColor(popupColor)
      applyBannerColor(bannerColor)
      applyLoginColor(loginColor)
      applyFontSizeLive(fontSize)
      toast.success(t('setting_saved'))
      notifyDataChange('settings')
    } catch { toast.error(t('setting_error_save')) }
    finally { setSaving(false) }
  }

  // Compress image to max 500KB using canvas
  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()
      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_SIZE = 500 * 1024 // 500KB
          let quality = 0.85
          let w = img.width
          let h = img.height
          // Limit max dimensions to 1024px
          const maxDim = 1024
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim }
            else { w = Math.round(w * maxDim / h); h = maxDim }
          }
          const compress = () => {
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) { reject(new Error('Canvas not supported')); return }
            ctx.drawImage(img, 0, 0, w, h)
            canvas.toBlob((blob) => {
              if (!blob) { reject(new Error('Compression failed')); return }
              if (blob.size <= MAX_SIZE || quality <= 0.1) {
                resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
              } else {
                quality -= 0.15
                compress()
              }
            }, 'image/jpeg', quality)
          }
          compress()
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Upload logo file (with auto-compress)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error(t('logo_must_image')); return }
    setUploadingLogo(true)
    try {
      const compressed = file.size > 500 * 1024 ? await compressImage(file) : file
      const formData = new FormData()
      formData.append('logo', compressed)
      const res = await authFetch('/api/upload-logo', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.logo) { setCompanyLogo(data.logo); toast.success(t('logo_upload_success'))
      }
      else toast.error(data.error || t('logo_upload_error'))
    } catch { toast.error(t('logo_upload_error')) }
    finally { setUploadingLogo(false) }
  }

  // Capture photo from camera (with auto-compress)
  const handleCameraCapture = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setUploadingLogo(true)
      try {
        const compressed = file.size > 500 * 1024 ? await compressImage(file) : file
        const formData = new FormData()
        formData.append('logo', compressed)
        const res = await authFetch('/api/upload-logo', { method: 'POST', body: formData })
        const data = await res.json()
        if (res.ok && data.logo) { setCompanyLogo(data.logo); toast.success(t('logo_upload_success'))
        }
        else toast.error(data.error || t('logo_upload_error'))
      } catch { toast.error(t('logo_upload_error')) }
      finally { setUploadingLogo(false) }
    }
    input.click()
  }

  const handleRemoveLogo = async () => {
    setCompanyLogo(null)
    try {
      await authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'company_logo', value: '' }) })
      toast.success(t('logo_removed'))
    } catch { toast.error(t('logo_remove_error')) }
  }

  // Backup/Restore
  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const res = await authFetch('/api/database/backups', { headers: getAuthHeaders() })
      if (res.ok) { const data = await res.json(); if (data.success) setBackups(data.backups) }
    } catch { /* silent */ }
    setLoadingBackups(false)
  }, [])

  useEffect(() => { if (activeTab === 'database') fetchBackups() }, [activeTab, fetchBackups])

  const fetchAutoBackupDays = useCallback(async () => {
    try {
      const res = await authFetch('/api/settings?key=auto_backup_days', { headers: getAuthHeaders() })
      if (res.ok) { const data = await res.json(); if (data.value) setAutoBackupDays(parseInt(data.value) || 7) }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchAutoBackupDays() }, [fetchAutoBackupDays])

  const handleBackupDatabase = async () => {
    setBackupLoading(true)
    try {
      const res = await authFetch('/api/database/backup', { method: 'POST', headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          toast.success(`${t('backup_success')} ${data.fileCount} ${t('records')} — ${data.fileName}`)
          const blob = new Blob([JSON.stringify(data.backup, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = data.fileName; a.click()
          URL.revokeObjectURL(url)
          fetchBackups()
        }
      } else toast.error(t('backup_error'))
    } catch { toast.error(t('backup_error')) }
    setBackupLoading(false)
  }

  const handleRestoreFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setShowRestoreConfirm(null); setRestoreLoading(true)
    try {
      const text = await file.text(); const backupData = JSON.parse(text)
      const res = await authFetch('/api/database/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ backupData }) })
      if (res.ok) { const data = await res.json(); if (data.success) toast.success(`${t('restore_success')} ${data.restoredTables} ${t('restore_table_count')} ${t('restore_from')} ${file.name}`); else toast.error(data.error || t('restore_error')) }
      else { const data = await res.json(); toast.error(data.error || t('restore_error')) }
    } catch { toast.error(t('backup_file_invalid')) }
    setRestoreLoading(false); e.target.value = ''
  }

  const handleRestoreFromServer = async (fileName: string) => {
    setRestoreLoading(true); setShowRestoreConfirm(null)
    try {
      const res = await authFetch('/api/database/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ fileName }) })
      if (res.ok) { const data = await res.json(); if (data.success) toast.success(`${t('restore_success')} ${data.restoredTables} ${t('restore_table_count')}`); else toast.error(data.error || t('restore_error')) }
      else { const data = await res.json(); toast.error(data.error || t('restore_error')) }
    } catch { toast.error(t('restore_error')) }
    setRestoreLoading(false)
  }

  const handleDeleteBackup = async (fileName: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await authFetch(`/api/database/backups?fileName=${encodeURIComponent(fileName)}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) { toast.success(t('backup_deleted')); fetchBackups() } else toast.error(t('backup_delete_error'))
    } catch { toast.error(t('backup_delete_error')) }
  }

  const handleSaveAutoBackup = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'auto_backup_days', value: autoBackupDays.toString() }) })
      if (res.ok) toast.success(`${t('auto_backup_set')} ${autoBackupDays} ${t('auto_backup_unit')}`)
    } catch { toast.error(t('auto_backup_save_error')) }
    setSaving(false)
  }

  const handleUpdateDatabase = async () => {
    setUpdateLoading(true)
    try {
      const res = await authFetch('/api/database/update', { method: 'POST', headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          toast.success(t('update_database_success'))
          if (data.details?.length > 0) {
            console.log('Update details:', data.details)
          }
        } else {
          toast.error(data.error || t('update_database_error'))
        }
      } else {
        toast.error(t('update_database_error'))
      }
    } catch { toast.error(t('update_database_error')) }
    setUpdateLoading(false)
  }

  // Riwayat tables config
  const RIWAYAT_TABLES = [
    { key: 'riwayat_cetakan', label: 'riwayat_cetakan', icon: '🖨️', color: 'emerald' },
    { key: 'riwayat_finishing', label: 'riwayat_finishing', icon: '✨', color: 'purple' },
    { key: 'riwayat_ongkos_cetak', label: 'riwayat_ongkos_cetak', icon: '⚙️', color: 'blue' },
    { key: 'riwayat_harga_kertas', label: 'riwayat_harga_kertas', icon: '📄', color: 'amber' },
    { key: 'riwayat_potong_kertas', label: 'riwayat_potong_kertas', icon: '✂️', color: 'rose' },
  ]

  const MASTER_TABLES = [
    { key: 'finishing', label: 'master_finishing', icon: '✨', color: 'purple' },
    { key: 'printing_cost', label: 'master_ongkos_cetak', icon: '⚙️', color: 'blue' },
    { key: 'paper', label: 'master_harga_kertas', icon: '📄', color: 'amber' },
    { key: 'customer', label: 'master_customer', icon: '👤', color: 'teal' },
  ]

  // Fetch riwayat counts
  const fetchRiwayatCounts = useCallback(async () => {
    try {
      const [cetakan, finishing, ongkos, harga, potong] = await Promise.all([
        authFetch('/api/riwayat-cetakan', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/riwayat-finishing', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/riwayat-ongkos-cetak', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/riwayat-harga-kertas', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/riwayat-potong-kertas', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
      ])
      setRiwayatCounts({
        riwayat_cetakan: Array.isArray(cetakan) ? cetakan.length : 0,
        riwayat_finishing: Array.isArray(finishing) ? finishing.length : 0,
        riwayat_ongkos_cetak: Array.isArray(ongkos) ? ongkos.length : 0,
        riwayat_harga_kertas: Array.isArray(harga) ? harga.length : 0,
        riwayat_potong_kertas: Array.isArray(potong) ? potong.length : 0,
      })
    } catch { /* silent */ }
  }, [])

  useEffect(() => { if (activeTab === 'database') fetchRiwayatCounts() }, [activeTab, fetchRiwayatCounts])

  // Fetch master counts
  const fetchMasterCounts = useCallback(async () => {
    try {
      const [finishing, printingCost, paper, customer] = await Promise.all([
        authFetch('/api/finishings', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/printing-costs', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/papers', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
        authFetch('/api/customers', { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
      ])
      setMasterCounts({
        finishing: Array.isArray(finishing) ? finishing.length : 0,
        printing_cost: Array.isArray(printingCost) ? printingCost.length : 0,
        paper: Array.isArray(paper) ? paper.length : 0,
        customer: Array.isArray(customer) ? customer.length : 0,
      })
    } catch { /* silent */ }
  }, [])

  useEffect(() => { if (activeTab === 'database') fetchMasterCounts() }, [activeTab, fetchMasterCounts])

  const handleBackupRiwayat = async (tableKey: string) => {
    setRiwayatLoading(tableKey + '-backup')
    try {
      const authHeaders = getAuthHeaders()
      const params = new URLSearchParams({ table: tableKey, uid: authHeaders['x-user-id'] || '', role: authHeaders['x-user-role'] || '' })
      window.open(`/api/database/backup-riwayat?${params.toString()}`, '_blank')
      toast.success(t('backup_riwayat_success'))
    } catch (e) { console.error('Backup riwayat error:', e); toast.error(t('backup_riwayat_error')) }
    setRiwayatLoading(null)
  }

  const handleRestoreRiwayat = async (tableKey: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setRiwayatLoading(tableKey + '-restore')
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('table', tableKey)
        const res = await authFetch('/api/database/restore-riwayat', {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: formData
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            toast.success(`${t('restore_riwayat_success')} (${data.count} ${t('records_count')})`)
            fetchRiwayatCounts()
          } else {
            toast.error(data.error || t('restore_riwayat_error'))
          }
        } else {
          toast.error(t('restore_riwayat_error'))
        }
      } catch { toast.error(t('backup_file_invalid')) }
      setRiwayatLoading(null)
    }
    input.click()
  }

  const handleBackupMaster = async (tableKey: string) => {
    setMasterLoading(tableKey + '-backup')
    try {
      const authHeaders = getAuthHeaders()
      const params = new URLSearchParams({ table: tableKey, uid: authHeaders['x-user-id'] || '', role: authHeaders['x-user-role'] || '' })
      window.open(`/api/database/backup-master?${params.toString()}`, '_blank')
      toast.success(t('backup_master_success'))
    } catch (e) { console.error('Backup master error:', e); toast.error(t('backup_master_error')) }
    setMasterLoading(null)
  }

  const handleRestoreMaster = async (tableKey: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setMasterLoading(tableKey + '-restore')
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('table', tableKey)
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: formData
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            toast.success(`${t('restore_master_success')} (${data.count} ${t('records_count')})`)
            fetchMasterCounts()
          } else {
            toast.error(data.error || t('restore_master_error'))
          }
        } else {
          toast.error(t('restore_master_error'))
        }
      } catch { toast.error(t('backup_file_invalid')) }
      setMasterLoading(null)
    }
    input.click()
  }

  // Color picker component
  const ColorPicker = ({ label, icon, value, onChange, presets }: { label: string; icon: React.ReactNode; value: string; onChange: (v: string) => void; presets: { name: string; value: string }[] }) => (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {icon}
        <label className="text-xs sm:text-sm font-medium text-slate-700">{label}</label>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 h-10 rounded-lg border-2 border-slate-200 cursor-pointer p-0.5"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value) }}
          className={`${inputClass} max-w-[120px] font-mono text-xs`}
          maxLength={7}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${value === p.value ? 'border-blue-500 ring-2 ring-blue-200 scale-110' : 'border-slate-200 hover:border-slate-300'}`}
            style={{ backgroundColor: p.value }}
            title={p.name}
          />
        ))}
      </div>
    </div>
  )

  return (
    <DashboardLayout
      title={t('pengaturan')}
      subtitle={t('subtitle_pengaturan')}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ===== ACCOUNT INFO ===== */}
        {userProfile && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{t('informasi_akun')}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{t('detail_akun')}</p>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <UserCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('username')}</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{userProfile.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <UserCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('nama_lengkap')}</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{userProfile.namaLengkap}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <UserCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('role')}</p>
                      <p className="text-sm font-semibold text-slate-800 capitalize">{userProfile.role}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                    <CalendarDays className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-medium">{t('tanggal_daftar')}</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {userProfile.createdAt ? new Date(userProfile.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">{t('masa_berlaku')}</p>
                      {userProfile.validUntil ? (() => {
                        const expDate = new Date(userProfile.validUntil)
                        const diffDays = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        const isExpired = diffDays <= 0
                        return (
                          <>
                            <p className={`text-sm font-semibold ${isExpired ? 'text-red-600' : 'text-slate-800'}`}>
                              {expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            <p className={`text-[11px] font-medium ${isExpired ? 'text-red-500' : 'text-emerald-600'}`}>
                              {isExpired ? t('sudah_berakhir') : `${diffDays} ${t('hari_tersisa')}`}
                            </p>
                          </>
                        )
                      })() : (
                        <p className="text-sm italic text-slate-400">{t('tidak_ada_masa_berlaku')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TABS ===== */}
        <div className="flex gap-1.5 sm:gap-2 mb-4 overflow-x-auto pb-1">
          {[
            { id: 'umum', label: t('tab_umum'), icon: Monitor, color: 'blue' },
            { id: 'profit', label: t('persentase_profit'), icon: Percent, color: 'amber' },
            { id: 'dokumen', label: 'Data PPN', icon: FileText, color: 'rose' },
            { id: 'tampilan', label: t('pengaturan_tampilan'), icon: Palette, color: 'violet' },
            { id: 'database', label: t('tab_database'), icon: Database, color: 'emerald' }
          ].map((tab) => {
            const colorMap: Record<string, { active: string; iconBg: string; iconText: string }> = {
              blue:    { active: 'bg-blue-50 border-blue-400', iconBg: 'bg-blue-100', iconText: 'text-blue-600' },
              amber:   { active: 'bg-amber-50 border-amber-400', iconBg: 'bg-amber-100', iconText: 'text-amber-600' },
              rose:    { active: 'bg-rose-50 border-rose-400', iconBg: 'bg-rose-100', iconText: 'text-rose-600' },
              violet:  { active: 'bg-violet-50 border-violet-400', iconBg: 'bg-violet-100', iconText: 'text-violet-600' },
              emerald: { active: 'bg-emerald-50 border-emerald-400', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
            }
            const c = colorMap[tab.color]
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg border-2 transition-all duration-200 whitespace-nowrap ${isActive ? c.active : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <div className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isActive ? c.iconBg : 'bg-slate-100'}`}>
                  <tab.icon className={`w-3.5 h-3.5 transition-colors ${isActive ? c.iconText : 'text-slate-400'}`} />
                </div>
                <span className={`hidden sm:inline text-[11px] sm:text-xs font-semibold transition-colors ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

          <div className="p-4 sm:p-6">
            {/* ===== TAB: UMUM ===== */}
            {activeTab === 'umum' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1">{t('pengaturan_umum')}</h3>
                    <p className="text-xs sm:text-sm text-slate-500">{t('pengaturan_umum_desc')}</p>
                  </div>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 ${showPreview ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {t('pratinjau')}
                    {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* ===== PRATINJAU (PREVIEW) ===== */}
                {showPreview && (
                  <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center gap-1.5">
                      <Eye className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('pratinjau_dokumen')}</span>
                    </div>
                    <div className="p-4 sm:p-5">
                      {/* Document-style preview */}
                      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                        {/* Header - Logo + Company Info */}
                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-white font-bold text-base"
                            style={{ backgroundColor: companyLogo ? 'transparent' : '#1e293b' }}
                          >
                            {companyLogo ? (
                              <img src={companyLogo} alt="Logo" className="h-full w-full object-contain rounded" />
                            ) : (
                              <span>{(companyName || 'C').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-slate-900 truncate">
                              {companyName || t('placeholder_nama_perusahaan')}
                            </p>
                            {address && (
                              <div className="flex items-start gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-slate-500 leading-tight">{address}</p>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span className="text-[11px] text-slate-500">{phone}</span>
                                </div>
                              )}
                              {email && (
                                <div className="flex items-center gap-1">
                                  <Mail className="w-3 h-3 text-slate-400" />
                                  <span className="text-[11px] text-slate-500">{email}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="border-b-2 border-slate-800 mb-3" />

                        {/* Bank & NPWP Info */}
                        {(bankName || bankName2 || npwp) && (
                          <div className="space-y-2">
                            {bankName && (
                              <div className="flex items-start gap-2 p-2 bg-teal-50/70 rounded-lg border border-teal-100">
                                <CreditCard className="w-3.5 h-3.5 text-teal-600 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold text-teal-700">{bankName}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0">
                                    {bankAccount && (
                                      <p className="text-[11px] text-slate-700 font-mono">{bankAccount}</p>
                                    )}
                                    {bankHolder && (
                                      <p className="text-[11px] text-slate-500">a.n. {bankHolder}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {bankName2 && (
                              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                <CreditCard className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold text-slate-600">{bankName2}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0">
                                    {bankAccount2 && (
                                      <p className="text-[11px] text-slate-700 font-mono">{bankAccount2}</p>
                                    )}
                                    {bankHolder2 && (
                                      <p className="text-[11px] text-slate-500">a.n. {bankHolder2}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {npwp && (
                              <div className="flex items-center gap-2 p-2 bg-amber-50/70 rounded-lg border border-amber-100">
                                <Hash className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                <div>
                                  <span className="text-[10px] font-semibold text-amber-700">NPWP</span>
                                  <span className="text-[11px] text-slate-700 ml-1.5 font-mono">{npwp}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Empty state */}
                        {!companyName && !address && !phone && !email && !bankName && !bankName2 && !npwp && (
                          <div className="text-center py-6">
                            <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-xs text-slate-400">{t('pratinjau_kosong')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('logo_perusahaan')}</label>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {companyLogo ? (
                          <div className="relative group">
                            <img src={companyLogo} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                            <button onClick={handleRemoveLogo} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-400" /></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                            {uploadingLogo ? <><Loader2 className="w-4 h-4 animate-spin" />{t('mengupload')}</> : <><Upload className="w-4 h-4" />{t('upload_logo')}</>}
                            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
                          </label>
                          <button type="button" onClick={handleCameraCapture} disabled={uploadingLogo} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors">
                            {uploadingLogo ? <><Loader2 className="w-4 h-4 animate-spin" />{t('mengupload')}</> : <><Camera className="w-4 h-4" />{t('ambil_foto')}</>}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">{t('logo_format_hint_auto')}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('nama_perusahaan')}</label>
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('perusahaan_placeholder')} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('alamat')}</label>
                    <textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('alamat_placeholder')} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('email')}</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('email_placeholder')} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('telepon')}</label>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('telepon_placeholder')} className={inputClass} />
                    </div>
                  </div>

                  {/* Bank Info */}
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-4 h-4 text-teal-600" />
                      <h4 className="text-sm font-semibold text-slate-700">{t('bank_utama')}</h4>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('nama_bank')}</label>
                        <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={t('placeholder_nama_bank')} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('nomor_rekening')}</label>
                          <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder={t('placeholder_nomor_rekening')} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('atas_nama')}</label>
                          <input type="text" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder={t('placeholder_atas_nama')} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-4 h-4 text-slate-400" />
                      <h4 className="text-sm font-semibold text-slate-700">{t('bank_kedua')}</h4>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{t('opsional')}</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('nama_bank')}</label>
                        <input type="text" value={bankName2} onChange={(e) => setBankName2(e.target.value)} placeholder={t('placeholder_nama_bank')} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('nomor_rekening')}</label>
                          <input type="text" value={bankAccount2} onChange={(e) => setBankAccount2(e.target.value)} placeholder={t('placeholder_nomor_rekening')} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('atas_nama')}</label>
                          <input type="text" value={bankHolder2} onChange={(e) => setBankHolder2(e.target.value)} placeholder={t('placeholder_atas_nama')} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">{t('npwp')}</label>
                      <input type="text" value={npwp} onChange={(e) => setNpwp(e.target.value)} placeholder={t('placeholder_npwp')} className={inputClass} />
                    </div>
                  </div>

                  {/* WhatsApp API Settings */}
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-sm font-semibold text-slate-700">WhatsApp API</h4>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Fonnte</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Untuk mengirim password otomatis ke WhatsApp user saat lupa password. Daftar di <a href="https://fonnte.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">fonnte.com</a> untuk mendapatkan API key.</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">API Key Fonnte</label>
                        <input type="password" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} placeholder="Masukkan API key dari Fonnte" className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">API URL</label>
                        <input type="url" value={waApiUrl} onChange={(e) => setWaApiUrl(e.target.value)} placeholder="https://api.fonnte.com/send" className={inputClass} />
                        <p className="text-[11px] text-slate-400 mt-1">Default: https://api.fonnte.com/send</p>
                      </div>
                    </div>
                  </div>

                  {/* Save & Reset Company Info */}
                  <div className="pt-4 border-t border-slate-200 flex items-center gap-3">
                    <Button onClick={handleSaveCompany} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('menyimpan')}</> : <><Save className="w-4 h-4 mr-2" />{t('simpan')}</>}
                    </Button>
                    <Button onClick={handleResetCompany} disabled={saving} variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700">
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t('reset')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: DATABASE ===== */}
            {activeTab === 'database' && (
              <div className="space-y-4 sm:space-y-6">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">{t('pengaturan_database')}</h3>
                <div className="space-y-5">
                  {/* Backup Master Cetak */}
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Database className="w-4 h-4 text-violet-600" />
                      <h4 className="text-sm font-semibold text-slate-700">{t('backup_master_title')}</h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{t('backup_master_desc')}</p>
                    <div className="space-y-2">
                      {MASTER_TABLES.map((tbl) => (
                        <div key={tbl.key} className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base">{tbl.icon}</span>
                            <span className="text-xs font-medium text-slate-700 truncate">{t(tbl.label as any)}</span>
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{masterCounts[tbl.key] ?? '...'} {t('records_count')}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button
                              onClick={() => handleBackupMaster(tbl.key)}
                              disabled={masterLoading === tbl.key + '-backup'}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] border-violet-300 text-violet-700 hover:bg-violet-50"
                            >
                              {masterLoading === tbl.key + '-backup' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                              {t('backup')}
                            </Button>
                            <Button
                              onClick={() => handleRestoreMaster(tbl.key)}
                              disabled={masterLoading === tbl.key + '-restore'}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] border-blue-300 text-blue-700 hover:bg-blue-50"
                            >
                              {masterLoading === tbl.key + '-restore' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                              {t('restore')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Backup Riwayat */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-sm font-semibold text-slate-700">{t('backup_riwayat_title')}</h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{t('backup_riwayat_desc')}</p>
                    <div className="space-y-2">
                      {RIWAYAT_TABLES.map((tbl) => (
                        <div key={tbl.key} className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base">{tbl.icon}</span>
                            <span className="text-xs font-medium text-slate-700 truncate">{t(tbl.label as any)}</span>
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{riwayatCounts[tbl.key] ?? '...'} {t('records_count')}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button
                              onClick={() => handleBackupRiwayat(tbl.key)}
                              disabled={riwayatLoading === tbl.key + '-backup'}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            >
                              {riwayatLoading === tbl.key + '-backup' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                              {t('backup')}
                            </Button>
                            <Button
                              onClick={() => handleRestoreRiwayat(tbl.key)}
                              disabled={riwayatLoading === tbl.key + '-restore'}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] border-blue-300 text-blue-700 hover:bg-blue-50"
                            >
                              {riwayatLoading === tbl.key + '-restore' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                              {t('restore')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3"><Timer className="w-4 h-4 text-blue-600" /><h4 className="text-sm font-semibold text-slate-700">{t('auto_backup_title')}</h4></div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-1">{t('auto_backup_interval')}</label>
                        <input type="number" value={autoBackupDays} onChange={(e) => setAutoBackupDays(parseInt(e.target.value) || 1)} min="1" max="365" className={`${inputClass} max-w-[120px]`} />
                      </div>
                      <Button onClick={handleSaveAutoBackup} disabled={saving} size="sm" className="mt-4"><Save className="w-3.5 h-3.5 mr-1.5" />{saving ? t('menyimpan') : t('simpan')}</Button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">{t('auto_backup_desc')} {autoBackupDays} {t('auto_backup_unit')}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-slate-600" /><h4 className="text-sm font-semibold text-slate-700">{t('backup_history')}</h4></div>
                      <button onClick={fetchBackups} disabled={loadingBackups} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />{t('refresh')}</button>
                    </div>
                    {loadingBackups ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                    ) : backups.length === 0 ? (
                      <div className="text-center py-8 text-slate-400"><FileJson className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-xs">{t('no_backup_yet')}</p></div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {backups.map((b) => (
                          <div key={b.fileName} className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${b.fileName.startsWith('auto-backup') ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                                {b.fileName.startsWith('auto-backup') ? <Timer className="w-4 h-4 text-blue-500" /> : <Database className="w-4 h-4 text-emerald-500" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-700 truncate">{b.fileName}</p>
                                <p className="text-[10px] text-slate-400">{b.rowCount} {t('records')} • {b.sizeFormatted} • {new Date(b.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {showRestoreConfirm === b.fileName ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleRestoreFromServer(b.fileName)} disabled={restoreLoading} className="px-2 py-1 text-[10px] font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors">{restoreLoading ? '...' : t('confirm_restore')}</button>
                                  <button onClick={() => setShowRestoreConfirm(null)} className="px-2 py-1 text-[10px] font-medium bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors">{t('batal')}</button>
                                </div>
                              ) : (
                                <>
                                  <button onClick={() => setShowRestoreConfirm(b.fileName)} disabled={restoreLoading || backupLoading} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title={t('restore')}><RotateCcw className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleDeleteBackup(b.fileName)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title={t('hapus')}><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: PROFIT ===== */}
            {activeTab === 'profit' && (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1">{t('persentase_profit')}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">{t('profit_desc')}</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">{t('profit_per_cetak')}</label>
                      <div className="relative">
                        <input type="number" min="0" max="999" step="0.1" value={profitPercent} onChange={(e) => setProfitPercent(e.target.value)} placeholder={t('contoh_angka')} className={`${inputClass} pr-10 text-lg font-bold text-amber-700`} disabled={loading} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-amber-500">%</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">{t('profit_desc_detail')}</p>
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-xs font-medium text-amber-600">{t('simulasi')}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">{t('sub_total')}</span>
                            <span className="text-sm font-semibold text-slate-700">Rp 1.000.000</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-amber-600">{t('persentase_profit')} ({profitPercent || 0}%)</span>
                            <span className="text-sm font-bold text-amber-700">Rp {(1000000 * (parseFloat(profitPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                          <div className="border-t border-amber-200 pt-2 flex justify-between items-center">
                            <span className="text-xs font-semibold text-emerald-700">{t('grand_total')}</span>
                            <span className="text-base font-bold text-emerald-700">Rp {(1000000 + 1000000 * (parseFloat(profitPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-200 flex items-center gap-3">
                    <Button onClick={handleSaveProfit} disabled={saving || loading} className="bg-amber-600 hover:bg-amber-700 text-white">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('menyimpan')}</> : <><Save className="w-4 h-4 mr-2" />{t('simpan_profit')}</>}
                    </Button>
                    <Button onClick={async () => { setLoading(true); await fetchProfitSetting(); setLoading(false); toast.success(t('profit_refreshed')) }} variant="outline" size="sm" disabled={loading}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Refresh
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: DOKUMEN ===== */}
            {activeTab === 'dokumen' && (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1">Data Perusahaan</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">Pengaturan data perusahaan untuk dokumen invoice, surat jalan, dan purchase order.</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">PPN (%)</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" step="0.1" value={ppnPercent} onChange={(e) => setPpnPercent(e.target.value)} placeholder="11" className={`${inputClass} pr-10 text-lg font-bold text-rose-700`} disabled={loading} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-rose-500">%</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">Persentase PPN default yang akan diterapkan ke Invoice dan Purchase Order.</p>
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                          <span className="text-xs font-medium text-rose-600">Simulasi</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Sub Total</span>
                            <span className="text-sm font-semibold text-slate-700">Rp 1.000.000</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-rose-600">PPN ({ppnPercent || 0}%)</span>
                            <span className="text-sm font-bold text-rose-700">Rp {(1000000 * (parseFloat(ppnPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                          <div className="border-t border-rose-200 pt-2 flex justify-between items-center">
                            <span className="text-xs font-semibold text-emerald-700">Grand Total</span>
                            <span className="text-base font-bold text-emerald-700">Rp {(1000000 + 1000000 * (parseFloat(ppnPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-200 flex items-center gap-3">
                    <Button onClick={handleSavePpn} disabled={saving || loading} className="bg-rose-600 hover:bg-rose-700 text-white">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : <><Save className="w-4 h-4 mr-2" />Simpan PPN</>}
                    </Button>
                    <Button onClick={async () => { setLoading(true); await fetchPpnSetting(); setLoading(false); toast.success('PPN berhasil di-refresh') }} variant="outline" size="sm" disabled={loading}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Refresh
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: TAMPILAN ===== */}
            {activeTab === 'tampilan' && (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1">{t('pengaturan_tampilan')}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">{t('tema_warna_aplikasi')}</p>
                </div>
                <div className="space-y-5">
                  {/* Language */}
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('bahasa')}</label>
                    <select value={appLanguage} onChange={(e) => setAppLanguage(e.target.value as Language)} className={inputClass}>
                      <option value="id">{t('bahasa_indonesia')}</option>
                      <option value="en">{t('english')}</option>
                    </select>
                  </div>
                  {/* Font Size */}
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">{t('ukuran_font')}</label>
                    <select value={fontSize} onChange={(e) => { setFontSize(e.target.value); applyFontSizeLive(e.target.value) }} className={inputClass}>
                      <option value="small">{t('kecil')}</option>
                      <option value="medium">{t('sedang')}</option>
                      <option value="large">{t('besar')}</option>
                    </select>
                  </div>

                  {/* ===== COLOR PICKERS ===== */}
                  <div className="border-t border-slate-200 pt-5">
                    <div className="flex items-center gap-2 mb-5">
                      <Pipette className="w-4 h-4 text-violet-600" />
                      <h4 className="text-sm font-semibold text-slate-700">{t('tema_warna_aplikasi')}</h4>
                    </div>
                    <div className="space-y-6">
                      <ColorPicker
                        label={t('color_sidebar')}
                        icon={<div className="w-4 h-4 rounded bg-slate-400 border border-slate-300" />}
                        value={sidebarColor}
                        onChange={handleSidebarColorChange}
                        presets={colorPresets.sidebar}
                      />
                      <ColorPicker
                        label={t('color_background')}
                        icon={<div className="w-4 h-4 rounded bg-slate-100 border border-slate-300" />}
                        value={bgColor}
                        onChange={handleBgColorChange}
                        presets={colorPresets.background}
                      />
                      <ColorPicker
                        label={t('color_popup')}
                        icon={<div className="w-4 h-4 rounded bg-white border border-slate-300" />}
                        value={popupColor}
                        onChange={handlePopupColorChange}
                        presets={colorPresets.popup}
                      />
                      <ColorPicker
                        label={t('color_banner')}
                        icon={<div className="w-4 h-4 rounded bg-blue-50 border border-slate-300" />}
                        value={bannerColor}
                        onChange={handleBannerColorChange}
                        presets={colorPresets.banner}
                      />
                      <ColorPicker
                        label={t('color_login')}
                        icon={<div className="w-4 h-4 rounded bg-sky-100 border border-slate-300" />}
                        value={loginColor}
                        onChange={handleLoginColorChange}
                        presets={colorPresets.login}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
                      <Button onClick={handleResetColors} variant="outline" size="sm">
                        <Undo2 className="w-3.5 h-3.5 mr-1.5" />{t('color_default')}
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Save Perubahan Button */}
                <div className="pt-4 border-t border-slate-200">
                  <Button onClick={handleSaveTampilan} disabled={saving} className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700 text-white">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('menyimpan')}</> : <><Save className="w-4 h-4 mr-2" />{t('simpan_perubahan')}</>}
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
