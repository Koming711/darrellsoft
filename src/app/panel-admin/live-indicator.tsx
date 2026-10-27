'use client'

// Indikator "Live" panel admin: titik hijau berdenyut + waktu sinkron terakhir.
// Dipasang di header halaman panel admin yang datanya dimuat ulang otomatis.

const fmtTime = (d: Date) =>
  d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function LiveIndicator({
  lastUpdated,
  className = '',
}: {
  lastUpdated: Date | null
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground ${className}`}
      title="Data diperbarui otomatis tanpa perlu memuat ulang halaman"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live
      {lastUpdated && (
        <span className="hidden font-normal sm:inline">· {fmtTime(lastUpdated)}</span>
      )}
    </span>
  )
}
