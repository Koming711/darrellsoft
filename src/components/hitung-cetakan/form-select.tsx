'use client'

// ============================================================
// FormSelect — dropdown form dengan panel pilihan DALAM APLIKASI
// (popover bergaya desktop, tampilan & perilaku konsisten di
// mobile maupun desktop).
//
// Menggantikan <select> bawaan yang di HP membuka picker OS
// (tampilan berubah seperti layar desktop / ter-zoom setelah
// diklik di iPhone karena auto-zoom font < 16px).
//
// value '' dipetakan ke sentinel internal karena Radix Select
// melarang SelectItem dengan value kosong.
// ============================================================

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface FormSelectOption {
  value: string
  label: string
  disabled?: boolean
}

const NONE = '__none__'

interface FormSelectProps {
  /** Value terkontrol — '' berarti belum dipilih (tampilkan placeholder). */
  value: string
  onValueChange: (v: string) => void
  options: FormSelectOption[]
  /** Teks saat belum dipilih + item pertama di daftar ("Pilih …"). */
  placeholder: string
  className?: string
  id?: string
  ariaLabel?: string
  disabled?: boolean
}

export function FormSelect({ value, onValueChange, options, placeholder, className, id, ariaLabel, disabled }: FormSelectProps) {
  // Dedupe by value (occurrence pertama menang) — master data bisa memuat nama ganda
  // (mis. customer "testing" dibuat 2×) → key/value SelectItem duplikat memicu
  // React warning "Encountered two children with the same key".
  const uniqueOptions = options.filter((o, i) => options.findIndex((x) => x.value === o.value) === i)
  return (
    <Select
      value={value ? value : NONE}
      onValueChange={(v) => onValueChange(v === NONE ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'w-full h-[38px] rounded-lg border border-slate-300 bg-card px-3 text-sm text-slate-800',
          'cursor-pointer focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        <SelectItem value={NONE} className="text-muted-foreground">{placeholder}</SelectItem>
        {uniqueOptions.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
