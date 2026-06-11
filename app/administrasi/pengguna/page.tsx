'use client'

import { Users, Plus, Search, Eye, EyeOff, UserPlus, ShoppingCart, UserCheck, CheckCircle, Clock, XCircle, Loader2, KeyRound } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MobileTable } from '@/components/mobile-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { hasSubPermission } from '@/lib/permissions'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ==================== TYPES ====================

interface Pengguna {
  id: string
  namaLengkap: string
  nomorHP: string
  email: string
  username: string
  password: string
  role: string
  grupId: string | null
  createdAt: string
  validUntil: string | null
}

interface CalonPembeli {
  id: string
  nama: string
  nomorHP: string
  email: string
  alamat: string
  catatan: string
  status: string
  role: string
  expiredDate: string | null
  createdAt: string
  updatedAt: string
  username: string | null
  password: string | null
}

interface Pembeli {
  id: string
  nama: string
  nomorHP: string
  email: string
  alamat: string
  catatan: string
  role: string
  expiredDate: string | null
  userId: string | null
  penggunaId: string | null
  penggunaUsername: string | null
  grupId: string | null
  createdAt: string
  updatedAt: string
}

// Grouped pembeli for display (merges same-grupId entries into 1 row)
interface GroupedPembeli {
  id: string // primary pembeli id (owner's)
  nama: string // owner's name
  nomorHP: string
  email: string
  alamat: string
  catatan: string
  role: string // owner's role
  expiredDate: string | null
  userId: string | null
  penggunaId: string | null
  penggunaUsername: string | null
  grupId: string | null
  usernames: string[] // all usernames in the group
  pembeliIds: string[] // all pembeli ids in the group (for delete)
  createdAt: string
  updatedAt: string
}

// ==================== CONSTANTS ====================

const ROLE_OPTIONS = ['superadmin', 'admin', 'manager', 'owner', 'demo', 'user']

const roleColors: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700',
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-emerald-100 text-emerald-700',
  owner: 'bg-orange-100 text-orange-700',
  demo: 'bg-amber-100 text-amber-700',
  user: 'bg-blue-100 text-blue-700',
}

const calonStatusColors: Record<string, string> = {
  baru: 'bg-blue-100 text-blue-700',
  diproses: 'bg-amber-100 text-amber-700',
  selesai: 'bg-emerald-100 text-emerald-700',
  batal: 'bg-red-100 text-red-700',
}

const calonStatusIcons: Record<string, any> = {
  baru: Clock,
  diproses: Loader2,
  selesai: CheckCircle,
  batal: XCircle,
}

const CALON_STATUS_OPTIONS = [
  { value: 'baru', label: 'Baru' },
  { value: 'diproses', label: 'Diproses' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'batal', label: 'Batal' },
]

// ==================== HELPERS ====================

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const getUserStatus = (validUntil: string | null) => {
  if (!validUntil) return 'Tidak terbatas'
  return new Date(validUntil) > new Date() ? 'Aktif' : 'Kadaluarsa'
}

const getUserStatusColor = (validUntil: string | null) => {
  if (!validUntil) return 'bg-blue-100 text-blue-700'
  return new Date(validUntil) > new Date()
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-red-100 text-red-700'
}

// ==================== MAIN COMPONENT ====================

