'use client'

import { Plus, Edit, Save, X, Trash2, MessageCircle, Loader2 } from 'lucide-react'
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
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

// ===== OPTIMIZED: Memoized CheckboxCell outside component =====
const CheckboxCell = memo(function CheckboxCell({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="h-5 w-5 rounded border-slate-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white"
      />
    </div>
  )
})

export default function HakAksesPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const isSuperAdmin = currentUser?.role === 'superadmin'

  // === ROLES STATE — initialized with defaults so page renders instantly ===
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [isEditing, setIsEditing] = useState(false)
  const [editRoles, setEditRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(GROUP_FEATURES.map(g => g.id)))
  const [dataLoaded, setDataLoaded] = useState(false)

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
        if (Array.isArray(data)) {
          // First pass: collect all setting values
          let customPermsData: Record<string, any> | null = null
          let customRolesData: Array<{ id: string; name: string }> | null = null

          for (const s of data) {
            if (s.key === 'demo_days') setDemoDays(s.value)
            if (s.key === 'demo_message') setDemoMessage(s.value)
            if (s.key === 'single_device') setSingleDevice(s.value === 'false' ? false : true)
            if (s.key === 'single_device_message') setSingleDeviceMessage(s.value)
            if (s.key === 'auto_logout_min') setAutoLogoutMin(s.value)
            if (s.key === 'logout_warning_sec') setLogoutWarningSec(s.value)
            if (s.key === 'wa_api_key') setWaApiKey(s.value)
            if (s.key === 'wa_api_url') setWaApiUrl(s.value)

            if (s.key === 'role_permissions' && s.value) {
              try { customPermsData = JSON.parse(s.value) } catch (e) { console.error('Failed to parse role_permissions:', e) }
            }
            if (s.key === 'custom_roles' && s.value) {
              try { customRolesData = JSON.parse(s.value) } catch (e) { console.error('Failed to parse custom_roles:', e) }
            }
          }

          // Second pass: build the complete roles list (defaults + custom roles)
          setRoles(prevRoles => {
            let baseRoles = [...prevRoles]

            // Add custom roles that aren't already in the list
            if (Array.isArray(customRolesData)) {
              for (const cr of customRolesData) {
                if (!baseRoles.find(r => r.id === cr.id)) {
                  baseRoles.push({
                    id: cr.id,
                    name: cr.name,
                    color: getRoleColor(cr.id),
                    isSystem: false,
                    features: buildDefaultFeatures('new'),
                  })
                }
              }
            }

            // Apply custom permissions from database
            if (customPermsData) {
              baseRoles = baseRoles.map(role => {
                const custom = customPermsData[role.id]
                if (!custom) return role
                return {
                  ...role,
                  features: role.features.map(f => {
                    const customFeature = custom.features?.[f.featureId]
                    const customSubs = custom.subPermissions?.[f.featureId]
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
                  }),
                }
              })
            }

            // Also update editRoles with the loaded data
            setEditRoles(JSON.parse(JSON.stringify(baseRoles)))
            return baseRoles
          })
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

  // === DERIVED STATE: display roles based on editing mode ===
  const displayRoles = isEditing ? editRoles : roles

  // ===== OPTIMIZED: Pre-compute feature maps for O(1) lookups =====
  const roleFeatureMaps = useMemo(() => {
    return displayRoles.map(role => {
      const map = new Map<string, FeaturePermission>()
      for (const f of role.features) {
        map.set(f.featureId, f)
      }
      return { roleId: role.id, map }
    })
  }, [displayRoles])

  const getFeature = useCallback((roleId: string, featureId: string): FeaturePermission | undefined => {
    const entry = roleFeatureMaps.find(r => r.roleId === roleId)
    return entry?.map.get(featureId)
  }, [roleFeatureMaps])

  // === ROLE HANDLERS ===
  const handleEditToggle = useCallback(() => {
    if (!dataLoaded) return
    if (!isEditing) setEditRoles(JSON.parse(JSON.stringify(roles)))
    setIsEditing(prev => !prev)
  }, [dataLoaded, isEditing, roles])

  const handleSave = useCallback(async () => {
    const cleanedRoles = editRoles.map(role =>
      role.id === 'superadmin' ? (roles.find(r => r.id === 'superadmin') || role) : role
    )
    setRoles(JSON.parse(JSON.stringify(cleanedRoles)))
    setEditRoles(JSON.parse(JSON.stringify(cleanedRoles)))
    setIsEditing(false)

    // Build permission data for all roles
    const permData: Record<string, { features: Record<string, boolean>; subPermissions: Record<string, Record<string, boolean>> }> = {}
    for (const role of cleanedRoles) {
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

    // Build custom roles list (non-default roles) for persistence
    const defaultRoleIds = DEFAULT_ROLES.map(r => r.id)
    const customRolesList = cleanedRoles
      .filter(r => !defaultRoleIds.includes(r.id))
      .map(r => ({ id: r.id, name: r.name }))

    // Save to database (permissions + custom roles list)
    try {
      const saves = [
        authFetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'role_permissions', value: JSON.stringify(permData) })
        }),
        authFetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesList) })
        }),
      ]
      const results = await Promise.all(saves)
      const failedRes = results.find(r => !r.ok)
      if (failedRes) {
        const errData = await failedRes.json().catch(() => ({}))
        toast.error(`Gagal menyimpan: ${errData.error || 'Server error'}`)
        return
      }
    } catch (err) {
      toast.error('Gagal menyimpan ke database')
      return
    }

    // Save to localStorage for immediate use
    saveAllPermissions(permData)

    toast.success('Hak akses berhasil disimpan!')
  }, [editRoles, roles])

  const handleAddRole = useCallback(async () => {
    if (!newRoleName.trim()) { toast.error('Nama role wajib diisi'); return }
    const newRole: Role = {
      id: Date.now().toString(), name: newRoleName.trim(),
      color: 'bg-slate-100 text-slate-700', features: buildDefaultFeatures('new'),
    }

    // Update in-memory state for immediate UI feedback
    setEditRoles(prev => [...prev, newRole])
    setRoles(prev => [...prev, newRole])
    setNewRoleName('')
    setDialogOpen(false)

    // Persist to database immediately so role survives page refresh
    try {
      // Build updated custom_roles list
      const defaultRoleIds = DEFAULT_ROLES.map(r => r.id)
      const allRolesWithNew = [...roles, newRole]
      const customRolesList = allRolesWithNew
        .filter(r => !defaultRoleIds.includes(r.id))
        .map(r => ({ id: r.id, name: r.name }))

      // Build updated role_permissions including the new role
      const permData: Record<string, { features: Record<string, boolean>; subPermissions: Record<string, Record<string, boolean>> }> = {}
      for (const role of allRolesWithNew) {
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

      const saves = [
        authFetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'role_permissions', value: JSON.stringify(permData) })
        }),
        authFetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesList) })
        }),
      ]
      const results = await Promise.all(saves)
      const failedRes = results.find(r => !r.ok)
      if (failedRes) {
        const errData = await failedRes.json().catch(() => ({}))
        toast.error(`Gagal menyimpan role: ${errData.error || 'Server error'}`)
        // Revert on failure
        setRoles(prev => prev.filter(r => r.id !== newRole.id))
        setEditRoles(prev => prev.filter(r => r.id !== newRole.id))
        return
      }

      // Save to localStorage for immediate use
      saveAllPermissions(permData)
      toast.success('Role baru ditambahkan')
    } catch (err) {
      toast.error('Gagal menyimpan role ke database')
      // Revert on failure
      setRoles(prev => prev.filter(r => r.id !== newRole.id))
      setEditRoles(prev => prev.filter(r => r.id !== newRole.id))
    }
  }, [newRoleName, roles])

  const handleDeleteRole = useCallback((roleId: string) => {
    if (roleId === 'superadmin' || roleId === 'admin') { toast.error('Role sistem tidak dapat dihapus'); return }
    const role = roles.find(r => r.id === roleId)
    if (role) {
      setRoleToDelete(role)
      setDeleteDialogOpen(true)
    }
  }, [roles])

  const confirmDeleteRole = useCallback(async () => {
    if (!roleToDelete) return
    const roleId = roleToDelete.id
    setRoles(prev => prev.filter(r => r.id !== roleId))
    setEditRoles(prev => prev.filter(r => r.id !== roleId))

    // Clean up permissions and custom roles list in database
    try {
      const res = await authFetch('/api/settings')
      const data = await res.json()
      if (Array.isArray(data)) {
        const permEntry = data.find((s: any) => s.key === 'role_permissions')
        const customRolesEntry = data.find((s: any) => s.key === 'custom_roles')

        const saves = []

        if (permEntry?.value) {
          const permData = JSON.parse(permEntry.value)
          delete permData[roleId]
          saves.push(authFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'role_permissions', value: JSON.stringify(permData) })
          }))
        }

        if (customRolesEntry?.value) {
          const customRolesList = JSON.parse(customRolesEntry.value)
          const updatedList = customRolesList.filter((r: any) => r.id !== roleId)
          saves.push(authFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(updatedList) })
          }))
        }

        if (saves.length > 0) await Promise.all(saves)
      }
    } catch {}

    setDeleteDialogOpen(false)
    setRoleToDelete(null)
    toast.success(`Role "${roleToDelete.name}" berhasil dihapus`)
  }, [roleToDelete])

  // ===== OPTIMIZED: Stable callbacks with useCallback =====
  const toggleSimplePermission = useCallback((roleId: string, featureId: string) => {
    if (roleId === 'superadmin') return
    setEditRoles(prev => prev.map(role =>
      role.id === roleId ? { ...role, features: role.features.map(f => f.featureId === featureId ? { ...f, allowed: !f.allowed } : f) } : role
    ))
  }, [])

  const toggleSubPermission = useCallback((roleId: string, featureId: string, subId: string) => {
    if (roleId === 'superadmin') return
    setEditRoles(prev => prev.map(role =>
      role.id === roleId ? {
        ...role,
        features: role.features.map(f => {
          if (f.featureId !== featureId || !f.subPermissions) return f
          const updatedSubs = f.subPermissions.map(sp => sp.id === subId ? { ...sp, allowed: !sp.allowed } : sp)
          return { ...f, subPermissions: updatedSubs, allowed: updatedSubs.some(s => s.allowed) }
        })
      } : role
    ))
  }, [])

  const toggleGroupAllAll = useCallback((featureId: string) => {
    setEditRoles(prev => prev.map(role => {
      if (role.id === 'superadmin') return role
      return {
        ...role,
        features: role.features.map(f => {
          if (f.featureId !== featureId || !f.subPermissions) return f
          const anyAllowed = f.subPermissions.some(s => s.allowed)
          return { ...f, subPermissions: f.subPermissions.map(sp => ({ ...sp, allowed: !anyAllowed })), allowed: !anyAllowed }
        })
      }
    }))
  }, [])

  const toggleGroupAll = useCallback((roleId: string, featureId: string) => {
    if (roleId === 'superadmin') return
    setEditRoles(prev => prev.map(role => {
      if (role.id !== roleId) return role
      return {
        ...role,
        features: role.features.map(f => {
          if (f.featureId !== featureId || !f.subPermissions) return f
          const anyAllowed = f.subPermissions.some(s => s.allowed)
          return { ...f, subPermissions: f.subPermissions.map(sp => ({ ...sp, allowed: !anyAllowed })), allowed: !anyAllowed }
        })
      }
    }))
  }, [])

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

      {/* ==================== SECTION 1: DAFTAR ROLE ==================== */}
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 lg:p-6 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Daftar Role</h2>
              <p className="text-sm text-slate-500 mt-0.5">Kelola daftar role yang tersedia dalam sistem</p>
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Tambah Role
            </Button>
          </div>
        </div>
        <div className="p-4 lg:p-6">
          <div className="flex flex-wrap gap-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border ${getRoleColor(role.id)} border-current/20 ${role.isSystem ? '' : 'pr-1.5'}`}
              >
                <span className="text-sm font-bold capitalize">{role.name}</span>
                {role.isSystem && (
                  <span className="text-[10px] font-medium opacity-70">Sistem</span>
                )}
                {!role.isSystem && (
                  <button
                    type="button"
                    onClick={() => handleDeleteRole(role.id)}
                    className="ml-1 p-1 rounded-lg hover:bg-red-500/15 transition-colors text-red-500 hover:text-red-700"
                    title={t('hapus_role')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== SECTION 2: MATRIKS HAK AKSES FITUR ==================== */}
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 lg:p-6 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Matriks Hak Akses Fitur</h2>
              <p className="text-sm text-slate-500 mt-0.5">Atur akses pengguna untuk setiap fitur aplikasi</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isEditing ? (
                <>
                  <Button onClick={handleSave} size="sm" className="gap-2"><Save className="w-4 h-4" />{t('simpan')}</Button>
                  <Button onClick={handleEditToggle} variant="outline" size="sm" className="gap-2"><X className="w-4 h-4" />{t('batal')}</Button>
                </>
              ) : (
                <Button onClick={handleEditToggle} size="sm" className="gap-2" disabled={!dataLoaded}><Edit className="w-4 h-4" />{t('edit')}</Button>
              )}
            </div>
          </div>
        </div>

        {/* Permissions Matrix — renders immediately with defaults, updates when API data loads */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 min-w-[220px] sticky left-0 bg-slate-50 z-10">Fitur</th>
                {displayRoles.map((role) => (
                  <th key={role.id} className="px-4 py-3 text-center min-w-[110px]">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${getRoleColor(role.id)}`}>{role.name}</span>
                      {isEditing && role.id !== 'superadmin' && role.id !== 'admin' && !role.isSystem && (
                        <button type="button" onClick={() => handleDeleteRole(role.id)} className="text-[10px] text-red-400 hover:text-red-600">{t('hapus')}</button>
                      )}
                      {role.id === 'superadmin' && <span className="text-[10px] text-red-500 font-medium">Tidak dapat diubah</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIMPLE_FEATURES.map((feature) => (
                <tr key={feature.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 sticky left-0 bg-card z-10"><span className="text-sm font-medium text-slate-800">{feature.name}</span></td>
                  {displayRoles.map((role) => {
                    const fp = getFeature(role.id, feature.id)
                    return (
                      <td key={role.id} className="px-4 py-3">
                        <CheckboxCell
                          checked={fp?.allowed || false}
                          onChange={() => toggleSimplePermission(role.id, feature.id)}
                          disabled={!isEditing || role.id === 'superadmin'}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
              {GROUP_FEATURES.map((group) => (
                <React.Fragment key={group.id}>
                  {/* Group Header Row */}
                  <tr className="border-b border-slate-200 bg-slate-100/80">
                    <td className="px-4 py-2.5 sticky left-0 bg-slate-100/80 z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{group.name}</span>
                        {isEditing && (
                          <button type="button" onClick={() => toggleGroupAllAll(group.id)} className="text-[10px] font-medium text-slate-400 hover:text-slate-700">Semua Role</button>
                        )}
                      </div>
                    </td>
                    {displayRoles.map((role) => {
                      const fp = getFeature(role.id, group.id)
                      const allCount = fp?.subPermissions?.length || 0
                      const allowedCount = fp?.subPermissions?.filter(s => s.allowed).length || 0
                      return (
                        <td key={role.id} className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-2">
                            {isEditing && role.id !== 'superadmin' && (
                              <button type="button" onClick={() => toggleGroupAll(role.id, group.id)} className="text-[10px] font-medium text-slate-400 hover:text-slate-700 underline underline-offset-2">Semua</button>
                            )}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${allowedCount === allCount && allCount > 0 ? 'bg-emerald-100 text-emerald-700' : allowedCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                              {allowedCount}/{allCount}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                  {/* Sub-permission rows (always visible) */}
                  {group.subPermissions.map((sp) => (
                    <tr key={sp.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 pl-8 sticky left-0 bg-card z-10">
                        <span className="text-sm text-slate-600">{sp.name}</span>
                      </td>
                      {displayRoles.map((role) => {
                        const fp = getFeature(role.id, group.id)
                        const sub = fp?.subPermissions?.find(s => s.id === sp.id)
                        return (
                          <td key={role.id} className="px-4 py-2.5">
                            <CheckboxCell
                              checked={sub?.allowed || false}
                              onChange={() => toggleSubPermission(role.id, group.id, sp.id)}
                              disabled={!isEditing || role.id === 'superadmin'}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== SECTION 3 & 4: AKUN DEMO + KEAMANAN ==================== */}
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

      {/* ==================== SECTION 5: WHATSAPP API ==================== */}
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

      {/* Add Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Role Baru</DialogTitle>
            <DialogDescription>Masukkan nama role baru untuk ditambahkan ke tabel hak akses</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="roleName">{t('nama_role') + ' *'}</Label>
              <Input id="roleName" placeholder="Contoh: Supervisor" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="mt-2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('batal')}</Button>
            <Button onClick={handleAddRole}><Plus className="w-4 h-4 mr-2" />{t('tambah')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
 
