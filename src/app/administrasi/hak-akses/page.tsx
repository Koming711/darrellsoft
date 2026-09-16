'use client'

import {
  Plus, Save, Trash2, MessageCircle, Loader2, CheckCheck, Ban, RotateCcw,
  ShieldCheck, Pencil, Lock, X, Minus, MoreVertical, Check,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getAuthUser } from '@/lib/auth'
import { saveAllPermissions } from '@/lib/permissions'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { SIMPLE_FEATURES as SHARED_SIMPLE_FEATURES, GROUP_FEATURES as SHARED_GROUP_FEATURES, buildDefaultPermissions, buildDefaultSubPermissions } from '@/lib/permission-defaults'

interface SubPermission {
  id: string
  name: string
  allowed: boolean
}

interface FeaturePermission {
  featureId: string
  featureName: string
  allowed: boolean
  subPermissions?: SubPermission[]
  isGroup?: boolean
}

interface Role {
  id: string
  name: string
  color: string
  isSystem?: boolean
  features: FeaturePermission[]
}

// Use shared definitions from permission-defaults.ts (single source of truth)
const SIMPLE_FEATURES = SHARED_SIMPLE_FEATURES
const GROUP_FEATURES = SHARED_GROUP_FEATURES

// Pre-build default roles once (not per render)
const DEFAULT_ROLES: Role[] = [
  { id: 'superadmin', name: 'Super Admin', color: 'bg-red-100 text-red-700', isSystem: true, features: buildDefaultFeatures('superadmin') },
  { id: 'admin', name: 'Admin', color: 'bg-purple-100 text-purple-700', isSystem: true, features: buildDefaultFeatures('admin') },
  { id: 'manager', name: 'Manager', color: 'bg-emerald-100 text-emerald-700', isSystem: false, features: buildDefaultFeatures('manager') },
  { id: 'demo', name: 'Demo', color: 'bg-amber-100 text-amber-700', isSystem: false, features: buildDefaultFeatures('demo') },
  { id: 'user', name: 'User', color: 'bg-blue-100 text-blue-700', isSystem: false, features: buildDefaultFeatures('user') },
]

function buildDefaultFeatures(roleId: string): FeaturePermission[] {
  const defaultPerms = buildDefaultPermissions(roleId)
  const defaultSubs = buildDefaultSubPermissions(roleId)

  const features: FeaturePermission[] = []

  for (const f of SIMPLE_FEATURES) {
    features.push({ featureId: f.id, featureName: f.name, allowed: defaultPerms[f.id] || false })
  }

  for (const g of GROUP_FEATURES) {
    const subs: SubPermission[] = g.subPermissions.map(sp => ({
      id: sp.id, name: sp.name,
      allowed: defaultSubs[g.id]?.[sp.id] || false,
    }))
    features.push({
      featureId: g.id, featureName: g.name,
      allowed: defaultPerms[g.id] || false,
      subPermissions: subs, isGroup: true,
    })
  }
  return features
}

function getRoleColor(roleId: string): string {
  switch (roleId) {
    case 'superadmin': return 'bg-red-100 text-red-700'
    case 'admin': return 'bg-purple-100 text-purple-700'
    case 'manager': return 'bg-emerald-100 text-emerald-700'
    case 'demo': return 'bg-amber-100 text-amber-700'
    default: return 'bg-blue-100 text-blue-700'
  }
}

// ===== Helper: persist custom_roles metadata (SEMUA role, agar rename role bawaan juga tersimpan) =====
async function persistCustomRoles(roles: Role[]) {
  try {
    const customRolesMeta = roles.map(r => ({ id: r.id, name: r.name, color: r.color, isSystem: r.isSystem || false }))
    await authFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesMeta) }),
    })
  } catch (err) {
    console.error('Failed to persist custom_roles:', err)
  }
}

/** Label pendek operasi CRUD dari id sub-permission (…-lihat → Lihat) */
function opLabel(subId: string): string {
  if (subId.endsWith('-lihat')) return 'Lihat'
  if (subId.endsWith('-tambah')) return 'Tambah'
  if (subId.endsWith('-edit')) return 'Edit'
  if (subId.endsWith('-hapus')) return 'Hapus'
  if (subId.endsWith('-konversi')) return 'Konversi'
  return 'Akses'
}