export default function PenggunaPage() {
  // Permission checks
  const currentUser = getAuthUser()
  const { t } = useLanguage()

  // Daftar Pengguna
  const canAddUser = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'daftar-pengguna', 'daftar-pengguna-tambah')
  const canEditUser = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'daftar-pengguna', 'daftar-pengguna-edit')
  const canDeleteUser = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'daftar-pengguna', 'daftar-pengguna-hapus')

  // Calon Pembeli
  const canAddCalon = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'calon-pembeli', 'calon-pembeli-tambah')
  const canEditCalon = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'calon-pembeli', 'calon-pembeli-edit')
  const canDeleteCalon = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'calon-pembeli', 'calon-pembeli-hapus')
  const canConvertCalon = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'calon-pembeli', 'calon-pembeli-konversi')

  // Pembeli
  const canAddPembeli = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'pembeli', 'pembeli-tambah')
  const canEditPembeli = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'pembeli', 'pembeli-edit')
  const canDeletePembeli = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'pembeli', 'pembeli-hapus')

  // Data states
  const [penggunaList, setPenggunaList] = useState<Pengguna[]>([])
  const [calonList, setCalonList] = useState<CalonPembeli[]>([])
  const [pembeliList, setPembeliList] = useState<Pembeli[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // User dialog state
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Pengguna | null>(null)
  const [formNamaLengkap, setFormNamaLengkap] = useState('')
  const [formNomorHP, setFormNomorHP] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formValidUntil, setFormValidUntil] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  // Calon dialog state
  const [calonDialogOpen, setCalonDialogOpen] = useState(false)
  const [editingCalon, setEditingCalon] = useState<CalonPembeli | null>(null)
  const [calonNama, setCalonNama] = useState('')
  const [calonNomorHP, setCalonNomorHP] = useState('')
  const [calonEmail, setCalonEmail] = useState('')
  const [calonAlamat, setCalonAlamat] = useState('')
  const [calonCatatan, setCalonCatatan] = useState('')
  const [calonStatus, setCalonStatus] = useState('baru')
  const [calonRole, setCalonRole] = useState('demo')
  const [calonExpiredDate, setCalonExpiredDate] = useState('')
  const [calonUsername, setCalonUsername] = useState('')
  const [calonSaving, setCalonSaving] = useState(false)

  // Pembeli dialog state
  const [pembeliDialogOpen, setPembeliDialogOpen] = useState(false)
  const [editingPembeli, setEditingPembeli] = useState<Pembeli | null>(null)
  const [pembeliNama, setPembeliNama] = useState('')
  const [pembeliNomorHP, setPembeliNomorHP] = useState('')
  const [pembeliEmail, setPembeliEmail] = useState('')
  const [pembeliAlamat, setPembeliAlamat] = useState('')
  const [pembeliCatatan, setPembeliCatatan] = useState('')
  const [pembeliRole, setPembeliRole] = useState('demo')
  const [pembeliExpiredDate, setPembeliExpiredDate] = useState('')
  const [pembeliUsername, setPembeliUsername] = useState('')
  const [pembeliSaving, setPembeliSaving] = useState(false)

  // Create account dialog state
  const [createAccountOpen, setCreateAccountOpen] = useState(false)
  const [createAccountPembeli, setCreateAccountPembeli] = useState<Pembeli | null>(null)
  const [caUsername, setCaUsername] = useState('')
  const [caPassword, setCaPassword] = useState('')
  const [caSaving, setCaSaving] = useState(false)


  // ==================== FETCH DATA ====================

  const fetchAll = useCallback(async () => {
    try {
      const [resPengguna, resCalon, resPembeli] = await Promise.all([
        authFetch('/api/pengguna'),
        authFetch('/api/calon-pembeli'),
        authFetch('/api/pembeli'),
      ])

      if (resPengguna.ok) setPenggunaList(await resPengguna.json())
      if (resCalon.ok) setCalonList(await resCalon.json())
      if (resPembeli.ok) setPembeliList(await resPembeli.json())
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }, [])

  useEffect(() => {
    fetchAll().finally(() => setLoading(false))
  }, [])

  // Cross-tab sync: useDataChange has built-in 2s delay to avoid Supabase stale data
  useDataChange(['pengguna', 'calon-pembeli', 'pembeli'], () => { fetchAll() })

  // ==================== USER CRUD ====================

  // Only show admin/superadmin in Daftar Admin
  const adminList = penggunaList.filter(user =>
    user.role === 'admin' || user.role === 'superadmin'
  )

  // Non-admin pengguna (owner, user, demo, manager from checkout)
  const nonAdminList = penggunaList.filter(user =>
    user.role !== 'admin' && user.role !== 'superadmin'
  )

  const filteredUsers = adminList.filter(user =>
    user.namaLengkap.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const [allSearchTerm, setAllSearchTerm] = useState('')
  const filteredAllUsers = nonAdminList.filter(user =>
    user.namaLengkap.toLowerCase().includes(allSearchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(allSearchTerm.toLowerCase())
  )

  const resetUserForm = () => {
    setFormNamaLengkap('')
    setFormNomorHP('')
    setFormEmail('')
    setFormUsername('')
    setFormPassword('')
    setFormRole('')
    setFormValidUntil('')
    setShowPassword(false)
    setEditingUser(null)
  }

  const handleAddUser = () => {
    resetUserForm()
    setUserDialogOpen(true)
  }

  const handleEditUser = (user: Pengguna) => {
    setEditingUser(user)
    setFormNamaLengkap(user.namaLengkap)
    setFormNomorHP(user.nomorHP)
    setFormEmail(user.email)
    setFormUsername(user.username)
    setFormPassword('')
    setFormRole(user.role)
    setFormValidUntil(user.validUntil ? new Date(user.validUntil).toISOString().split('T')[0] : '')
    setShowPassword(false)
    setUserDialogOpen(true)
  }

  const handleDeleteUser = async (user: Pengguna) => {
    if (user.username === 'admin' || user.username === 'superadmin') {
      toast.error('Tidak dapat menghapus user ini')
      return
    }
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const res = await authFetch(`/api/pengguna?id=${user.id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success('User berhasil dihapus')
          // Optimistic update: remove from state immediately
          setPenggunaList(prev => prev.filter(u => u.id !== user.id))
          notifyDataChange('pengguna')
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal menghapus user')
        }
      } catch {
        toast.error('Terjadi kesalahan jaringan')
      }
    }
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formNamaLengkap.trim() || !formUsername.trim() || !formRole) {
      toast.error('Nama lengkap, username, dan role wajib diisi')
      return
    }
    setSaving(true)
    try {
      if (editingUser) {
        const res = await authFetch('/api/pengguna', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingUser.id,
            namaLengkap: formNamaLengkap.trim(),
            nomorHP: formNomorHP.trim(),
            email: formEmail.trim(),
            username: formUsername.trim(),
            password: formPassword || undefined,
            role: formRole,
            validUntil: formValidUntil || undefined,
          })
        })
        if (res.ok) {
          const savedUser = await res.json()
          toast.success('User berhasil diperbarui')
          // Optimistic update
          setPenggunaList(prev => prev.map(u => u.id === savedUser.id ? savedUser : u))
          notifyDataChange('pengguna')
          setUserDialogOpen(false)
          resetUserForm()
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal memperbarui user')
        }
      } else {
        if (!formPassword) {
          toast.error('Password wajib diisi untuk pengguna baru')
          setSaving(false)
          return
        }
        const res = await authFetch('/api/pengguna', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            namaLengkap: formNamaLengkap.trim(),
            nomorHP: formNomorHP.trim(),
            email: formEmail.trim(),
            username: formUsername.trim(),
            password: formPassword,
            role: formRole,
          })
        })
        if (res.ok) {
          const savedUser = await res.json()
          toast.success('User berhasil ditambahkan')
          // Optimistic update
          setPenggunaList(prev => [savedUser, ...prev])
          notifyDataChange('pengguna')
          setUserDialogOpen(false)
          resetUserForm()
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal menambahkan user')
        }
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  // ==================== CALON PEMBELI CRUD ====================

  const resetCalonForm = () => {
    setCalonNama('')
    setCalonNomorHP('')
    setCalonEmail('')
    setCalonAlamat('')
    setCalonCatatan('')
    setCalonStatus('baru')
    setCalonRole('demo')
    setCalonExpiredDate('')
    setCalonUsername('')
    setEditingCalon(null)
  }

  const handleAddCalon = () => {
    resetCalonForm()
    setCalonDialogOpen(true)
  }

  const handleEditCalon = (item: CalonPembeli) => {
    setEditingCalon(item)
    setCalonNama(item.nama)
    setCalonNomorHP(item.nomorHP)
    setCalonEmail(item.email)
    setCalonAlamat(item.alamat)
    setCalonCatatan(item.catatan)
    setCalonStatus(item.status)
    setCalonRole(item.role)
    setCalonExpiredDate(item.expiredDate ? new Date(item.expiredDate).toISOString().split('T')[0] : '')
    setCalonUsername(item.username || '')
    setCalonDialogOpen(true)
  }

  const handleDeleteCalon = async (item: CalonPembeli) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const res = await authFetch(`/api/calon-pembeli?id=${item.id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success('Calon pembeli berhasil dihapus')
          // Optimistic update
          setCalonList(prev => prev.filter(c => c.id !== item.id))
          notifyDataChange('calon-pembeli')
        } else {
          toast.error('Gagal menghapus calon pembeli')
        }
      } catch {
        toast.error('Terjadi kesalahan jaringan')
      }
    }
  }

  const handleConvertToPembeli = async (item: CalonPembeli) => {
    const hasUsername = item.username && item.username.trim()
    const msg = hasUsername
      ? `Konversi "${item.nama}" (@${item.username}) menjadi pembeli?\n\nAkun login otomatis akan dibuat dengan username "${item.username}".`
      : `Konversi "${item.nama}" menjadi pembeli?\n\nCatatan: Calon pembeli ini tidak memiliki username/password, sehingga tidak bisa login setelah dikonversi.`
    if (!confirm(msg)) return
    setCalonSaving(true)
    try {
      const res = await authFetch('/api/calon-pembeli/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calonId: item.id }),
      })

      const data = await res.json()

      if (res.ok) {
        // Optimistic update: remove from calon list
        setCalonList(prev => prev.filter(c => c.id !== item.id))
        // Optimistic update: add to pembeli list immediately
        if (data.pembeli) {
          const newPembeli: Pembeli = {
            ...data.pembeli,
            penggunaUsername: item.username || null,
          }
          setPembeliList(prev => [newPembeli, ...prev])
        }
        // If a pengguna was created, add to pengguna list
        if (data.penggunaId) {
          const newPengguna: Pengguna = {
            id: data.penggunaId,
            namaLengkap: item.nama,
            nomorHP: item.nomorHP,
            email: item.email,
            username: item.username || '',
            password: '',
            role: 'user',
            createdAt: new Date().toISOString(),
            validUntil: null,
          }
          setPenggunaList(prev => [newPengguna, ...prev])
        }
        if (data.hasLoginAccount) {
          toast.success(`"${item.nama}" berhasil dikonversi menjadi pembeli. Akun login @${item.username} telah dibuat.`)
        } else {
          toast.success(`"${item.nama}" berhasil dikonversi menjadi pembeli.`, { description: 'Tidak ada akun login (username/password belum diatur).' })
        }
        notifyDataChange('calon-pembeli')
        notifyDataChange('pembeli')
        notifyDataChange('pengguna')
      } else {
        toast.error(data.error || 'Gagal mengkonversi calon pembeli')
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setCalonSaving(false)
    }
  }

  const handleSaveCalon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!calonNama.trim() || !calonNomorHP.trim()) {
      toast.error('Nama dan nomor HP wajib diisi')
      return
    }
    setCalonSaving(true)
    try {
      if (editingCalon) {
        const res = await authFetch('/api/calon-pembeli', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingCalon.id,
            nama: calonNama.trim(),
            nomorHP: calonNomorHP.trim(),
            email: calonEmail.trim(),
            alamat: calonAlamat.trim(),
            catatan: calonCatatan.trim(),
            status: calonStatus,
            role: calonRole,
            expiredDate: calonExpiredDate || null,
            username: calonUsername.trim() || null,
          })
        })
        if (res.ok) {
          const savedCalon = await res.json()
          toast.success('Calon pembeli berhasil diperbarui')
          // Optimistic update
          setCalonList(prev => prev.map(c => c.id === savedCalon.id ? savedCalon : c))
          notifyDataChange('calon-pembeli')
          setCalonDialogOpen(false)
          resetCalonForm()
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal memperbarui')
        }
      } else {
        const res = await authFetch('/api/calon-pembeli', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama: calonNama.trim(),
            nomorHP: calonNomorHP.trim(),
            email: calonEmail.trim(),
            alamat: calonAlamat.trim(),
            catatan: calonCatatan.trim(),
            status: calonStatus,
            role: calonRole,
            expiredDate: calonExpiredDate || null,
            username: calonUsername.trim() || null,
          })
        })
        if (res.ok) {
          const savedCalon = await res.json()
          toast.success('Calon pembeli berhasil ditambahkan')
          // Optimistic update
          setCalonList(prev => [savedCalon, ...prev])
          notifyDataChange('calon-pembeli')
          setCalonDialogOpen(false)
          resetCalonForm()
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal menambahkan')
        }
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setCalonSaving(false)
    }
  }

  // ==================== PEMBELI CRUD ====================

  const resetPembeliForm = () => {
    setPembeliNama('')
    setPembeliNomorHP('')
    setPembeliEmail('')
    setPembeliAlamat('')
    setPembeliCatatan('')
    setPembeliRole('demo')
    setPembeliExpiredDate('')
    setPembeliUsername('')
    setEditingPembeli(null)
  }

  const handleAddPembeli = () => {
    resetPembeliForm()
    setPembeliDialogOpen(true)
  }

  const handleEditPembeli = (item: Pembeli) => {
    setEditingPembeli(item)
    setPembeliNama(item.nama)
    setPembeliNomorHP(item.nomorHP)
    setPembeliEmail(item.email)
    setPembeliAlamat(item.alamat)
    setPembeliCatatan(item.catatan)
    setPembeliRole(item.role || 'demo')
    setPembeliExpiredDate(item.expiredDate ? new Date(item.expiredDate).toISOString().split('T')[0] : '')
    setPembeliUsername(item.penggunaUsername || '')
    setPembeliDialogOpen(true)
  }

  const handleDeletePembeli = async (item: Pembeli) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const res = await authFetch(`/api/pembeli?id=${item.id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success('Pembeli berhasil dihapus')
          // Optimistic update
          setPembeliList(prev => prev.filter(p => p.id !== item.id))
          notifyDataChange('pembeli')
        } else {
          toast.error('Gagal menghapus pembeli')
        }
      } catch {
        toast.error('Terjadi kesalahan jaringan')
      }
    }
  }

  const handleSavePembeli = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pembeliNama.trim() || !pembeliNomorHP.trim()) {
      toast.error('Nama dan nomor HP wajib diisi')
      return
    }
    setPembeliSaving(true)
    try {
      if (editingPembeli) {
        const res = await authFetch('/api/pembeli', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingPembeli.id,
            nama: pembeliNama.trim(),
            nomorHP: pembeliNomorHP.trim(),
            email: pembeliEmail.trim(),
            alamat: pembeliAlamat.trim(),
            catatan: pembeliCatatan.trim(),
            role: pembeliRole,
            expiredDate: pembeliExpiredDate || null,
            username: pembeliUsername.trim() || null,
          })
        })
        if (res.ok) {
          const savedPembeli = await res.json()
          toast.success('Pembeli berhasil diperbarui')
          // Optimistic update (note: may not include penggunaUsername, so delayed refetch will fix it)
          setPembeliList(prev => prev.map(p => p.id === savedPembeli.id ? { ...p, ...savedPembeli, penggunaUsername: savedPembeli.penggunaUsername || p.penggunaUsername } : p))
          notifyDataChange('pembeli')
          setPembeliDialogOpen(false)
          resetPembeliForm()
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal memperbarui')
        }
      } else {
        const res = await authFetch('/api/pembeli', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama: pembeliNama.trim(),
            nomorHP: pembeliNomorHP.trim(),
            email: pembeliEmail.trim(),
            alamat: pembeliAlamat.trim(),
            catatan: pembeliCatatan.trim(),
            role: pembeliRole,
            expiredDate: pembeliExpiredDate || null,
            username: pembeliUsername.trim() || null,
          })
        })
        if (res.ok) {
          const savedPembeli = await res.json()
          toast.success('Pembeli berhasil ditambahkan')
          // Optimistic update
          setPembeliList(prev => [{ ...savedPembeli, penggunaUsername: pembeliUsername.trim() || null }, ...prev])
          notifyDataChange('pembeli')
          setPembeliDialogOpen(false)
          resetPembeliForm()
        } else {
          const data = await res.json()
          toast.error(data.error || 'Gagal menambahkan')
        }
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setPembeliSaving(false)
    }
  }

  // ==================== CREATE ACCOUNT FOR PEMBELI ====================

  const handleOpenCreateAccount = (item: Pembeli) => {
    setCreateAccountPembeli(item)
    setCaUsername('')
    setCaPassword('')
    setCreateAccountOpen(true)
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createAccountPembeli || !caUsername.trim() || !caPassword) {
      toast.error('Username dan password wajib diisi')
      return
    }
    if (caUsername.trim().length < 3) {
      toast.error('Username minimal 3 karakter')
      return
    }
    if (caPassword.length < 6) {
      toast.error('Password minimal 6 karakter')
      return
    }
    setCaSaving(true)
    try {
      const res = await authFetch('/api/pembeli/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pembeliId: createAccountPembeli.id,
          username: caUsername.trim(),
          password: caPassword,
        })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Akun login berhasil dibuat')
        setCreateAccountOpen(false)
        setCreateAccountPembeli(null)
        // Optimistic update: update pembeli's penggunaUsername
        if (createAccountPembeli && caUsername.trim()) {
          setPembeliList(prev => prev.map(p => 
            p.id === createAccountPembeli.id 
              ? { ...p, penggunaUsername: caUsername.trim() }
              : p
          ))
        }
        notifyDataChange('pengguna')
        notifyDataChange('pembeli')
      } else {
        toast.error(data.error || 'Gagal membuat akun login')
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setCaSaving(false)
    }
  }

  // ==================== USER TABLE COLUMNS ====================

  const userColumns = [
    {
      key: 'username',
      title: 'Username',
      render: (user: Pengguna) => (
        <span className="text-slate-600">@{user.username}</span>
      )
    },
    {
      key: 'role',
      title: 'Role',
      render: (user: Pengguna) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${roleColors[user.role] || 'bg-slate-100 text-slate-700'}`}>
          {user.role}
        </span>
      )
    },
    {
      key: 'createdAt',
      title: 'Tanggal Dibuat',
      render: (user: Pengguna) => (
        <span className="text-sm text-slate-600">{formatDate(user.createdAt)}</span>
      )
    },
    {
      key: 'validUntil',
      title: 'Berlaku s/d',
      render: (user: Pengguna) => (
        <span className="text-sm text-slate-600">{user.validUntil ? formatDate(user.validUntil) : <span className="italic text-slate-400">{t('tidak_ada_masa_berlaku')}</span>}</span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      render: (user: Pengguna) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${getUserStatusColor(user.validUntil)}`}>
          {getUserStatus(user.validUntil)}
        </span>
      )
    },
  ]

  // Columns for non-admin pengguna (includes grup info)
  const allUserColumns = [
    {
      key: 'namaLengkap',
      title: 'Nama',
      render: (user: Pengguna) => (
        <div>
          <span className="font-medium text-slate-800">{user.namaLengkap}</span>
        </div>
      )
    },
    {
      key: 'username',
      title: 'Username',
      render: (user: Pengguna) => (
        <span className="text-slate-600">@{user.username}</span>
      )
    },
    {
      key: 'role',
      title: 'Role',
      render: (user: Pengguna) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${roleColors[user.role] || 'bg-slate-100 text-slate-700'}`}>
          {user.role}
        </span>
      )
    },
    {
      key: 'grupId',
      title: 'Grup',
      render: (user: Pengguna) => (
        user.grupId
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">
              <Users className="w-3 h-3" />
              {penggunaList.filter(p => p.grupId === user.grupId).length} akun
            </span>
          : <span className="text-xs text-slate-400">-</span>
      )
    },
    {
      key: 'validUntil',
      title: 'Berlaku s/d',
      render: (user: Pengguna) => (
        <span className="text-sm text-slate-600">{user.validUntil ? formatDate(user.validUntil) : <span className="italic text-slate-400">-</span>}</span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      render: (user: Pengguna) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${getUserStatusColor(user.validUntil)}`}>
          {getUserStatus(user.validUntil)}
        </span>
      )
    },
  ]

  // ==================== CALON PEMBELI COLUMNS ====================

  const calonColumns = [
    {
      key: 'nama',
      title: 'Nama',
      render: (item: CalonPembeli) => (
        <span className="font-medium text-slate-800">{item.nama}</span>
      )
    },
    {
      key: 'username',
      title: 'Username',
      render: (item: CalonPembeli) => (
        item.username
          ? <span className="text-slate-600 font-medium">@{item.username}</span>
          : <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Belum ada</span>
      )
    },
    {
      key: 'nomorHP',
      title: 'No. HP',
      render: (item: CalonPembeli) => (
        <span className="text-slate-600">{item.nomorHP}</span>
      )
    },
    {
      key: 'role',
      title: 'Role',
      render: (item: CalonPembeli) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${roleColors[item.role] || 'bg-slate-100 text-slate-700'}`}>
          {item.role}
        </span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      render: (item: CalonPembeli) => {
        const StatusIcon = calonStatusIcons[item.status] || Clock
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${calonStatusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>
            <StatusIcon className="w-3 h-3" />
            {item.status}
          </span>
        )
      }
    },
    {
      key: 'createdAt',
      title: 'Tanggal Dibuat',
      render: (item: CalonPembeli) => (
        <span className="text-sm text-slate-600">{formatDate(item.createdAt)}</span>
      )
    },
    {
      key: 'expiredDate',
      title: 'Expired Date',
      render: (item: CalonPembeli) => {
        if (!item.expiredDate) return <span className="italic text-slate-400">-</span>
        const isExpired = new Date(item.expiredDate) < new Date()
        return (
          <span className={`text-sm ${isExpired ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
            {formatDate(item.expiredDate)}
          </span>
        )
      }
    },
  ]

  // ==================== GROUPED PEMBELI LIST ====================

  // Group pembeli entries by grupId so that same-group entries appear as 1 row
  const groupedPembeliList: GroupedPembeli[] = (() => {
    const grupMap = new Map<string, Pembeli[]>()
    const ungrouped: GroupedPembeli[] = []

    for (const p of pembeliList) {
      if (p.grupId) {
        if (!grupMap.has(p.grupId)) {
          grupMap.set(p.grupId, [])
        }
        grupMap.get(p.grupId)!.push(p)
      } else {
        // No grupId → standalone entry
        ungrouped.push({
          ...p,
          usernames: p.penggunaUsername ? [p.penggunaUsername] : [],
          pembeliIds: [p.id],
        })
      }
    }

    // Convert grupMap to grouped entries
    const grouped: GroupedPembeli[] = []
    for (const [, members] of grupMap) {
      // Find the owner as the primary entry
      const owner = members.find(m => m.role === 'owner') || members[0]
      const allUsernames = members
        .map(m => m.penggunaUsername)
        .filter((u): u is string => !!u)
      grouped.push({
        ...owner,
        usernames: allUsernames,
        pembeliIds: members.map(m => m.id),
      })
    }

    // Combine grouped and ungrouped, sorted by createdAt desc
    return [...grouped, ...ungrouped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  })()

  // ==================== PEMBELI COLUMNS ====================

  const pembeliColumns = [
    {
      key: 'nama',
      title: 'Nama',
      render: (item: GroupedPembeli) => (
        <div>
          <span className="font-medium text-slate-800">{item.nama}</span>
          {item.grupId && item.usernames && item.usernames.length > 1 && (
            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700">
              <Users className="w-3 h-3" />
              {item.usernames.length} akun
            </span>
          )}
        </div>
      )
    },
    {
      key: 'username',
      title: 'Username',
      render: (item: GroupedPembeli) => {
        if (item.usernames.length > 1) {
          // Show all usernames for grouped entries
          return (
            <div className="flex flex-wrap gap-1">
              {item.usernames.map((u, i) => (
                <span key={i} className="inline-flex items-center text-slate-600 font-medium text-sm">
                  @{u}{i < item.usernames.length - 1 ? <span className="text-slate-400 mx-0.5">,</span> : null}
                </span>
              ))}
            </div>
          )
        }
        if (item.usernames.length === 1) {
          return <span className="text-slate-600 font-medium">@{item.usernames[0]}</span>
        }
        return <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Belum ada akun</span>
      }
    },
    {
      key: 'nomorHP',
      title: 'No. HP',
      render: (item: GroupedPembeli) => (
        <span className="text-slate-600">{item.nomorHP}</span>
      )
    },
    {
      key: 'role',
      title: 'Role',
      render: (item: GroupedPembeli) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${roleColors[item.role] || 'bg-slate-100 text-slate-700'}`}>
          {item.role}
        </span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      render: (item: GroupedPembeli) => {
        if (!item.expiredDate) {
          return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700`}>
              <CheckCircle className="w-3 h-3" />
              Aktif
            </span>
          )
        }
        const isExpired = new Date(item.expiredDate) < new Date()
        if (isExpired) {
          return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700`}>
              <XCircle className="w-3 h-3" />
              Kadaluarsa
            </span>
          )
        }
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700`}>
            <CheckCircle className="w-3 h-3" />
            Aktif
          </span>
        )
      }
    },
    {
      key: 'createdAt',
      title: 'Tanggal Dibuat',
      render: (item: GroupedPembeli) => (
        <span className="text-sm text-slate-600">{formatDate(item.createdAt)}</span>
      )
    },
    {
      key: 'expiredDate',
      title: 'Expired Date',
      render: (item: GroupedPembeli) => {
        if (!item.expiredDate) return <span className="italic text-slate-400">-</span>
        const isExpired = new Date(item.expiredDate) < new Date()
        return (
          <span className={`text-sm ${isExpired ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
            {formatDate(item.expiredDate)}
          </span>
        )
      }
    },
  ]

  // ==================== RENDER ====================

  return (
    <DashboardLayout
      title={t('pengguna_pembeli')}
      subtitle={t('subtitle_pengguna')}
    >
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <Tabs defaultValue="admin" className="flex flex-col">
          {/* Tab Header */}
          <div className="border-b border-slate-200 overflow-x-auto">
              <TabsList className="bg-slate-100 dark:bg-[#1a1a1a] p-1.5 rounded-none h-auto w-full flex min-w-0">
                <TabsTrigger value="admin" className="rounded-lg px-2 sm:px-4 py-2.5 gap-1 sm:gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-[#111] data-[state=active]:shadow-sm flex-1 justify-center whitespace-normal min-w-0 h-auto">
                  <span className="text-xs sm:text-sm font-medium">Admin</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{adminList.length}</span>
                </TabsTrigger>
                <TabsTrigger value="pengguna" className="rounded-lg px-2 sm:px-4 py-2.5 gap-1 sm:gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-[#111] data-[state=active]:shadow-sm flex-1 justify-center whitespace-normal min-w-0 h-auto">
                  <span className="text-xs sm:text-sm font-medium">Pengguna</span>
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{nonAdminList.length}</span>
                </TabsTrigger>
                <TabsTrigger value="calon" className="rounded-lg px-2 sm:px-4 py-2.5 gap-1 sm:gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-[#111] data-[state=active]:shadow-sm flex-1 justify-center whitespace-normal min-w-0 h-auto">
                  <span className="text-xs sm:text-sm font-medium leading-tight text-center"><span className="sm:hidden">Calon<br/>Pembeli</span><span className="hidden sm:inline">Calon Pembeli</span></span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{calonList.length}</span>
                </TabsTrigger>
                <TabsTrigger value="pembeli" className="rounded-lg px-2 sm:px-4 py-2.5 gap-1 sm:gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-[#111] data-[state=active]:shadow-sm flex-1 justify-center whitespace-normal min-w-0 h-auto">
                  <span className="text-xs sm:text-sm font-medium">Pembeli</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{groupedPembeliList.length}</span>
                </TabsTrigger>
              </TabsList>
          </div>

          {/* Tab: Daftar Admin */}
          <TabsContent value="admin" className="mt-0">
            <div className="p-4 lg:p-6 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-slate-500">Kelola akun admin aplikasi</p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari pengguna..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {canAddUser && (
                    <Button onClick={handleAddUser} className="whitespace-nowrap">
                      <Plus className="w-4 h-4 mr-2" />
                      Tambah User
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 lg:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-sm text-slate-500">Memuat data...</span>
                </div>
              ) : (
                <MobileTable
                  data={filteredUsers}
                  columns={userColumns}
                  keyField="id"
                  onEdit={canEditUser ? handleEditUser : undefined}
                  onDelete={canDeleteUser ? handleDeleteUser : undefined}
                  showAsButtons
                  emptyMessage="Tidak ada pengguna ditemukan"
                  emptyIcon={<Users className="w-12 h-12 mx-auto text-slate-400" />}
                />
              )}
            </div>
          </TabsContent>

          {/* Tab: Pengguna (non-admin accounts from checkout) */}
          <TabsContent value="pengguna" className="mt-0">
            <div className="p-4 lg:p-6 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-slate-500">Akun pengguna dari pendaftaran checkout (owner, user, demo)</p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari pengguna..."
                      value={allSearchTerm}
                      onChange={(e) => setAllSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 lg:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                  <span className="ml-3 text-sm text-slate-500">Memuat data...</span>
                </div>
              ) : (
                <MobileTable
                  data={filteredAllUsers}
                  columns={allUserColumns}
                  keyField="id"
                  onEdit={canEditUser ? handleEditUser : undefined}
                  onDelete={canDeleteUser ? handleDeleteUser : undefined}
                  showAsButtons
                  emptyMessage="Belum ada akun pengguna"
                  emptyIcon={<Users className="w-12 h-12 mx-auto text-slate-400" />}
                />
              )}
            </div>
          </TabsContent>

          {/* Tab: Calon Pembeli */}
          <TabsContent value="calon" className="mt-0">
            <div className="p-4 lg:p-6 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-slate-500">Data prospek dan calon pelanggan baru</p>
                {canAddCalon && (
                  <Button onClick={handleAddCalon} className="whitespace-nowrap">
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah Calon
                  </Button>
                )}
              </div>
            </div>
            <div className="p-4 lg:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                  <span className="ml-3 text-sm text-slate-500">Memuat data...</span>
                </div>
              ) : (
                <MobileTable
                  data={calonList}
                  columns={calonColumns}
                  keyField="id"
                  onEdit={canEditCalon ? handleEditCalon : undefined}
                  onDelete={canDeleteCalon ? handleDeleteCalon : undefined}
                  showAsButtons
                  emptyMessage="Belum ada calon pembeli"
                  emptyIcon={<UserPlus className="w-12 h-12 mx-auto text-slate-400" />}
                  extraActions={canConvertCalon ? (item: CalonPembeli) => (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleConvertToPembeli(item)
                      }}
                    >
                      <UserCheck className="w-3 h-3 mr-1" />
                      Konversi
                    </Button>
                  ) : undefined}
                />
              )}
            </div>
          </TabsContent>

          {/* Tab: Daftar Pembeli */}
          <TabsContent value="pembeli" className="mt-0">
            <div className="p-4 lg:p-6 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-slate-500">Data pelanggan yang sudah bertransaksi</p>
                {canAddPembeli && (
                  <Button onClick={handleAddPembeli} className="whitespace-nowrap">
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah Pembeli
                  </Button>
                )}
              </div>
            </div>
            <div className="p-4 lg:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                  <span className="ml-3 text-sm text-slate-500">Memuat data...</span>
                </div>
              ) : (
                <MobileTable
                  data={groupedPembeliList}
                  columns={pembeliColumns}
                  keyField="id"
                  onEdit={canEditPembeli ? handleEditPembeli : undefined}
                  onDelete={canDeletePembeli ? handleDeletePembeli : undefined}
                  showAsButtons
                  emptyMessage="Belum ada data pembeli"
                  emptyIcon={<ShoppingCart className="w-12 h-12 mx-auto text-slate-400" />}
                  extraActions={(item: GroupedPembeli) => {
                    if (item.usernames.length > 0) return undefined
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-violet-600 border-violet-300 hover:bg-violet-50 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenCreateAccount(item)
                        }}
                      >
                        <KeyRound className="w-3 h-3 mr-1" />
                        Buat Akun
                      </Button>
                    )
                  }}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===== DIALOG: TAMBAH/EDIT USER ===== */}
      <Dialog open={userDialogOpen} onOpenChange={(open) => { if (!open) resetUserForm(); setUserDialogOpen(open) }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Ubah data pengguna. Kosongkan password jika tidak ingin mengubah.' : 'Isi data pengguna baru.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveUser}>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-2">
                <Label htmlFor="u-namaLengkap">{t('nama_lengkap')}</Label>
                <Input id="u-namaLengkap" type="text" placeholder="Masukkan nama lengkap" required value={formNamaLengkap} onChange={(e) => setFormNamaLengkap(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="u-nomorHP">Nomor Handphone</Label>
                <Input id="u-nomorHP" type="tel" placeholder="081234567890" value={formNomorHP} onChange={(e) => setFormNomorHP(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" type="email" placeholder="email@contoh.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="u-username">Username</Label>
                <Input id="u-username" type="text" placeholder="Masukkan username" required value={formUsername} onChange={(e) => setFormUsername(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="u-password">Password {editingUser && <span className="text-xs text-slate-400 font-normal">(kosongkan jika tidak diubah)</span>}</Label>
                <div className="relative">
                  <Input id="u-password" type={showPassword ? 'text' : 'password'} placeholder={editingUser ? '••••••••' : 'Masukkan password'} required={!editingUser} value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={formRole} onValueChange={setFormRole} required>
                  <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role} className="capitalize">
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editingUser && (
                <div className="grid gap-2">
                  <Label htmlFor="u-validUntil">Berlaku s/d</Label>
                  <Input
                    id="u-validUntil"
                    type="date"
                    value={formValidUntil}
                    onChange={(e) => setFormValidUntil(e.target.value)}
                  />
                  <p className="text-xs text-slate-400">Kosongkan untuk tidak ada masa berlaku (tidak terbatas)</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { resetUserForm(); setUserDialogOpen(false) }}>{t('batal')}</Button>
              <Button type="submit" disabled={saving}>
                {saving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Menyimpan...</>) : (editingUser ? 'Simpan Perubahan' : 'Tambah Pengguna')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: TAMBAH/EDIT CALON PEMBELI ===== */}
      <Dialog open={calonDialogOpen} onOpenChange={(open) => { if (!open) resetCalonForm(); setCalonDialogOpen(open) }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingCalon ? 'Edit Calon Pembeli' : 'Tambah Calon Pembeli'}</DialogTitle>
            <DialogDescription>
              {editingCalon ? 'Ubah data calon pembeli.' : 'Tambah data prospek atau calon pelanggan baru.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCalon}>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-2">
                <Label htmlFor="c-nama">{t('nama_lengkap')}</Label>
                <Input id="c-nama" type="text" placeholder="Masukkan nama" required value={calonNama} onChange={(e) => setCalonNama(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-hp">Nomor Handphone</Label>
                <Input id="c-hp" type="tel" placeholder="081234567890" value={calonNomorHP} onChange={(e) => setCalonNomorHP(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" placeholder="email@contoh.com" value={calonEmail} onChange={(e) => setCalonEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-username">Username</Label>
                <Input id="c-username" type="text" placeholder="Masukkan username" value={calonUsername} onChange={(e) => setCalonUsername(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-alamat">Alamat</Label>
                <textarea
                  id="c-alamat"
                  placeholder="Masukkan alamat"
                  value={calonAlamat}
                  onChange={(e) => setCalonAlamat(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[60px] resize-none"
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={calonRole} onValueChange={setCalonRole} required>
                  <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={calonStatus} onValueChange={setCalonStatus} required>
                  <SelectTrigger><SelectValue placeholder="Pilih status" /></SelectTrigger>
                  <SelectContent>
                    {CALON_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-expiredDate">Expired Date</Label>
                <Input id="c-expiredDate" type="date" value={calonExpiredDate} onChange={(e) => setCalonExpiredDate(e.target.value)} />
                <p className="text-xs text-slate-400">Kosongkan untuk tidak ada masa kadaluarsa</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-catatan">Catatan</Label>
                <textarea
                  id="c-catatan"
                  placeholder="Catatan tambahan (opsional)"
                  value={calonCatatan}
                  onChange={(e) => setCalonCatatan(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[60px] resize-none"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { resetCalonForm(); setCalonDialogOpen(false) }}>{t('batal')}</Button>
              <Button type="submit" disabled={calonSaving}>
                {calonSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Menyimpan...</>) : (editingCalon ? 'Simpan Perubahan' : 'Tambah Calon Pembeli')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: TAMBAH/EDIT PEMBELI ===== */}
      <Dialog open={pembeliDialogOpen} onOpenChange={(open) => { if (!open) resetPembeliForm(); setPembeliDialogOpen(open) }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingPembeli ? 'Edit Pembeli' : 'Tambah Pembeli'}</DialogTitle>
            <DialogDescription>
              {editingPembeli ? 'Ubah data pembeli.' : 'Tambah data pelanggan baru.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePembeli}>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-2">
                <Label htmlFor="p-nama">{t('nama_lengkap')}</Label>
                <Input id="p-nama" type="text" placeholder="Masukkan nama" required value={pembeliNama} onChange={(e) => setPembeliNama(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-hp">Nomor Handphone</Label>
                <Input id="p-hp" type="tel" placeholder="081234567890" value={pembeliNomorHP} onChange={(e) => setPembeliNomorHP(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-email">Email</Label>
                <Input id="p-email" type="email" placeholder="email@contoh.com" value={pembeliEmail} onChange={(e) => setPembeliEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-username">Username</Label>
                <Input id="p-username" type="text" placeholder="Masukkan username" value={pembeliUsername} onChange={(e) => setPembeliUsername(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-alamat">Alamat</Label>
                <textarea
                  id="p-alamat"
                  placeholder="Masukkan alamat"
                  value={pembeliAlamat}
                  onChange={(e) => setPembeliAlamat(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[60px] resize-none"
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={pembeliRole} onValueChange={setPembeliRole} required>
                  <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-expiredDate">Expired Date</Label>
                <Input id="p-expiredDate" type="date" value={pembeliExpiredDate} onChange={(e) => setPembeliExpiredDate(e.target.value)} />
                <p className="text-xs text-slate-400">Kosongkan untuk tidak ada masa kadaluarsa</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-catatan">Catatan</Label>
                <textarea
                  id="p-catatan"
                  placeholder="Catatan tambahan (opsional)"
                  value={pembeliCatatan}
                  onChange={(e) => setPembeliCatatan(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[60px] resize-none"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { resetPembeliForm(); setPembeliDialogOpen(false) }}>{t('batal')}</Button>
              <Button type="submit" disabled={pembeliSaving}>
                {pembeliSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Menyimpan...</>) : (editingPembeli ? 'Simpan Perubahan' : 'Tambah Pembeli')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: BUAT AKUN LOGIN UNTUK PEMBELI ===== */}
      <Dialog open={createAccountOpen} onOpenChange={(open) => { if (!open) { setCreateAccountOpen(false); setCreateAccountPembeli(null) } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-violet-600" />
              Buat Akun Login
            </DialogTitle>
            <DialogDescription>
              {createAccountPembeli
                ? `Buat akun login untuk pembeli "${createAccountPembeli.nama}" (${createAccountPembeli.nomorHP}).`
                : 'Buat akun login untuk pembeli.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAccount}>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  Pembeli ini belum memiliki akun login. Buatkan username dan password agar bisa login ke aplikasi.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ca-username">Username <span className="text-red-500">*</span></Label>
                <Input
                  id="ca-username"
                  type="text"
                  placeholder="Minimal 3 karakter"
                  required
                  minLength={3}
                  value={caUsername}
                  onChange={(e) => setCaUsername(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ca-password">Password <span className="text-red-500">*</span></Label>
                <Input
                  id="ca-password"
                  type="text"
                  placeholder="Minimal 6 karakter"
                  required
                  minLength={6}
                  value={caPassword}
                  onChange={(e) => setCaPassword(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-slate-400">Password disimpan dalam bentuk teks. Pastikan password yang aman.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateAccountOpen(false); setCreateAccountPembeli(null) }}>{t('batal')}</Button>
              <Button type="submit" disabled={caSaving} className="bg-violet-600 hover:bg-violet-700">
                {caSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Menyimpan...</>) : 'Buat Akun'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}
