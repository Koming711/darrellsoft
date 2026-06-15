'use client'

import { Wrench, Save, Database, Palette, Monitor, Percent, Loader2, RefreshCw, CalendarDays, Clock, UserCircle, Upload, X, ImageIcon, Download, Trash2, HardDrive, AlertTriangle, RotateCcw, FileJson, Timer, Pipette, Undo2, Camera, ArrowUpDown, Landmark, Eye, ChevronDown, ChevronUp, Building2, Phone, Mail, MapPin, CreditCard, Hash, FileText, Moon, Sun } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { useTheme } from 'next-themes'
import { persistDarkMode } from '@/contexts/theme-context'
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

}

export default function PengaturanPage() {
  const inputClass = 'w-full border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors'
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

  // Database settings
  const [autoBackupDays, setAutoBackupDays] = useState(7)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [backups, setBackups] = useState<Array<{ fileName: string; size: number; sizeFormatted: string; createdAt: string; timestamp: string; tableCount: number; rowCount: number }>>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null)
  const [lastAutoBackup, setLastAutoBackup] = useState<string | null>(null)
  const [nextAutoBackup, setNextAutoBackup] = useState<string | null>(null)

  // Display settings
  const [fontSize, setFontSize] = useState('medium')

  // Color settings
  const [sidebarColor, setSidebarColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState('#f8fafc')
  const [bannerColor, setBannerColor] = useState('#ffffff')
  const [sidebarTextColor, setSidebarTextColor] = useState('dark')
  // savingColors removed - colors are now saved via handleSaveTampilan

  // Dark mode
  const [darkMode, setDarkMode] = useState(false)
  const { setTheme } = useTheme()
  const setThemeRef = useRef(setTheme)
  setThemeRef.current = setTheme
  const initialColorFetchDone = useRef(false)

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
      const keys = ['company_name', 'company_logo', 'company_address', 'company_email', 'company_phone', 'bank_name', 'bank_account', 'bank_holder', 'bank_name2', 'bank_account2', 'bank_holder2', 'npwp']
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
    } catch { /* silent */ }
  }, [])

  // Fetch color settings
  const fetchColorSettings = useCallback(async () => {
    if (initialColorFetchDone.current) return
    initialColorFetchDone.current = true
    try {
      const keys = ['theme_sidebar_color', 'theme_bg_color', 'theme_banner_color', 'app_font_size', 'theme_dark_mode']
      const results = await Promise.all(keys.map(k => authFetch(`/api/settings?key=${k}`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null)))
      // Apply dark mode FIRST so isDarkActive() works in apply functions
      if (results[4]?.value) {
        const isDark = results[4].value === 'true'
        setDarkMode(isDark)
        setThemeRef.current(isDark ? 'dark' : 'light')
        if (isDark) {
          // Give next-themes a tick to apply the .dark class
          await new Promise(r => setTimeout(r, 50))
        }
      }
      // Then apply colors (they will check isDarkActive and skip if dark)
      if (results[0]?.value) { setSidebarColor(results[0].value); applySidebarColor(results[0].value) }
      if (results[1]?.value) { setBgColor(results[1].value); applyBgColor(results[1].value) }
      if (results[2]?.value) { setBannerColor(results[2].value); applyBannerColor(results[2].value) }
      if (results[3]?.value) { setFontSize(results[3].value); applyFontSizeLive(results[3].value) }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    Promise.all([fetchProfile(), fetchProfitSetting(), fetchPpnSetting(), fetchGeneralSettings(), fetchColorSettings()]).finally(() => setLoading(false))
  }, [fetchProfile, fetchProfitSetting, fetchPpnSetting, fetchGeneralSettings, fetchColorSettings])

  // Apply colors to CSS variables (immediate live preview)
  // Helper to check if dark mode is currently active
  const isDarkActive = () => document.documentElement.classList.contains('dark')

  // Variables that should be cleared in dark mode so .dark CSS takes effect
  const darkModeClearedVars = [
    '--app-sidebar-bg', '--app-sidebar-border', '--app-sidebar-text', '--app-sidebar-text-muted',
    '--app-sidebar-active-bg', '--app-sidebar-active-text',
    '--app-content-bg',
    '--app-banner-bg', '--app-banner-text', '--app-banner-text-muted',
  ]

  const clearInlineOverridesForDarkMode = () => {
    for (const varName of darkModeClearedVars) {
      document.documentElement.style.removeProperty(varName)
    }
    document.documentElement.style.removeProperty('--background')
    document.documentElement.style.removeProperty('--popover')
    document.documentElement.style.removeProperty('--card')
  }

  const applySidebarColor = (color: string) => {
    if (isDarkActive()) return // Let .dark CSS vars take over
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
    if (isDarkActive()) return
    document.documentElement.style.setProperty('--app-content-bg', color)
  }

  const applyBannerColor = (color: string) => {
    if (isDarkActive()) return
    const isLight = isLightColor(color)
    document.documentElement.style.setProperty('--app-banner-bg', color)
    document.documentElement.style.setProperty('--app-banner-text', isLight ? '#1e293b' : '#f1f5f9')
    document.documentElement.style.setProperty('--app-banner-text-muted', isLight ? '#64748b' : '#94a3b8')
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

  const handleBannerColorChange = (color: string) => {
    setBannerColor(color)
    applyBannerColor(color)
  }

  const isLightColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 128
  }

  const handleResetColors = async () => {
    const defaults = { sidebar: '#ffffff', bg: '#f8fafc', banner: '#ffffff' }
    setSidebarColor(defaults.sidebar)
    setBgColor(defaults.bg)
    setBannerColor(defaults.banner)
    setDarkMode(false)
    setThemeRef.current('light')
    persistDarkMode(false)
    // Also save dark mode OFF to database
    try {
      await authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_dark_mode', value: 'false' }) })
    } catch { /* silent */ }
    applySidebarColor(defaults.sidebar)
    applyBgColor(defaults.bg)
    applyBannerColor(defaults.banner)
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
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_banner_color', value: bannerColor }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'app_language', value: appLanguage }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'app_font_size', value: fontSize }) }),
        authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_dark_mode', value: darkMode ? 'true' : 'false' }) }),
      ])
      setThemeRef.current(darkMode ? 'dark' : 'light')
      persistDarkMode(darkMode)
      if (darkMode) {
        clearInlineOverridesForDarkMode()
      } else {
        applySidebarColor(sidebarColor)
        applyBgColor(bgColor)
        applyBannerColor(bannerColor)
      }
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

  // Fetch auto-backup status
  const fetchAutoBackupStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/database/auto-backup', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setLastAutoBackup(data.lastBackup || null)
          setNextAutoBackup(data.nextBackup || null)
        }
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchAutoBackupDays(); fetchAutoBackupStatus() }, [fetchAutoBackupDays, fetchAutoBackupStatus])

  const handleBackupDatabase = async () => {
    setBackupLoading(true)
    try {
      const res = await authFetch('/api/database/backup', { method: 'POST', headers: getAuthHeaders() })
      if (res.ok) {
        const blob = await res.blob()
        if (blob.size === 0) {
          toast.error('Backup kosong — tidak ada data')
          return
        }
        // Extract filename from Content-Disposition header
        const disposition = res.headers.get('Content-Disposition')
        const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
        const fileName = match ? match[1] : `backup-${Date.now()}.xlsx`
        const fileCount = res.headers.get('X-Backup-FileCount') || '?'

        // Download the Excel file
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success(`${t('backup_success')} ${fileCount} ${t('records')} — ${fileName}`)
        fetchBackups()
      } else {
        let errMsg = t('backup_error')
        try { const errData = await res.json(); errMsg = errData?.error || errMsg } catch {}
        toast.error(errMsg)
      }
    } catch { toast.error(t('backup_error')) }
    setBackupLoading(false)
  }

  const handleRestoreFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setShowRestoreConfirm(null); setRestoreLoading(true)
    try {
      if (file.name.endsWith('.xlsx')) {
        // Excel file — upload via FormData
        const formData = new FormData()
        formData.append('file', file)
        const res = await authFetch('/api/database/restore', {
          method: 'POST',
          body: formData
        })
        if (res.ok) { const data = await res.json(); if (data.success) toast.success(`${t('restore_success')} ${data.restoredTables} ${t('restore_table_count')} ${t('restore_from')} ${file.name}`); else toast.error(data.error || t('restore_error')) }
        else { const data = await res.json(); toast.error(data.error || t('restore_error')) }
      } else {
        // JSON file (backward compatibility)
        const text = await file.text(); const backupData = JSON.parse(text)
        const res = await authFetch('/api/database/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ backupData }) })
        if (res.ok) { const data = await res.json(); if (data.success) toast.success(`${t('restore_success')} ${data.restoredTables} ${t('restore_table_count')} ${t('restore_from')} ${file.name}`); else toast.error(data.error || t('restore_error')) }
        else { const data = await res.json(); toast.error(data.error || t('restore_error')) }
      }
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

  // Color picker component
  const ColorPicker = ({ label, icon, value, onChange, presets }: { label: string; icon: React.ReactNode; value: string; onChange: (v: string) => void; presets: { name: string; value: string }[] }) => (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {icon}
        <label className="text-xs sm:text-sm font-medium text-foreground">{label}</label>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer p-0.5"
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
            className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${value === p.value ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800 scale-110' : 'border-border hover:border-input'}`}
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
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border bg-gradient-to-r from-muted/50 to-muted">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t('informasi_akun')}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('detail_akun')}</p>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('username')}</p>
                      <p className="text-sm font-semibold text-foreground truncate">{userProfile.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('nama_lengkap')}</p>
                      <p className="text-sm font-semibold text-foreground truncate">{userProfile.namaLengkap}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('role')}</p>
                      <p className="text-sm font-semibold text-foreground capitalize">{userProfile.role}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                    <CalendarDays className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-medium">{t('tanggal_daftar')}</p>
                      <p className="text-sm font-semibold text-foreground">
                        {userProfile.createdAt ? new Date(userProfile.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">{t('masa_berlaku')}</p>
                      {userProfile.validUntil ? (() => {
                        const expDate = new Date(userProfile.validUntil)
                        const diffDays = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        const isExpired = diffDays <= 0
                        return (
                          <>
                            <p className={`text-sm font-semibold ${isExpired ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                              {expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            <p className={`text-[11px] font-medium ${isExpired ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {isExpired ? t('sudah_berakhir') : `${diffDays} ${t('hari_tersisa')}`}
                            </p>
                          </>
                        )
                      })() : (
                        <p className="text-sm italic text-muted-foreground">{t('tidak_ada_masa_berlaku')}</p>
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
              blue:    { active: 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-600', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconText: 'text-blue-600 dark:text-blue-400' },
              amber:   { active: 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-600', iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconText: 'text-amber-600 dark:text-amber-400' },
              rose:    { active: 'bg-rose-50 dark:bg-rose-950/30 border-rose-400 dark:border-rose-600', iconBg: 'bg-rose-100 dark:bg-rose-900/40', iconText: 'text-rose-600 dark:text-rose-400' },
              violet:  { active: 'bg-violet-50 dark:bg-violet-950/30 border-violet-400 dark:border-violet-600', iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconText: 'text-violet-600 dark:text-violet-400' },
              emerald: { active: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-600 dark:text-emerald-400' },
            }
            const c = colorMap[tab.color]
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg border-2 transition-all duration-200 whitespace-nowrap ${isActive ? c.active : 'bg-card border-border hover:border-input hover:bg-muted/50'}`}>
                <div className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isActive ? c.iconBg : 'bg-muted'}`}>
                  <tab.icon className={`w-3.5 h-3.5 transition-colors ${isActive ? c.iconText : 'text-muted-foreground'}`} />
                </div>
                <span className={`hidden sm:inline text-[11px] sm:text-xs font-semibold transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">

          <div className="p-4 sm:p-6">
            {/* ===== TAB: UMUM ===== */}
            {activeTab === 'umum' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">{t('pengaturan_umum')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('pengaturan_umum_desc')}</p>
                  </div>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 ${showPreview ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300' : 'bg-card border-border text-muted-foreground hover:border-input hover:text-foreground'}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {t('pratinjau')}
                    {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* ===== PRATINJAU (PREVIEW) ===== */}
                {showPreview && (
                  <div className="rounded-xl border border-border bg-gradient-to-br from-muted/50 to-card shadow-sm overflow-hidden">
                    <div className="px-3 py-2 bg-muted/80 border-b border-border flex items-center gap-1.5">
                      <Eye className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('pratinjau_dokumen')}</span>
                    </div>
                    <div className="p-4 sm:p-5">
                      {/* Document-style preview */}
                      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                        {/* Header - Logo + Company Info */}
                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-white font-bold text-base"
                            style={{ backgroundColor: companyLogo ? 'transparent' : (darkMode ? '#64748b' : '#1e293b') }}
                          >
                            {companyLogo ? (
                              <img src={companyLogo} alt="Logo" className="h-full w-full object-contain rounded" />
                            ) : (
                              <span>{(companyName || 'C').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-foreground truncate">
                              {companyName || ''}
                            </p>
                            {address && (
                              <div className="flex items-start gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted-foreground leading-tight">{address}</p>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-[11px] text-muted-foreground">{phone}</span>
                                </div>
                              )}
                              {email && (
                                <div className="flex items-center gap-1">
                                  <Mail className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-[11px] text-muted-foreground">{email}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="border-b-2 border-foreground mb-3" />

                        {/* Bank & NPWP Info */}
                        {(bankName || bankName2 || npwp) && (
                          <div className="space-y-2">
                            {bankName && (
                              <div className="flex items-start gap-2 p-2 bg-teal-50/70 dark:bg-teal-950/30 rounded-lg border border-teal-100 dark:border-teal-800">
                                <CreditCard className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold text-teal-700 dark:text-teal-400">{bankName}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0">
                                    {bankAccount && (
                                      <p className="text-[11px] text-foreground font-mono">{bankAccount}</p>
                                    )}
                                    {bankHolder && (
                                      <p className="text-[11px] text-muted-foreground">a.n. {bankHolder}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {bankName2 && (
                              <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg border border-border">
                                <CreditCard className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{bankName2}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0">
                                    {bankAccount2 && (
                                      <p className="text-[11px] text-foreground font-mono">{bankAccount2}</p>
                                    )}
                                    {bankHolder2 && (
                                      <p className="text-[11px] text-muted-foreground">a.n. {bankHolder2}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {npwp && (
                              <div className="flex items-center gap-2 p-2 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg border border-amber-100 dark:border-amber-800">
                                <Hash className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                <div>
                                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">NPWP</span>
                                  <span className="text-[11px] text-foreground ml-1.5 font-mono">{npwp}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Empty state */}
                        {!companyName && !address && !phone && !email && !bankName && !bankName2 && !npwp && (
                          <div className="text-center py-6">
                            <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">{t('pratinjau_kosong')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('logo_perusahaan')}</label>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {companyLogo ? (
                          <div className="relative group">
                            <img src={companyLogo} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-border" />
                            <button onClick={handleRemoveLogo} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-muted border-2 border-dashed border-input flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-card border border-input rounded-lg text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
                            {uploadingLogo ? <><Loader2 className="w-4 h-4 animate-spin" />{t('mengupload')}</> : <><Upload className="w-4 h-4" />{t('upload_logo')}</>}
                            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
                          </label>
                          <button type="button" onClick={handleCameraCapture} disabled={uploadingLogo} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors">
                            {uploadingLogo ? <><Loader2 className="w-4 h-4 animate-spin" />{t('mengupload')}</> : <><Camera className="w-4 h-4" />{t('ambil_foto')}</>}
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5">{t('logo_format_hint_auto')}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('nama_perusahaan')}</label>
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('perusahaan_placeholder')} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('alamat')}</label>
                    <textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('alamat_placeholder')} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('email')}</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('email_placeholder')} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('telepon')}</label>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('telepon_placeholder')} className={inputClass} />
                    </div>
                  </div>

                  {/* Bank Info */}
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <h4 className="text-sm font-semibold text-foreground">{t('bank_utama')}</h4>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('nama_bank')}</label>
                        <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={t('placeholder_nama_bank')} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('nomor_rekening')}</label>
                          <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder={t('placeholder_nomor_rekening')} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('atas_nama')}</label>
                          <input type="text" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder={t('placeholder_atas_nama')} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">{t('bank_kedua')}</h4>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{t('opsional')}</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('nama_bank')}</label>
                        <input type="text" value={bankName2} onChange={(e) => setBankName2(e.target.value)} placeholder={t('placeholder_nama_bank')} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('nomor_rekening')}</label>
                          <input type="text" value={bankAccount2} onChange={(e) => setBankAccount2(e.target.value)} placeholder={t('placeholder_nomor_rekening')} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('atas_nama')}</label>
                          <input type="text" value={bankHolder2} onChange={(e) => setBankHolder2(e.target.value)} placeholder={t('placeholder_atas_nama')} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5">{t('npwp')}</label>
                      <input type="text" value={npwp} onChange={(e) => setNpwp(e.target.value)} placeholder={t('placeholder_npwp')} className={inputClass} />
                    </div>
                  </div>

                  {/* Save & Reset Company Info */}
                  <div className="pt-4 border-t border-border flex items-center gap-3">
                    <Button onClick={handleSaveCompany} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('menyimpan')}</> : <><Save className="w-4 h-4 mr-2" />{t('simpan')}</>}
                    </Button>
                    <Button onClick={handleResetCompany} disabled={saving} variant="outline" size="sm" className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300">
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t('reset')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: DATABASE ===== */}
            {activeTab === 'database' && (
              <div className="space-y-4 sm:space-y-6">
                <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">{t('pengaturan_database')}</h3>
                <div className="space-y-5">
                  {/* Full Database Backup & Restore */}
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-sm font-semibold text-foreground">{t('backup_full_title')}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{t('backup_full_desc')}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={handleBackupDatabase}
                        disabled={backupLoading}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs"
                      >
                        {backupLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                        {t('backup_semua')}
                      </Button>
                      <label className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-md cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                        {restoreLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {t('restore_dari_file')}
                        <input type="file" accept=".json,.xlsx" onChange={handleRestoreFromFile} className="hidden" disabled={restoreLoading} />
                      </label>

                    </div>
                  </div>

                  <div className="bg-muted/50 border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3"><h4 className="text-sm font-semibold text-foreground">{t('auto_backup_title')}</h4></div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-muted-foreground mb-1">{t('auto_backup_interval')}</label>
                        <input type="number" value={autoBackupDays} onChange={(e) => setAutoBackupDays(parseInt(e.target.value) || 1)} min="1" max="365" className={`${inputClass} max-w-[120px]`} />
                      </div>
                      <Button onClick={handleSaveAutoBackup} disabled={saving} size="sm" className="mt-4">{saving ? t('menyimpan') : t('simpan')}</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">{t('auto_backup_desc')} {autoBackupDays} {t('auto_backup_unit')}</p>
                    {lastAutoBackup && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                        ✅ {t('last_backup')}: {new Date(lastAutoBackup).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {nextAutoBackup && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        ⏰ {t('next_backup')}: {new Date(nextAutoBackup).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><h4 className="text-sm font-semibold text-foreground">{t('backup_history')}</h4></div>
                      <button onClick={fetchBackups} disabled={loadingBackups} className="text-xs text-blue-600 hover:text-blue-700 dark:hover:text-blue-400">{t('refresh')}</button>
                    </div>
                    {loadingBackups ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : backups.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground"><p className="text-xs">{t('no_backup_yet')}</p></div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {backups.map((b) => (
                          <div key={b.fileName} className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-lg hover:border-input transition-colors">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${b.fileName.startsWith('auto-backup') ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600'}`}>
                                {b.fileName.startsWith('auto-backup') ? 'A' : 'M'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{b.fileName}</p>
                                <p className="text-[10px] text-muted-foreground">{b.rowCount} {t('records')} • {b.sizeFormatted} • {new Date(b.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {showRestoreConfirm === b.fileName ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleRestoreFromServer(b.fileName)} disabled={restoreLoading} className="px-2 py-1 text-[10px] font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors">{restoreLoading ? '...' : t('confirm_restore')}</button>
                                  <button onClick={() => setShowRestoreConfirm(null)} className="px-2 py-1 text-[10px] font-medium bg-muted text-slate-600 dark:text-slate-300 rounded hover:bg-muted/80 transition-colors">{t('batal')}</button>
                                </div>
                              ) : (
                                <>
                                  <button onClick={() => setShowRestoreConfirm(b.fileName)} disabled={restoreLoading || backupLoading} className="p-1.5 text-xs font-medium text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors" title={t('restore')}>{t('restore')}</button>
                                  <button onClick={() => handleDeleteBackup(b.fileName)} className="p-1.5 text-xs font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors" title={t('hapus')}>{t('hapus')}</button>
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
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">{t('persentase_profit')}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4">{t('profit_desc')}</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('profit_per_cetak')}</label>
                      <div className="relative">
                        <input type="number" min="0" max="999" step="0.1" value={profitPercent} onChange={(e) => setProfitPercent(e.target.value)} placeholder={t('contoh_angka')} className={`${inputClass} pr-10 text-lg font-bold text-amber-700 dark:text-amber-400`} disabled={loading} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-amber-500 dark:text-amber-400">%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">{t('profit_desc_detail')}</p>
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="bg-gradient-to-br from-amber-50 dark:from-amber-950/30 to-orange-50 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('simulasi')}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">{t('sub_total')}</span>
                            <span className="text-sm font-semibold text-foreground">Rp 1.000.000</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-amber-600 dark:text-amber-400">{t('persentase_profit')} ({profitPercent || 0}%)</span>
                            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Rp {(1000000 * (parseFloat(profitPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                          <div className="border-t border-amber-200 dark:border-amber-800 pt-2 flex justify-between items-center">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t('grand_total')}</span>
                            <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">Rp {(1000000 + 1000000 * (parseFloat(profitPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border flex items-center gap-3">
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
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">Data Perusahaan</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4">Pengaturan data perusahaan untuk dokumen invoice, surat jalan, dan purchase order.</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">PPN (%)</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" step="0.1" value={ppnPercent} onChange={(e) => setPpnPercent(e.target.value)} placeholder="11" className={`${inputClass} pr-10 text-lg font-bold text-rose-700 dark:text-rose-400`} disabled={loading} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-rose-500 dark:text-rose-400">%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">Persentase PPN default yang akan diterapkan ke Invoice dan Purchase Order.</p>
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="bg-gradient-to-br from-rose-50 dark:from-rose-950/30 to-pink-50 dark:to-pink-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Simulasi</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Sub Total</span>
                            <span className="text-sm font-semibold text-foreground">Rp 1.000.000</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-rose-600 dark:text-rose-400">PPN ({ppnPercent || 0}%)</span>
                            <span className="text-sm font-bold text-rose-700 dark:text-rose-400">Rp {(1000000 * (parseFloat(ppnPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                          <div className="border-t border-rose-200 dark:border-rose-800 pt-2 flex justify-between items-center">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Grand Total</span>
                            <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">Rp {(1000000 + 1000000 * (parseFloat(ppnPercent) || 0) / 100).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border flex items-center gap-3">
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
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">{t('pengaturan_tampilan')}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4">{t('tema_warna_aplikasi')}</p>
                </div>
                <div className="space-y-5">
                  {/* Language */}
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('bahasa')}</label>
                    <select value={appLanguage} onChange={(e) => setAppLanguage(e.target.value as Language)} className={inputClass}>
                      <option value="id">{t('bahasa_indonesia')}</option>
                      <option value="en">{t('english')}</option>
                    </select>
                  </div>
                  {/* Font Size */}
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">{t('ukuran_font')}</label>
                    <select value={fontSize} onChange={(e) => { setFontSize(e.target.value); applyFontSizeLive(e.target.value) }} className={inputClass}>
                      <option value="small">{t('kecil')}</option>
                      <option value="medium">{t('sedang')}</option>
                      <option value="large">{t('besar')}</option>
                    </select>
                  </div>

                  {/* Dark Mode */}
                  <div className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-border bg-muted/50 dark:bg-slate-800/50 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`}>
                        {darkMode ? <Moon className="w-4 h-4 text-violet-600 dark:text-violet-400" /> : <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-foreground">{t('mode_gelap')}</label>
                        <p className="text-xs text-muted-foreground">{t('mode_gelap_desc')}</p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const newDarkMode = !darkMode
                        setDarkMode(newDarkMode)
                        setThemeRef.current(newDarkMode ? 'dark' : 'light')
                        persistDarkMode(newDarkMode)
                        // Immediately persist dark mode to database so it doesn't revert
                        try {
                          await authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key: 'theme_dark_mode', value: newDarkMode ? 'true' : 'false' }) })
                        } catch { /* silent */ }
                        if (newDarkMode) {
                          // Clear all inline overrides so .dark CSS vars take effect
                          clearInlineOverridesForDarkMode()
                        } else {
                          // Re-apply all color overrides for light mode
                          applySidebarColor(sidebarColor)
                          applyBgColor(bgColor)
                          applyBannerColor(bannerColor)
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-slate-100 transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* ===== COLOR PICKERS ===== */}
                  <div className="border-t border-border pt-5">
                    <div className="flex items-center gap-2 mb-5">
                      <Pipette className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      <h4 className="text-sm font-semibold text-foreground">{t('tema_warna_aplikasi')}</h4>
                    </div>
                    <div className="space-y-6">
                      <ColorPicker
                        label={t('color_sidebar')}
                        icon={<div className="w-4 h-4 rounded bg-muted-foreground border border-input" />}
                        value={sidebarColor}
                        onChange={handleSidebarColorChange}
                        presets={colorPresets.sidebar}
                      />
                      <ColorPicker
                        label={t('color_background')}
                        icon={<div className="w-4 h-4 rounded bg-muted border border-input" />}
                        value={bgColor}
                        onChange={handleBgColorChange}
                        presets={colorPresets.background}
                      />

                      <ColorPicker
                        label={t('color_banner')}
                        icon={<div className="w-4 h-4 rounded bg-blue-50 dark:bg-blue-950/50 border border-input" />}
                        value={bannerColor}
                        onChange={handleBannerColorChange}
                        presets={colorPresets.banner}
                      />

                    </div>
                    <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
                      <Button onClick={handleResetColors} variant="outline" size="sm">
                        <Undo2 className="w-3.5 h-3.5 mr-1.5" />{t('color_default')}
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Save Perubahan Button */}
                <div className="pt-4 border-t border-border">
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