// ===== Helper: build permission payload untuk disimpan ke DB / localStorage =====
function buildPermData(roles: Role[]) {
  const permData: Record<string, { features: Record<string, boolean>; subPermissions: Record<string, Record<string, boolean>> }> = {}
  for (const role of roles) {
    const features: Record<string, boolean> = {}
    const subPermissions: Record<string, Record<string, boolean>> = {}
    for (const f of role.features) {
      features[f.featureId] = f.allowed
      if (f.subPermissions) {
        const subs: Record<string, boolean> = {}
        for (const sp of f.subPermissions) {
          subs[sp.id] = sp.allowed
        }
        subPermissions[f.featureId] = subs
      }
    }
    permData[role.id] = { features, subPermissions }
  }
  return permData
}

// ===== Form state dialog tambah/rename role =====
interface RoleFormState {
  name: string
}

/** Bentuk visual sel matrix: on (diizinkan), off, partial (sebagian, utk grup CRUD) */
type MatrixCellState = 'on' | 'off' | 'partial'

function matrixCellClass(state: MatrixCellState, disabled: boolean): string {
  const base = 'inline-flex items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1'
  if (disabled) return `${base} bg-emerald-50 border-emerald-100 text-emerald-500 cursor-not-allowed opacity-70`
  if (state === 'on') return `${base} bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-600`
  if (state === 'partial') return `${base} bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-500`
  return `${base} bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-300 hover:text-slate-400`
}

function matrixCellIcon(state: MatrixCellState): React.ReactNode {
  if (state === 'on') return <Check className="h-4 w-4" aria-hidden="true" />
  if (state === 'partial') return <Minus className="h-4 w-4" aria-hidden="true" />
  return <X className="h-4 w-4" aria-hidden="true" />
}

