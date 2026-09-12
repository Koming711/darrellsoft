'use client'

import {
  Plus, Save, Trash2, MessageCircle, Loader2, ChevronDown,
  CheckCheck, Ban, RotateCcw, ShieldCheck, LayoutGrid, Calculator, Database, Settings2,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback, useMemo, type ComponentType, type ReactNode } from 'react'
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

// ===== KATEGORI FITUR — layout baru: fitur dikelompokkan agar mudah dipindai =====
const CAT_HALAMAN = ['dashboard', 'pembukaan', 'riwayat', 'invoice', 'surat-jalan', 'purchase-order', 'laporan']
const CAT_HITUNG = ['potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas']
const CAT_ADMIN = ['hak-akses', 'pengguna', 'pengaturan']

const FEATURE_DESC: Record<string, string> = {
  'dashboard': 'Ringkasan aktivitas & statistik bisnis',
  'pembukaan': 'Beranda operasional harian',
  'riwayat': 'Riwayat dokumen & hasil hitung',
  'invoice': 'Buat & cetak invoice (fitur PRO)',
  'surat-jalan': 'Buat & cetak surat jalan (fitur PRO)',
  'purchase-order': 'Purchase order pembelian (fitur PRO)',
  'laporan': 'Laporan ringkasan transaksi',
  'potong-kertas': 'Kalkulasi pemotongan kertas',
  'hitung-cetakan': 'Kalkulasi biaya & harga cetakan',
  'hitung-finishing': 'Kalkulasi biaya finishing',
  'hitung-ongkos-cetak': 'Kalkulasi ongkos cetak',
  'hitung-harga-kertas': 'Kalkulasi harga kertas',
  'hak-akses': 'Kelola role & hak akses fitur',
  'pengguna': 'Kelola pengguna, pembeli & calon pembeli',
  'pengaturan': 'Pengaturan aplikasi & data perusahaan',
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
// Ensures custom roles survive page reload even before user clicks "Simpan".
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

// ===== Presentational: kategori fitur =====
function FeatureCategory({ icon: Icon, title, desc, children }: {
  icon: ComponentType<{ className?: string }>
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="mb-6 last:mb-0" aria-label={title}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 leading-tight">{title}</h3>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
        <div className="flex-1 h-px bg-slate-100 ml-2" />
      </div>
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-card">
        {children}
      </div>
    </section>
  )
}

// ===== Presentational: baris fitur sederhana (akses halaman on/off) =====
function SimpleFeatureRow({ name, desc, checked, disabled, onChange }: {
  name: string
  desc?: string
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{name}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0"
        aria-label={`Akses ${name}`}
      />
    </div>
  )
}

// ===== Presentational: kartu fitur CRUD (group) =====
function GroupFeatureCard({ groupName, subs, editable, expanded, onToggleExpand, onToggleSub, onSetAll }: {
  groupName: string
  subs: SubPermission[]
  editable: boolean
  expanded: boolean
  onToggleExpand: () => void
  onToggleSub: (subId: string) => void
  onSetAll: (value: boolean) => void
}) {
  const total = subs.length
  const allowedCount = subs.filter(s => s.allowed).length
  const all = total > 0 && allowedCount === total
  const some = allowedCount > 0 && !all
  const allowedNames = subs.filter(s => s.allowed).map(s => s.name).join(' · ')

  return (
    <div>
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        aria-expanded={expanded}
      >
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${all ? 'bg-emerald-500' : some ? 'bg-amber-400' : 'bg-slate-300'}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{groupName}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {allowedCount === 0 ? 'Tidak ada akses' : allowedNames}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${all ? 'bg-emerald-100 text-emerald-700' : some ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
          {allowedCount}/{total}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Operasi CRUD</p>
            {editable && (
              <button
                type="button"
                onClick={() => onSetAll(!all)}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                {all ? 'Kosongkan' : 'Pilih Semua'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {subs.map(sp => (
              <div key={sp.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white transition-colors">
                <Checkbox
                  id={`perm-${sp.id}`}
                  checked={sp.allowed}
                  onCheckedChange={() => onToggleSub(sp.id)}
                  disabled={!editable}
                  className={`h-5 w-5 rounded border-slate-300 data-[state=checked]:text-white ${subColorClass(sp.id)}`}
                />
                <Label htmlFor={`perm-${sp.id}`} className="text-sm text-slate-700 font-normal cursor-pointer flex-1 min-w-0">
                  {sp.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function HakAksesPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const isSuperAdmin = currentUser?.role === 'superadmin'

  // === ROLES STATE — live edits + snapshot terakhir tersimpan (untuk deteksi perubahan) ===
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [savedRoles, setSavedRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [selectedRoleId, setSelectedRoleId] = useState<string>('admin')
  const [dataLoaded, setDataLoaded] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(GROUP_FEATURES.map(g => g.id)))

  // === DIALOG STATE ===
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
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
        let customPerms: any = null
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
        const applyPerms = (features: FeaturePermission[], custom: any): FeaturePermission[] =>
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
          setSavedRoles(JSON.parse(JSON.stringify(loadedRoles)))
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

  // === DERIVED STATE ===
  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? roles[0]
  const isSuperAdminRole = selectedRole?.id === 'superadmin'
  const activeCount = selectedRole ? selectedRole.features.filter(f => f.allowed).length : 0
  const totalCount = selectedRole?.features.length ?? 0

  // Deteksi perubahan belum disimpan (bandingkan live vs snapshot)
  const isDirty = useMemo(
    () => JSON.stringify(roles) !== JSON.stringify(savedRoles),
    [roles, savedRoles]
  )

  // === FEATURE LOOKUP untuk role terpilih ===
  const getFeature = useCallback((featureId: string): FeaturePermission | undefined => {
    return selectedRole?.features.find(f => f.featureId === featureId)
  }, [selectedRole])

  // === PERMISSION MUTATORS (langsung edit, tanpa mode edit — sticky bar yang menyimpan) ===
  const toggleSimplePermission = useCallback((roleId: string, featureId: string) => {
    if (roleId === 'superadmin') return
    setRoles(prev => prev.map(role =>
      role.id === roleId
        ? { ...role, features: role.features.map(f => f.featureId === featureId ? { ...f, allowed: !f.allowed } : f) }
        : role
    ))
  }, [])

  const toggleSubPermission = useCallback((roleId: string, featureId: string, subId: string) => {
    if (roleId === 'superadmin') return
    setRoles(prev => prev.map(role => {
      if (role.id !== roleId) return role
      return {
        ...role,
        features: role.features.map(f => {
          if (f.featureId !== featureId || !f.subPermissions) return f
          const subs = f.subPermissions.map(sp => sp.id === subId ? { ...sp, allowed: !sp.allowed } : sp)
          return { ...f, subPermissions: subs, allowed: subs.some(s => s.allowed) }
        }),
      }
    }))
  }, [])

  const setGroupAll = useCallback((roleId: string, featureId: string, value: boolean) => {
    if (roleId === 'superadmin') return
    setRoles(prev => prev.map(role => {
      if (role.id !== roleId) return role
      return {
        ...role,
        features: role.features.map(f => {
          if (f.featureId !== featureId || !f.subPermissions) return f
          return { ...f, subPermissions: f.subPermissions.map(sp => ({ ...sp, allowed: value })), allowed: value }
        }),
      }
    }))
  }, [])

  const setRoleAll = useCallback((roleId: string, value: boolean) => {
    if (roleId === 'superadmin') return
    setRoles(prev => prev.map(role => {
      if (role.id !== roleId) return role
      return {
        ...role,
        features: role.features.map(f => ({
          ...f,
          allowed: value,
          subPermissions: f.subPermissions?.map(sp => ({ ...sp, allowed: value })),
        })),
      }
    }))
  }, [])

  const resetRoleDefault = useCallback((roleId: string) => {
    if (roleId === 'superadmin') return
    setRoles(prev => prev.map(role =>
      role.id === roleId ? { ...role, features: buildDefaultFeatures(role.id) } : role
    ))
    toast.info('Role direset ke pengaturan default — jangan lupa Simpan')
  }, [])

  const toggleGroupExpand = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  // === SIMPAN / BATAL ===
  const handleSave = useCallback(async () => {
    setSaveLoading(true)
    try {
      // Build permission data for all roles
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

      // Save to database
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

      // Also persist custom role metadata (id/name/color) so custom roles survive page reload
      const customRolesMeta = roles
        .filter(r => !DEFAULT_ROLES.find(dr => dr.id === r.id))
        .map(r => ({ id: r.id, name: r.name, color: r.color, isSystem: r.isSystem || false }))
      await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'custom_roles', value: JSON.stringify(customRolesMeta) })
      })

      // Save to localStorage for immediate sidebar update
      saveAllPermissions(permData)

      setSavedRoles(JSON.parse(JSON.stringify(roles)))
      toast.success('Hak akses berhasil disimpan!')
    } catch (err) {
      toast.error('Gagal menyimpan ke database')
    } finally {
      setSaveLoading(false)
    }
  }, [roles])

  const handleCancel = useCallback(() => {
    setRoles(JSON.parse(JSON.stringify(savedRoles)))
  }, [savedRoles])

  // === ROLE HANDLERS ===
  const handleAddRole = useCallback(() => {
    const name = newRoleName.trim()
    if (!name) { toast.error('Nama role wajib diisi'); return }
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Nama role sudah digunakan'); return
    }
    const newRole: Role = {
      id: Date.now().toString(), name,
      color: 'bg-slate-100 text-slate-700', features: buildDefaultFeatures('new'),
    }
    const nextRoles = [...roles, newRole]
    // Metadata role otomatis dipersist; permission-nya masih default (belum "dirty")
    setRoles(nextRoles)
    setSavedRoles(JSON.parse(JSON.stringify(nextRoles)))
    setSelectedRoleId(newRole.id)
    setNewRoleName('')
    setDialogOpen(false)
    toast.success(`Role "${name}" ditambahkan`)
    void persistCustomRoles(nextRoles)
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
    const nextRoles = roles.filter(r => r.id !== roleId)
    setRoles(nextRoles)
    setSavedRoles(JSON.parse(JSON.stringify(nextRoles)))
    if (selectedRoleId === roleId) setSelectedRoleId(nextRoles[0]?.id ?? '')

    void persistCustomRoles(nextRoles)

    // Clean up permissions in database (role_permissions)
    try {
      const res = await authFetch('/api/settings')
      const data = await res.json()
      if (Array.isArray(data)) {
        const permEntry = data.find((s: any) => s.key === 'role_permissions')
        if (permEntry?.value) {
          const permData = JSON.parse(permEntry.value)
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
  }, [roleToDelete, roles, selectedRoleId])

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

  // === Render helper: fitur sederhana per kategori ===
  const renderSimpleFeatures = (ids: string[]) => {
    return ids.map(fid => {
      const def = SIMPLE_FEATURES.find(f => f.id === fid)
      if (!def) return null
      const fp = getFeature(fid)
      return (
        <SimpleFeatureRow
          key={fid}
          name={def.name}
          desc={FEATURE_DESC[fid]}
          checked={fp?.allowed || false}
          disabled={isSuperAdminRole}
          onChange={() => selectedRole && toggleSimplePermission(selectedRole.id, fid)}
        />
      )
    })
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

      {/* ==================== SECTION 1: ROLE & HAK AKSES FITUR ==================== */}
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 lg:p-6 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Role &amp; Hak Akses Fitur</h2>
              <p className="text-sm text-slate-500 mt-0.5">Pilih role, lalu atur akses halaman &amp; operasi CRUD untuk setiap fitur</p>
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Tambah Role
            </Button>
          </div>

          {/* Role selector chips */}
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Pilih role">
            {roles.map((role) => {
              const active = selectedRole?.id === role.id
              return (
                <div
                  key={role.id}
                  className={`inline-flex items-center gap-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`flex items-center gap-1.5 pl-3.5 pr-3 py-1.5 text-sm font-semibold rounded-full focus-visible:outline-none ${
                      active ? 'text-emerald-900' : 'text-slate-600'
                    }`}
                  >
                    {role.name}
                    {role.isSystem && (
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full ${getRoleColor(role.id)}`}>
                        Sistem
                      </span>
                    )}
                  </button>
                  {!role.isSystem && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(role.id)}
                      className="mr-1.5 p-1 rounded-full hover:bg-red-100 transition-colors text-slate-400 hover:text-red-600 focus-visible:outline-none"
                      title={t('hapus_role')}
                      aria-label={`${t('hapus_role')} ${role.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Editor hak akses role terpilih */}
        {selectedRole && (
          <div className="p-4 lg:p-6">
            {/* Ringkasan + aksi cepat */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${getRoleColor(selectedRole.id)}`}>
                  {selectedRole.name}
                </span>
                <span className="text-xs text-slate-500">
                  <span className="font-bold text-slate-700">{activeCount}</span> dari {totalCount} fitur aktif
                </span>
              </div>
              {!isSuperAdminRole && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRoleAll(selectedRole.id, true)} className="gap-1.5 h-8 text-xs">
                    <CheckCheck className="w-3.5 h-3.5" />Beri Semua
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRoleAll(selectedRole.id, false)} className="gap-1.5 h-8 text-xs">
                    <Ban className="w-3.5 h-3.5" />Kosongkan
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => resetRoleDefault(selectedRole.id)} className="gap-1.5 h-8 text-xs">
                    <RotateCcw className="w-3.5 h-3.5" />Reset Default
                  </Button>
                </div>
              )}
            </div>

            {/* Info khusus superadmin */}
            {isSuperAdminRole && (
              <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800">
                  Super Admin memiliki akses penuh ke seluruh fitur &amp; operasi CRUD. Hak akses ini tidak dapat diubah.
                </p>
              </div>
            )}

            {/* Kategori: Halaman Utama & Transaksi */}
            <FeatureCategory icon={LayoutGrid} title="Halaman Utama & Transaksi" desc="Akses halaman utama & alur dokumen">
              {renderSimpleFeatures(CAT_HALAMAN)}
            </FeatureCategory>

            {/* Kategori: Hitung & Kalkulasi */}
            <FeatureCategory icon={Calculator} title="Hitung & Kalkulasi" desc="Kalkulator produksi & harga">
              {renderSimpleFeatures(CAT_HITUNG)}
            </FeatureCategory>

            {/* Kategori: Master Data (CRUD) */}
            <FeatureCategory icon={Database} title="Master Data — Operasi CRUD" desc="Atur aksi Lihat / Tambah / Edit / Hapus untuk setiap fitur. Fitur tanpa akses tidak tampil di menu role ini.">
              {GROUP_FEATURES.map((group) => {
                const fp = selectedRole.features.find(f => f.featureId === group.id)
                const subs = fp?.subPermissions || []
                return (
                  <GroupFeatureCard
                    key={group.id}
                    groupName={group.name}
                    subs={subs}
                    editable={!isSuperAdminRole}
                    expanded={expandedGroups.has(group.id)}
                    onToggleExpand={() => toggleGroupExpand(group.id)}
                    onToggleSub={(subId) => selectedRole && toggleSubPermission(selectedRole.id, group.id, subId)}
                    onSetAll={(value) => selectedRole && setGroupAll(selectedRole.id, group.id, value)}
                  />
                )
              })}
            </FeatureCategory>

            {/* Kategori: Administrasi */}
            <FeatureCategory icon={Settings2} title="Administrasi" desc="Pengelolaan sistem & pengguna">
              {renderSimpleFeatures(CAT_ADMIN)}
            </FeatureCategory>
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

      {/* ==================== STICKY SAVE BAR (muncul saat ada perubahan) ==================== */}
      {isDirty && (
        <div
          className="sticky z-40 mb-4 bottom-[calc(3.75rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-0"
          data-sticky-savebar
        >
          <div className="rounded-xl border border-amber-300 bg-white/95 backdrop-blur shadow-lg shadow-amber-100/50 dark:bg-zinc-900/95 dark:border-amber-800 overflow-hidden">
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Save className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">Perubahan belum disimpan</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Simpan untuk menerapkan hak akses ke seluruh pengguna</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saveLoading}>
                  {t('batal')}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saveLoading || !dataLoaded} className="gap-2 min-w-[160px]">
                  {saveLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Menyimpan...</> : <><Save className="w-4 h-4" />Simpan Perubahan</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <DialogDescription>Masukkan nama role baru untuk ditambahkan ke daftar hak akses</DialogDescription>
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
