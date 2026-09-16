'use client'

import {
  Plus, Save, Trash2, MessageCircle, Loader2, CheckCheck, Ban, RotateCcw,
  ShieldCheck, Pencil, UserCog,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

/** Label pendek operasi CRUD dari id sub-permission (…-lihat → Lihat) */
function opLabel(subId: string): string {
  if (subId.endsWith('-lihat')) return 'Lihat'
  if (subId.endsWith('-tambah')) return 'Tambah'
  if (subId.endsWith('-edit')) return 'Edit'
  if (subId.endsWith('-hapus')) return 'Hapus'
  if (subId.endsWith('-konversi')) return 'Konversi'
  return 'Akses'
}

/** Warna checkbox CRUD mengikuti jenis operasi (lihat/tambah/edit/hapus/konversi) */
function subColorClass(subId: string): string {
  if (subId.includes('lihat')) return 'data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600'
  if (subId.includes('tambah')) return 'data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600'
  if (subId.includes('edit')) return 'data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500'
  if (subId.includes('hapus')) return 'data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600'
  if (subId.includes('konversi')) return 'data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600'
  return 'data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600'
}

// ===== Helper: persist custom_roles metadata to DB (fire-and-forget) =====
async function persistCustomRoles(roles: Role[]) {
  try {
    const customRolesMeta = roles
      .filter(r => !DEFAULT_ROLES.find(dr => dr.id === r.id))
      .map(r => ({ id: r.id, name: r.name, color: r.color, isSystem: r.isSystem || false }))
    await authFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesMeta) }),
    })
  } catch (err) {
    console.error('Failed to persist custom_roles:', err)
  }
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

// ===== Form state dialog tambah/edit role =====
interface RoleFormState {
  name: string
  features: FeaturePermission[]
}