export default function HakAksesPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const isSuperAdmin = currentUser?.role === 'superadmin'

  // === ROLES STATE ===
  const [roles, setRoles] = useState<Role[]>(() => JSON.parse(JSON.stringify(DEFAULT_ROLES)) as Role[])
  const [savedRoles, setSavedRoles] = useState<Role[]>(() => JSON.parse(JSON.stringify(DEFAULT_ROLES)) as Role[])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [savingMatrix, setSavingMatrix] = useState(false)

  // === DIALOG TAMBAH / RENAME ROLE ===
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [form, setForm] = useState<RoleFormState>({ name: '' })
  const [saving, setSaving] = useState(false)

  // === DIALOG HAPUS ROLE ===
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)

  // === AKUN DEMO STATE ===
  const [demoDays, setDemoDays] = useState('')
  const [demoMessage, setDemoMessage] = useState('')
  const demoMsgRef = useRef<HTMLTextAreaElement>(null)

  // === KEAMANAN STATE ===
  const [singleDevice, setSingleDevice] = useState(true)
  const [singleDeviceMessage, setSingleDeviceMessage] = useState('')
  const singleDeviceMsgRef = useRef<HTMLTextAreaElement>(null)
  const [autoLogoutMin, setAutoLogoutMin] = useState('')
  const [logoutWarningSec, setLogoutWarningSec] = useState('')

  // === WHATSAPP API STATE ===
  const [waApiKey, setWaApiKey] = useState('')
  const [waApiUrl, setWaApiUrl] = useState('https://api.fonnte.com/send')
  const [waSaving, setWaSaving] = useState(false)

  // === LOAD SETTINGS & CUSTOM PERMISSIONS (non-blocking) ===
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/settings')
        const data = await res.json()
        if (cancelled) return
        let customPerms: Record<string, { features?: Record<string, boolean>; subPermissions?: Record<string, Record<string, boolean>> }> | null = null
        let customRolesMeta: Array<{ id: string; name: string; color: string; isSystem?: boolean }> | null = null
        if (Array.isArray(data)) {
          for (const s of data) {
            if (s.key === 'demo_days') setDemoDays(s.value)
            if (s.key === 'demo_message') setDemoMessage(s.value)
            if (s.key === 'single_device') setSingleDevice(s.value === 'false' ? false : true)
            if (s.key === 'single_device_message') setSingleDeviceMessage(s.value)
            if (s.key === 'auto_logout_min') setAutoLogoutMin(s.value)
            if (s.key === 'logout_warning_sec') setLogoutWarningSec(s.value)
            if (s.key === 'wa_api_key') setWaApiKey(s.value)
            if (s.key === 'wa_api_url') setWaApiUrl(s.value)

            // Collect custom role permissions (applied after loop to avoid race with custom_roles)
            if (s.key === 'role_permissions' && s.value) {
              try { customPerms = JSON.parse(s.value) } catch (e) { console.error('Failed to parse role_permissions:', e) }
            }
            // Collect custom role metadata (id/name/color) — needed to rehydrate custom roles
            if (s.key === 'custom_roles' && s.value) {
              try { customRolesMeta = JSON.parse(s.value) } catch (e) { console.error('Failed to parse custom_roles:', e) }
            }
          }
        }
        if (cancelled) return

        // Helper: apply custom permissions to a features array
        const applyPerms = (features: FeaturePermission[], custom: { features?: Record<string, boolean>; subPermissions?: Record<string, Record<string, boolean>> }): FeaturePermission[] =>
          features.map(f => {
            const customFeature = custom?.features?.[f.featureId]
            const customSubs = custom?.subPermissions?.[f.featureId]
            if (customFeature === undefined && !customSubs) return f
            return {
              ...f,
              allowed: customFeature !== undefined ? customFeature : f.allowed,
              subPermissions: f.subPermissions?.map(sp => {
                const customSub = customSubs?.[sp.id]
                if (customSub === undefined) return sp
                return { ...sp, allowed: customSub }
              }) || f.subPermissions,
            }
          })

        // Build final roles list: DEFAULT_ROLES (with custom perms applied) + custom roles from DB
        if (customPerms || customRolesMeta) {
          let loadedRoles: Role[] = DEFAULT_ROLES.map(role => {
            if (!customPerms || !customPerms[role.id]) return role
            return { ...role, features: applyPerms(role.features, customPerms[role.id]) }
          })

          // Apply custom role metadata (rename/warna role bawaan + rehydrate role kustom)
          if (Array.isArray(customRolesMeta)) {
            for (const cr of customRolesMeta) {
              const existingIdx = loadedRoles.findIndex(r => r.id === cr.id)
              if (existingIdx >= 0) {
                // Role bawaan: terapkan override nama/warna (hasil rename yang dipersist)
                loadedRoles[existingIdx] = {
                  ...loadedRoles[existingIdx],
                  name: cr.name || loadedRoles[existingIdx].name,
                  color: cr.color || loadedRoles[existingIdx].color,
                }
                continue
              }
              const baseFeatures = buildDefaultFeatures('new')
              const features = customPerms?.[cr.id] ? applyPerms(baseFeatures, customPerms[cr.id]) : baseFeatures
              loadedRoles.push({
                id: cr.id,
                name: cr.name,
                color: cr.color || 'bg-slate-100 text-slate-700',
                isSystem: cr.isSystem || false,
                features,
              })
            }
          }

          setRoles(loadedRoles)
          setSavedRoles(JSON.parse(JSON.stringify(loadedRoles)) as Role[])
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        if (!cancelled) setDataLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const saveSetting = async (key: string, value: string) => {
    try {
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      })
      if (!res.ok) {
        console.error(`Failed to save setting ${key}:`, res.status)
      }
    } catch (err) {
      console.error(`Failed to save setting ${key}:`, err)
    }
  }

  // === DIALOG: buka tambah / rename ===
  const openCreate = useCallback(() => {
    setEditingRole(null)
    setForm({ name: '' })
    setDialogOpen(true)
  }, [])

  const openRename = useCallback((role: Role) => {
    if (role.id === 'superadmin') {
      toast.info('Super Admin selalu memiliki akses penuh dan tidak dapat diubah')
      return
    }
    setEditingRole(role)
    setForm({ name: role.name })
    setDialogOpen(true)
  }, [])

  // === MATRIX: mutator permission per role (operasi pada roles state) ===
  const updateRoleFeatures = useCallback((roleId: string, updater: (features: FeaturePermission[]) => FeaturePermission[]) => {
    setRoles(rs => rs.map(r => r.id === roleId ? { ...r, features: updater(r.features) } : r))
  }, [])

  const toggleSimpleCell = useCallback((roleId: string, featureId: string) => {
    updateRoleFeatures(roleId, fs => fs.map(x => x.featureId === featureId ? { ...x, allowed: !x.allowed } : x))
  }, [updateRoleFeatures])

  const toggleSubCell = useCallback((roleId: string, featureId: string, subId: string) => {
    updateRoleFeatures(roleId, fs => fs.map(x => {
      if (x.featureId !== featureId || !x.subPermissions) return x
      const subs = x.subPermissions.map(sp => sp.id === subId ? { ...sp, allowed: !sp.allowed } : sp)
      return { ...x, subPermissions: subs, allowed: subs.some(s => s.allowed) }
    }))
  }, [updateRoleFeatures])

  const toggleGroupCell = useCallback((roleId: string, featureId: string) => {
    updateRoleFeatures(roleId, fs => fs.map(x => {
      if (x.featureId !== featureId || !x.subPermissions) return x
      const allOn = x.subPermissions.every(sp => sp.allowed)
      const value = !allOn
      return { ...x, subPermissions: x.subPermissions.map(sp => ({ ...sp, allowed: value })), allowed: value }
    }))
  }, [updateRoleFeatures])

  const setRoleAll = useCallback((roleId: string, value: boolean) => {
    updateRoleFeatures(roleId, fs => fs.map(x => ({
      ...x,
      allowed: value,
      subPermissions: x.subPermissions?.map(sp => ({ ...sp, allowed: value })),
    })))
  }, [updateRoleFeatures])

  const resetRoleToDefault = useCallback((roleId: string) => {
    updateRoleFeatures(roleId, () => buildDefaultFeatures(roleId))
    toast.info('Role direset ke pengaturan default — klik Simpan untuk menyimpan')
  }, [updateRoleFeatures])

  // === MATRIX: dirty tracking (bandingkan roles vs snapshot tersimpan) ===
  const serializeRoleState = useCallback((rs: Role[]) =>
    JSON.stringify({ n: rs.map(r => `${r.id}:${r.name}`), p: buildPermData(rs) }), [])

  const dirty = useMemo(
    () => serializeRoleState(roles) !== serializeRoleState(savedRoles),
    [roles, savedRoles, serializeRoleState]
  )

  // === MATRIX: simpan semua perubahan permission ===
  const handleSaveMatrix = useCallback(async () => {
    setSavingMatrix(true)
    try {
      const permData = buildPermData(roles)
      const saveRes = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'role_permissions', value: JSON.stringify(permData) })
      })
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}))
        toast.error(`Gagal menyimpan: ${errData.error || 'Server error'}`)
        return
      }

      // Persist metadata semua role (nama/warna) agar rename role bawaan juga tersimpan
      const customRolesMeta = roles.map(r => ({ id: r.id, name: r.name, color: r.color, isSystem: r.isSystem || false }))
      await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesMeta) })
      })

      // Simpan ke localStorage + event agar sidebar langsung diperbarui
      saveAllPermissions(permData)

      setSavedRoles(JSON.parse(JSON.stringify(roles)) as Role[])
      toast.success('Matrix hak akses berhasil disimpan')
    } catch {
      toast.error('Gagal menyimpan ke database')
    } finally {
      setSavingMatrix(false)
    }
  }, [roles])

  // === MATRIX: batalkan perubahan ===
  const handleDiscardMatrix = useCallback(() => {
    setRoles(JSON.parse(JSON.stringify(savedRoles)) as Role[])
    toast.info('Perubahan dibatalkan')
  }, [savedRoles])

  // === DIALOG: simpan (create/rename + persist) ===
  const handleDialogSave = useCallback(async () => {
    const name = form.name.trim()
    if (!name) { toast.error('Nama role wajib diisi'); return }
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase() && r.id !== (editingRole?.id ?? ''))) {
      toast.error('Nama role sudah digunakan'); return
    }
    setSaving(true)
    try {
      let nextRoles: Role[]
      if (editingRole) {
        nextRoles = roles.map(r => r.id === editingRole.id ? { ...r, name } : r)
      } else {
        const newRole: Role = {
          id: Date.now().toString(),
          name,
          color: 'bg-slate-100 text-slate-700',
          features: buildDefaultFeatures('new'),
        }
        nextRoles = [...roles, newRole]
      }

      // Persist semua role permissions ke database (role baru = tanpa akses)
      const permData = buildPermData(nextRoles)
      const saveRes = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'role_permissions', value: JSON.stringify(permData) })
      })
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}))
        toast.error(`Gagal menyimpan: ${errData.error || 'Server error'}`)
        return
      }

      // Persist metadata SEMUA role agar rename role bawaan & role kustom tetap ada setelah reload
      const customRolesMeta = nextRoles.map(r => ({ id: r.id, name: r.name, color: r.color, isSystem: r.isSystem || false }))
      await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesMeta) })
      })

      // Simpan ke localStorage + event agar sidebar langsung diperbarui
      saveAllPermissions(permData)

      setRoles(nextRoles)
      setSavedRoles(JSON.parse(JSON.stringify(nextRoles)) as Role[])
      setDialogOpen(false)
      toast.success(editingRole ? `Nama role berhasil diubah menjadi "${name}"` : `Role "${name}" ditambahkan — atur hak aksesnya lewat matrix`)
    } catch {
      toast.error('Gagal menyimpan ke database')
    } finally {
      setSaving(false)
    }
  }, [form, roles, editingRole])

  // === HAPUS ROLE ===
  const confirmDeleteRole = useCallback(async () => {
    if (!roleToDelete) return
    const roleId = roleToDelete.id
    if (roleId === 'superadmin' || roleId === 'admin') { toast.error('Role sistem tidak dapat dihapus'); return }
    const nextRoles = roles.filter(r => r.id !== roleId)
    setRoles(nextRoles)
    setSavedRoles(JSON.parse(JSON.stringify(nextRoles)) as Role[])

    void persistCustomRoles(nextRoles)

    // Clean up permissions in database (role_permissions)
    try {
      const res = await authFetch('/api/settings')
      const data = await res.json()
      if (Array.isArray(data)) {
        const permEntry = data.find((s: Record<string, unknown>) => s.key === 'role_permissions')
        if (permEntry?.value) {
          const permData = JSON.parse(permEntry.value as string)
          delete permData[roleId]
          await authFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'role_permissions', value: JSON.stringify(permData) })
          })
        }
      }
    } catch {}

    setDeleteDialogOpen(false)
    setRoleToDelete(null)
    toast.success(`Role "${roleToDelete.name}" berhasil dihapus`)
  }, [roleToDelete, roles])

  // === DEMO HANDLER ===
  const handleSaveDemo = useCallback(async () => {
    if (!demoDays) { toast.error('Masa aktif wajib diisi'); return }
    const msgValue = demoMsgRef.current?.value || ''
    await Promise.all([
      saveSetting('demo_days', demoDays),
      saveSetting('demo_message', msgValue),
    ])
    setDemoMessage(msgValue)
    toast.success('Pengaturan akun demo berhasil disimpan!')
  }, [demoDays])

  // === WHATSAPP API HANDLER ===
  const handleSaveWhatsApp = useCallback(async () => {
    setWaSaving(true)
    try {
      await Promise.all([
        saveSetting('wa_api_key', waApiKey),
        saveSetting('wa_api_url', waApiUrl),
      ])
      toast.success('Pengaturan WhatsApp API berhasil disimpan!')
    } catch {
      toast.error('Gagal menyimpan pengaturan WhatsApp API')
    } finally {
      setWaSaving(false)
    }
  }, [waApiKey, waApiUrl])

  // === KEAMANAN HANDLER ===
  const handleSaveKeamanan = useCallback(async () => {
    if (!autoLogoutMin && autoLogoutMin !== '0') { toast.error('Auto logout wajib diisi'); return }
    if (!logoutWarningSec && logoutWarningSec !== '0') { toast.error('Peringatan logout wajib diisi'); return }
    const sdmValue = singleDeviceMsgRef.current?.value || ''
    await Promise.all([
      saveSetting('single_device', singleDevice ? 'true' : 'false'),
      saveSetting('single_device_message', sdmValue),
      saveSetting('auto_logout_min', autoLogoutMin),
      saveSetting('logout_warning_sec', logoutWarningSec),
    ])
    setSingleDeviceMessage(sdmValue)
    toast.success('Pengaturan keamanan berhasil disimpan!')
  }, [autoLogoutMin, logoutWarningSec, singleDevice])

  // === Derived: ringkasan role (header matrix) ===
  const roleSummary = (role: Role) => {
    const active = role.features.filter(f => f.allowed).length
    return `${active}/${role.features.length}`
  }

  return (
    <DashboardLayout title={t('hak_akses')} subtitle={t('subtitle_hak_akses')}>
      {/* Super Admin Notice */}
      {isSuperAdmin && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-red-800">Mode Super Admin</p>
            <p className="text-xs text-red-600">Anda memiliki akses penuh ke seluruh fitur. Hak akses Super Admin tidak dapat diubah.</p>
          </div>
        </div>
      )}

      {/* ==================== SECTION 1: MATRIX HAK AKSES ==================== */}
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        {/* Header */}
        <div className="p-4 lg:p-6 border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-800">Matrix Hak Akses</h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Klik ikon pada tabel untuk memberi / mencabut akses. Perubahan tersimpan setelah klik Simpan.
            </p>
            {/* Legenda */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3 text-emerald-600" aria-hidden="true" /></span>
                Diizinkan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-slate-50 border border-slate-200"><X className="w-3 h-3 text-slate-400" aria-hidden="true" /></span>
                Tidak diizinkan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-amber-50 border border-amber-200"><Minus className="w-3 h-3 text-amber-500" aria-hidden="true" /></span>
                Sebagian (grup CRUD)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {dirty && (
              <Button variant="outline" onClick={handleDiscardMatrix} disabled={savingMatrix} className="min-h-[44px]">
                Batalkan
              </Button>
            )}
            <Button
              onClick={() => void handleSaveMatrix()}
              disabled={!dirty || savingMatrix}
              className={`gap-2 min-h-[44px] ${dirty ? 'ring-2 ring-amber-300' : ''}`}
            >
              {savingMatrix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan
            </Button>
            <Button onClick={openCreate} className="gap-2 min-h-[44px]">
              <Plus className="w-4 h-4" />
              Tambah Role
            </Button>
          </div>
        </div>

        {!dataLoaded ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-auto max-h-[65vh] overscroll-x-contain scrollbar-thin">
            <table className="w-full border-separate border-spacing-0 text-sm" aria-label="Matrix hak akses per role">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 min-w-[150px] md:min-w-[220px]"
                  >
                    Fitur / Menu
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role.id}
                      scope="col"
                      className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-1.5 py-2 min-w-[68px] md:min-w-[104px]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-1 max-w-full">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold max-w-full ${getRoleColor(role.id)}`}
                            title={role.name}
                          >
                            <span className="truncate">{role.name}</span>
                          </span>
                          {role.id === 'superadmin' ? (
                            <Lock className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-label="Super Admin terkunci — selalu akses penuh" />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
                                  aria-label={`Menu role ${role.name}`}
                                >
                                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-48">
                                <DropdownMenuItem onClick={() => openRename(role)}>
                                  <Pencil className="w-4 h-4 mr-2" aria-hidden="true" /> Ganti Nama
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setRoleAll(role.id, true)}>
                                  <CheckCheck className="w-4 h-4 mr-2" aria-hidden="true" /> Beri Semua
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setRoleAll(role.id, false)}>
                                  <Ban className="w-4 h-4 mr-2" aria-hidden="true" /> Kosongkan
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => resetRoleToDefault(role.id)}>
                                  <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" /> Reset Default
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={role.id === 'admin'}
                                  onClick={() => { setRoleToDelete(role); setDeleteDialogOpen(true) }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" /> Hapus Role
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 tabular-nums" aria-label={`Fitur aktif ${role.name}`}>{roleSummary(role)}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* ===== A: Akses Halaman & Fitur ===== */}
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="bg-slate-100/80 border-b border-slate-200 px-3 py-1.5"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Akses Halaman &amp; Fitur</p>
                    <p className="text-[10px] text-slate-400">Halaman tanpa akses tidak tampil di menu role ini.</p>
                  </td>
                </tr>
                {SIMPLE_FEATURES.map((f) => (
                  <tr key={f.id} className="group/row">
                    <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50 border-b border-r border-slate-100 px-3 py-1 text-slate-800">
                      <span className="block truncate" title={f.name}>{f.name}</span>
                    </td>
                    {roles.map((role) => {
                      const fp = role.features.find(x => x.featureId === f.id)
                      const locked = role.id === 'superadmin'
                      const allowed = locked ? true : (fp?.allowed || false)
                      const state: MatrixCellState = allowed ? 'on' : 'off'
                      return (
                        <td key={role.id} className="group-hover/row:bg-slate-50/70 border-b border-slate-100 px-1 py-1 text-center">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => toggleSimpleCell(role.id, f.id)}
                            className={matrixCellClass(state, locked)}
                            aria-label={`${f.name} — ${role.name}: ${allowed ? 'diizinkan' : 'tidak diizinkan'}`}
                            aria-pressed={allowed}
                          >
                            {matrixCellIcon(state)}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* ===== B: Operasi CRUD ===== */}
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="bg-slate-100/80 border-b border-slate-200 px-3 py-1.5"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Operasi CRUD — Master Data &amp; Pengguna</p>
                    <p className="text-[10px] text-slate-400">Kolom grup mengatur semua operasi sekaligus (klik ikon grup).</p>
                  </td>
                </tr>
                {GROUP_FEATURES.map((g) => (
                  <Fragment key={g.id}>
                    {/* Baris grup: toggle semua operasi sekaligus */}
                    <tr className="group/row bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-slate-50 group-hover/row:bg-slate-100 border-b border-r border-slate-100 px-3 py-1">
                        <span className="block truncate font-semibold text-slate-800" title={g.name}>
                          {g.name}
                        </span>
                      </td>
                      {roles.map((role) => {
                        const fp = role.features.find(x => x.featureId === g.id)
                        const subs = fp?.subPermissions || []
                        const allowedCount = subs.filter(s => s.allowed).length
                        const locked = role.id === 'superadmin'
                        const state: MatrixCellState = locked || allowedCount === subs.length ? 'on' : allowedCount === 0 ? 'off' : 'partial'
                        return (
                          <td key={role.id} className="group-hover/row:bg-slate-100/70 border-b border-slate-100 px-1 py-1 text-center">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => toggleGroupCell(role.id, g.id)}
                              className={matrixCellClass(state, locked)}
                              aria-label={`${g.name} (semua operasi) — ${role.name}`}
                            >
                              {matrixCellIcon(state)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                    {/* Baris sub-permission (indented) */}
                    {g.subPermissions.map((sp) => (
                      <tr key={sp.id} className="group/row">
                        <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50 border-b border-r border-slate-100 pl-6 pr-3 py-1 text-[13px] text-slate-600">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-slate-300 shrink-0" aria-hidden="true">└</span>
                            <span className="truncate" title={sp.name}>{opLabel(sp.id)}</span>
                          </span>
                        </td>
                        {roles.map((role) => {
                          const fp = role.features.find(x => x.featureId === g.id)
                          const s = fp?.subPermissions?.find(x => x.id === sp.id)
                          const locked = role.id === 'superadmin'
                          const allowed = locked ? true : (s?.allowed || false)
                          const state: MatrixCellState = allowed ? 'on' : 'off'
                          return (
                            <td key={role.id} className="group-hover/row:bg-slate-50/70 border-b border-slate-100 px-1 py-1 text-center">
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => toggleSubCell(role.id, g.id, sp.id)}
                                className={matrixCellClass(state, locked)}
                                aria-label={`${opLabel(sp.id)} ${g.name} — ${role.name}: ${allowed ? 'diizinkan' : 'tidak diizinkan'}`}
                                aria-pressed={allowed}
                              >
                                {matrixCellIcon(state)}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== SECTION 2: AKUN DEMO + KEAMANAN ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* AKUN DEMO */}
        <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Akun Demo</h2>
            <p className="text-sm text-slate-500 mt-0.5">Pengaturan untuk akun pengguna demo</p>
          </div>
          <div className="p-4 lg:p-6 space-y-5">
            <div>
              <Label className="text-sm font-medium text-slate-700">Masa Aktif Demo (hari)</Label>
              <Input
                type="number"
                min="1"
                value={demoDays}
                onChange={(e) => setDemoDays(e.target.value)}
                className="mt-1.5"
                placeholder="7"
              />
              <p className="text-xs text-slate-400 mt-1">Berapa hari akun demo bisa digunakan sebelum kadaluarsa</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Pesan Popup Demo</Label>
              <textarea
                ref={demoMsgRef}
                rows={4}
                defaultValue={demoMessage}
                className="mt-1.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Pesan yang muncul saat pengguna demo login..."
              />
              <p className="text-xs text-slate-400 mt-1">Pesan yang ditampilkan saat pengguna demo mengakses aplikasi</p>
            </div>

            <Button onClick={handleSaveDemo} className="w-full gap-2">
              <Save className="w-4 h-4" />
              Simpan
            </Button>
          </div>
        </div>

        {/* KEAMANAN */}
        <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Keamanan</h2>
            <p className="text-sm text-slate-500 mt-0.5">Pengaturan keamanan akun pengguna</p>
          </div>
          <div className="p-4 lg:p-6 space-y-5">
            {/* Single Device */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium text-slate-700">Login 1 Perangkat</Label>
                <p className="text-xs text-slate-400 mt-1">
                  Jika diaktifkan, setiap akun hanya bisa login di satu perangkat saja. Jika ada yang login dari perangkat lain, akan muncul peringatan.
                </p>
              </div>
              <Switch checked={singleDevice} onCheckedChange={setSingleDevice} />
            </div>

            <div className="border-t border-slate-100" />

            {/* Pesan Peringatan Multi-Perangkat */}
            {singleDevice && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Pesan Peringatan Multi-Perangkat</Label>
                <textarea
                  ref={singleDeviceMsgRef}
                  rows={3}
                  defaultValue={singleDeviceMessage}
                  className="mt-1.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Akun sudah digunakan, silahkan logout di perangkat yang lain"
                />
                <p className="text-xs text-slate-400 mt-1">Pesan yang muncul jika akun digunakan di perangkat lain</p>
              </div>
            )}

            <div className="border-t border-slate-100" />

            {/* Auto Logout */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Auto Logout (menit)</Label>
              <Input
                type="number"
                min="0"
                value={autoLogoutMin}
                onChange={(e) => setAutoLogoutMin(e.target.value)}
                className="mt-1.5"
                placeholder="10"
              />
              <p className="text-xs text-slate-400 mt-1">Logout otomatis jika pengguna tidak aktif (0 = nonaktif). Default 10 menit</p>
            </div>

            {/* Peringatan Logout */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Peringatan Logout (detik)</Label>
              <Input
                type="number"
                min="0"
                value={logoutWarningSec}
                onChange={(e) => setLogoutWarningSec(e.target.value)}
                className="mt-1.5"
                placeholder="20"
              />
              <p className="text-xs text-slate-400 mt-1">Tampilkan popup hitung mundur sebelum logout otomatis (0 = tanpa peringatan). Default 20 detik</p>
            </div>

            <Button onClick={handleSaveKeamanan} className="w-full gap-2">
              <Save className="w-4 h-4" />
              Simpan
            </Button>
          </div>
        </div>
      </div>

      {/* ==================== SECTION 3: WHATSAPP API ==================== */}
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 lg:p-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-800">WhatsApp API</h2>
              <p className="text-sm text-slate-500 mt-0.5">Untuk mengirim password otomatis ke WhatsApp user saat lupa password</p>
            </div>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full ml-2">Fonnte</span>
          </div>
        </div>
        <div className="p-4 lg:p-6 space-y-5">
          <p className="text-xs text-slate-500">Daftar di <a href="https://fonnte.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">fonnte.com</a> untuk mendapatkan API key.</p>
          <div>
            <Label className="text-sm font-medium text-slate-700">API Key Fonnte</Label>
            <Input
              type="password"
              value={waApiKey}
              onChange={(e) => setWaApiKey(e.target.value)}
              placeholder="Masukkan API key dari Fonnte"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-slate-700">API URL</Label>
            <Input
              type="url"
              value={waApiUrl}
              onChange={(e) => setWaApiUrl(e.target.value)}
              placeholder="https://api.fonnte.com/send"
              className="mt-1.5"
            />
            <p className="text-xs text-slate-400 mt-1">Default: https://api.fonnte.com/send</p>
          </div>
          <Button onClick={handleSaveWhatsApp} disabled={waSaving} className="w-full gap-2">
            {waSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Menyimpan...</> : <><Save className="w-4 h-4" />Simpan</>}
          </Button>
        </div>
      </div>

      {/* ==================== DIALOG: TAMBAH / GANTI NAMA ROLE ==================== */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !saving) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Ganti Nama Role' : 'Tambah Role Baru'}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? `Ubah nama role ${editingRole.name}. Hak aksesnya diatur langsung lewat matrix.`
                : 'Buat role baru. Setelah dibuat, atur hak aksesnya langsung lewat matrix (default: tanpa akses).'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="roleName">{t('nama_role')} <span className="text-destructive">*</span></Label>
            <Input
              id="roleName"
              placeholder="Contoh: Supervisor"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="min-h-[44px]">
              {t('batal')}
            </Button>
            <Button onClick={() => void handleDialogSave()} disabled={saving} className="gap-2 min-h-[44px]">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Menyimpan...</> : <><Save className="w-4 h-4" />Simpan</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Role</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus role <span className="font-bold text-slate-800">{roleToDelete?.name}</span>? Role yang sudah dihapus tidak dapat dikembalikan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setRoleToDelete(null) }}>{t('batal')}</Button>
            <Button variant="destructive" onClick={confirmDeleteRole} className="gap-2">
              <Trash2 className="w-4 h-4" />
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
