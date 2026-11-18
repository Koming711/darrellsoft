'use client'

/**
 * ServerStatusCard (Task 34 — Always-On 24/7).
 *
 * Menampilkan kondisi ketersediaan aplikasi langsung di panel admin:
 * - Status ONLINE/OFFLINE + latensi respons /api/health (endpoint ringan,
 *   TIDAK menjalankan query database — tidak membakar kuota Supabase).
 * - Uptime instance server + region hosting.
 * - Riwayat gangguan (ServerIncident): waktu turun, waktu pulih, durasi,
 *   penyebab/status dari monitor eksternal — dapat dihapus admin.
 *
 * Hemat kuota: pembaruan otomatis 60 detik HANYA saat tab terlihat dan
 * hanya memanggil /api/health (tanpa DB) + /api/monitor-events saat kartu
 * dimuat / setelah periksa manual (bukan polling beruntun).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Globe,
  RefreshCcw,
  Timer,
  Trash2,
} from 'lucide-react'

interface HealthInfo {
  status?: string
  timestamp?: string
  bootedAt?: string
  uptimeSec?: number
  instanceId?: string
  region?: string
}

interface Incident {
  id: string
  startedAt: string
  recoveredAt: string | null
  source: string
  detail: string
}

const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '-'

const fmtDuration = (fromIso: string, toIso: string | null | undefined) => {
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  const mins = Math.max(1, Math.round((to - from) / 60_000))
  if (mins < 60) return `${mins} menit`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return m ? `${h} jam ${m} menit` : `${h} jam`
  return `${Math.floor(h / 24)} hari ${h % 24} jam`
}

const fmtUptime = (sec: number | undefined) => {
  if (!sec && sec !== 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h} jam ${m} menit`
  if (m > 0) return `${m} menit ${sec % 60} detik`
  return `${sec} detik`
}

export function ServerStatusCard() {
  const [checking, setChecking] = useState(false)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [openIncident, setOpenIncident] = useState<Incident | null>(null)
  const incidentsLoaded = useRef(false)

  const loadIncidents = useCallback(async () => {
    try {
      const res = await authFetch('/api/monitor-events')
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setIncidents(Array.isArray(json.incidents) ? json.incidents : [])
        setOpenIncident(json.open || null)
      }
    } catch {
      // Riwayat gagal dimuat → kartu status tetap hidup.
    }
  }, [])

  const runCheck = useCallback(async () => {
    setChecking(true)
    try {
      const t0 = performance.now()
      const res = await fetch('/api/health', { cache: 'no-store' })
      const ms = Math.round(performance.now() - t0)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as HealthInfo
      setHealth(json)
      setLatencyMs(ms)
      setError('')
      setLastChecked(new Date())
      if (incidentsLoaded.current) void loadIncidents()
    } catch (e) {
      setHealth(null)
      setLatencyMs(null)
      setError(e instanceof Error ? e.message : 'Tidak dapat menghubungi server')
      setLastChecked(new Date())
    } finally {
      setChecking(false)
    }
  }, [loadIncidents])

  useEffect(() => {
    void runCheck()
    incidentsLoaded.current = true
    void loadIncidents()

    // Pembaruan otomatis 60 detik — hanya saat tab TERLIHAT (hemat & tanpa DB).
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') void runCheck()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runCheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const removeIncident = async (id: string) => {
    try {
      const res = await authFetch(`/api/monitor-events?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Catatan gangguan dihapus.')
      void loadIncidents()
    } catch {
      toast.error('Gagal menghapus catatan gangguan.')
    }
  }

  const online = !error && health?.status === 'ok'
  const latencyTone = latencyMs == null
    ? 'text-muted-foreground'
    : latencyMs < 800
      ? 'text-emerald-600 dark:text-emerald-400'
      : latencyMs < 2000
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <section
      aria-label="Status server"
      className="rounded-xl border bg-card overflow-hidden"
    >
      {/* Baris status utama */}
      <div className="p-4 flex flex-wrap items-center gap-3 border-b">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            online
              ? 'bg-emerald-100 dark:bg-emerald-900/40'
              : checking && !health && !error
                ? 'bg-slate-100 dark:bg-slate-800'
                : 'bg-red-100 dark:bg-red-900/40'
          }`}
          aria-hidden="true"
        >
          {online ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : checking && !health && !error ? (
            <Activity className="h-5 w-5 text-slate-500 animate-pulse" />
          ) : (
            <CloudOff className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">Status Server</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                online
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : checking && !health && !error
                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              }`}
              role="status"
              aria-live="polite"
            >
              {online ? 'Online — siap 24/7' : checking && !health && !error ? 'Memeriksa…' : 'Tidak dapat dihubungi'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastChecked
              ? `Diperiksa ${lastChecked.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · pembaruan otomatis 60 detik (tanpa query database)`
              : 'Memeriksa ketersediaan aplikasi…'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => void runCheck()}
          disabled={checking}
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
          Periksa Sekarang
        </Button>
      </div>

      {/* Detail instance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x border-b text-sm">
        <div className="p-4 flex items-center gap-3">
          <Timer className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Respons server</p>
            <p className={`font-medium mt-0.5 ${latencyTone}`} aria-label={`Latensi ${latencyMs ?? 'tidak tersedia'} milidetik`}>
              {checking && latencyMs == null ? <Skeleton className="h-4 w-16" /> : latencyMs != null ? `${latencyMs} ms` : '-'}
            </p>
          </div>
        </div>
        <div className="p-4 flex items-center gap-3">
          <Activity className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Uptime instance</p>
            <p className="font-medium mt-0.5 truncate" title={health?.bootedAt}>
              {health ? fmtUptime(health.uptimeSec) : '-'}
            </p>
          </div>
        </div>
        <div className="p-4 flex items-center gap-3">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Region hosting</p>
            <p className="font-medium mt-0.5 truncate">
              {health?.region
                ? health.region === 'sin1'
                  ? `${health.region} (Singapore)`
                  : health.region
                : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Gangguan aktif */}
      {openIncident && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border-b flex items-start gap-3" role="alert">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              Gangguan berlangsung sejak {fmtDateTime(openIncident.startedAt)} ({fmtDuration(openIncident.startedAt, null)})
            </p>
            {openIncident.detail && (
              <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5">{openIncident.detail}</p>
            )}
          </div>
        </div>
      )}

      {/* Riwayat gangguan */}
      <div className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Riwayat Gangguan ({incidents.length})
        </p>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">
            Belum ada gangguan tercatat. Server dipantau otomatis oleh monitor eksternal — catatan hanya dibuat saat status berubah (tanpa membebani database).
          </p>
        ) : (
          <ul className="mt-2 max-h-48 overflow-y-auto space-y-2" aria-label="Daftar riwayat gangguan server">
            {incidents.map((inc) => (
              <li
                key={inc.id}
                className="rounded-lg border px-3 py-2 flex items-start gap-2 text-sm"
              >
                <AlertTriangle
                  className={`h-4 w-4 mt-0.5 shrink-0 ${inc.recoveredAt ? 'text-amber-500' : 'text-red-600'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">
                    {inc.recoveredAt ? 'Pulih' : 'Berlangsung'} · {fmtDateTime(inc.startedAt)}
                    {inc.recoveredAt ? ` → ${fmtDateTime(inc.recoveredAt)}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Durasi {fmtDuration(inc.startedAt, inc.recoveredAt)}
                    {inc.detail ? ` · ${inc.detail}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                  onClick={() => void removeIncident(inc.id)}
                  aria-label={`Hapus catatan gangguan ${fmtDateTime(inc.startedAt)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