export default function HakAksesPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const isSuperAdmin = currentUser?.role === 'superadmin'

  // === ROLES STATE ===
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [dataLoaded, setDataLoaded] = useState(false)

  // === DIALOG TAMBAH/EDIT ROLE ===
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [form, setForm] = useState<RoleFormState>({ name: '', features: [] })
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

          // Append custom roles from DB (rehydrate name/color, build default features, then apply perms)
          if (Array.isArray(customRolesMeta)) {
            for (const cr of customRolesMeta) {
              if (loadedRoles.find(r => r.id === cr.id)) continue // defensive: skip duplicates
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

  // === DIALOG: buka tambah / edit ===
  const openCreate = useCallback(() => {
    setEditingRole(null)
    setForm({ name: '', features: buildDefaultFeatures('new') })
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((role: Role) => {
    if (role.id === 'superadmin') {
      toast.info('Super Admin selalu memiliki akses penuh dan tidak dapat diubah')
      return
    }
    setEditingRole(role)
    setForm({ name: role.name, features: JSON.parse(JSON.stringify(role.features)) as FeaturePermission[] })
    setDialogOpen(true)
  }, [])

  // === DIALOG: mutator permission (operasi pada form.features) ===
  const toggleSimplePermission = useCallback((featureId: string) => {
    setForm(f => ({ ...f, features: f.features.map(x => x.featureId === featureId ? { ...x, allowed: !x.allowed } : x) }))
  }, [])

  const toggleSubPermission = useCallback((featureId: string, subId: string) => {
    setForm(f => ({
      ...f,
      features: f.features.map(x => {
        if (x.featureId !== featureId || !x.subPermissions) return x
        const subs = x.subPermissions.map(sp => sp.id === subId ? { ...sp, allowed: !sp.allowed } : sp)
        return { ...x, subPermissions: subs, allowed: subs.some(s => s.allowed) }
      }),
    }))
  }, [])

  const setGroupAll = useCallback((featureId: string, value: boolean) => {
    setForm(f => ({
      ...f,
      features: f.features.map(x => {
        if (x.featureId !== featureId || !x.subPermissions) return x
        return { ...x, subPermissions: x.subPermissions.map(sp => ({ ...sp, allowed: value })), allowed: value }
      }),
    }))
  }, [])

  const setAllFeatures = useCallback((value: boolean) => {
    setForm(f => ({
      ...f,
      features: f.features.map(x => ({
        ...x,
        allowed: value,
        subPermissions: x.subPermissions?.map(sp => ({ ...sp, allowed: value })),
      })),
    }))
  }, [])

  const resetRoleDefault = useCallback(() => {
    setForm(f => ({ ...f, features: buildDefaultFeatures(editingRole?.id || 'new') }))
    toast.info('Role direset ke pengaturan default')
  }, [editingRole])

  // === DIALOG: simpan (create/update + persist) ===
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
        nextRoles = roles.map(r => r.id === editingRole.id ? { ...r, name, features: form.features } : r)
      } else {
        const newRole: Role = {
          id: Date.now().toString(),
          name,
          color: 'bg-slate-100 text-slate-700',
          features: form.features,
        }
        nextRoles = [...roles, newRole]
      }

      // Persist semua role permissions ke database
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

      // Persist metadata role kustom agar tetap ada setelah reload
      const customRolesMeta = nextRoles
        .filter(r => !DEFAULT_ROLES.find(dr => dr.id === r.id))
        .map(r => ({ id: r.id, name: r.name, color: r.color, isSystem: r.isSystem || false }))
      await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesMeta) })
      })

      // Simpan ke localStorage + event agar sidebar langsung diperbarui
      saveAllPermissions(permData)

      setRoles(nextRoles)
      setDialogOpen(false)
      toast.success(editingRole ? `Hak akses role "${name}" berhasil diperbarui` : `Role "${name}" ditambahkan`)
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

  // === Derived: ringkasan role (tabel) ===
  const roleSummary = (role: Role) => {
    const active = role.features.filter(f => f.allowed).length
    return `${active}/${role.features.length}`
  }

  // === Derived: ringkasan form (dialog) ===
  const formActiveCount = form.features.filter(f => f.allowed).length
  const formTotalCount = form.features.length

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

      {/* ==================== SECTION 1: ROLE & HAK AKSES (CRUD sederhana) ==================== */}
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        {/* Header */}
        <div className="p-4 lg:p-6 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Role &amp; Hak Akses</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {dataLoaded ? `${roles.length} role` : 'Memuat data…'}
            </p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-2 min-h-[44px] w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Tambah Role
          </Button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          {dataLoaded ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>Role</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-center">Fitur Aktif</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${getRoleColor(role.id)}`}>
                        {role.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-600">
                        {role.isSystem ? 'Bawaan' : 'Kustom'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{roleSummary(role)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={role.id === 'superadmin'}
                          onClick={() => openEdit(role)}
                          aria-label={`Edit hak akses ${role.name}`}
                          title={role.id === 'superadmin' ? 'Super Admin memiliki akses penuh' : 'Edit hak akses'}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          disabled={role.id === 'superadmin' || role.id === 'admin'}
                          onClick={() => { setRoleToDelete(role); setDeleteDialogOpen(true) }}
                          aria-label={`Hapus ${role.name}`}
                          title={role.id === 'superadmin' || role.id === 'admin' ? 'Role sistem tidak dapat dihapus' : t('hapus_role')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {dataLoaded ? (
            roles.map((role) => (
              <div key={role.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${getRoleColor(role.id)}`}>
                    {role.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-600 shrink-0">
                    {role.isSystem ? 'Bawaan' : 'Kustom'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{roleSummary(role)} fitur aktif</p>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    disabled={role.id === 'superadmin'}
                    onClick={() => openEdit(role)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                    disabled={role.id === 'superadmin' || role.id === 'admin'}
                    onClick={() => { setRoleToDelete(role); setDeleteDialogOpen(true) }}
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          )}
        </div>
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

      {/* ==================== DIALOG: TAMBAH / EDIT ROLE + HAK AKSES ==================== */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !saving) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Hak Akses Role' : 'Tambah Role Baru'}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? `Atur akses halaman & operasi CRUD untuk role ${editingRole.name}.`
                : 'Buat role baru, lalu atur akses halaman & operasi CRUD-nya.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nama role */}
            <div className="grid gap-1.5">
              <Label htmlFor="roleName">{t('nama_role')} <span className="text-destructive">*</span></Label>
              <Input
                id="roleName"
                placeholder="Contoh: Supervisor"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Ringkasan + aksi cepat */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-bold text-slate-700">{formActiveCount}</span> dari {formTotalCount} fitur aktif
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setAllFeatures(true)}>
                  <CheckCheck className="w-3.5 h-3.5" />Beri Semua
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setAllFeatures(false)}>
                  <Ban className="w-3.5 h-3.5" />Kosongkan
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={resetRoleDefault}>
                  <RotateCcw className="w-3.5 h-3.5" />Reset Default
                </Button>
              </div>
            </div>

            {/* Matrix hak akses — scrollable */}
            <div className="max-h-[55vh] overflow-y-auto space-y-5 pr-1 scrollbar-thin">
              {/* A: Akses Halaman & Fitur */}
              <section aria-label="Akses Halaman & Fitur">
                <h3 className="text-sm font-bold text-slate-800">Akses Halaman &amp; Fitur</h3>
                <p className="text-xs text-slate-400 mt-0.5">Halaman tanpa akses tidak tampil di menu role ini.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {SIMPLE_FEATURES.map((f) => {
                    const fp = form.features.find(x => x.featureId === f.id)
                    return (
                      <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 bg-white">
                        <p className="text-sm text-slate-800 truncate">{f.name}</p>
                        <Switch
                          checked={fp?.allowed || false}
                          onCheckedChange={() => toggleSimplePermission(f.id)}
                          className="shrink-0"
                          aria-label={`Akses ${f.name}`}
                        />
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* B: Operasi CRUD */}
              <section aria-label="Operasi CRUD">
                <h3 className="text-sm font-bold text-slate-800">Operasi CRUD — Master Data &amp; Pengguna</h3>
                <p className="text-xs text-slate-400 mt-0.5">Centang operasi (Lihat / Tambah / Edit / Hapus) yang boleh dilakukan role ini.</p>
                <div className="space-y-2 mt-2">
                  {GROUP_FEATURES.map((g) => {
                    const fp = form.features.find(x => x.featureId === g.id)
                    const subs = fp?.subPermissions || []
                    const allowedCount = subs.filter(s => s.allowed).length
                    return (
                      <div key={g.id} className="rounded-lg border border-slate-200 px-3 py-2.5 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <p className="text-sm font-medium text-slate-800">
                            {g.name}
                            <span className="ml-2 text-[10px] font-semibold text-slate-400">{allowedCount}/{subs.length}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {g.subPermissions.map((sp) => {
                              const s = subs.find(x => x.id === sp.id)
                              return (
                                <label key={sp.id} className="flex items-center gap-1.5 cursor-pointer">
                                  <Checkbox
                                    checked={s?.allowed || false}
                                    onCheckedChange={() => toggleSubPermission(g.id, sp.id)}
                                    className={`h-[18px] w-[18px] rounded border-slate-300 data-[state=checked]:text-white ${subColorClass(sp.id)}`}
                                    aria-label={`${opLabel(sp.id)} ${g.name}`}
                                  />
                                  <span className="text-xs text-slate-600">{opLabel(sp.id)}</span>
                                </label>
                              )
                            })}
                            {subs.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setGroupAll(g.id, allowedCount !== subs.length)}
                                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                              >
                                {allowedCount === subs.length ? 'Kosongkan' : 'Semua'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
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
