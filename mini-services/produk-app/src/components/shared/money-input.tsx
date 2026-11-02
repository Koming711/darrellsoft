'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { formatMoneyInput, parseMoneyInput } from '@/lib/money'

interface MoneyInputProps {
  /** nilai sebagai string desimal (mis. "4800.5"), null = kosong */
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  prefix?: string
  id?: string
  required?: boolean
  onBlur?: () => void
  'aria-label'?: string
}

/** Input mata uang Rupiah dengan pemisah ribuan otomatis. Menerima "5.000" maupun "4800.5". */
export function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder = '0',
  className,
  prefix = 'Rp',
  id,
  required,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const [text, setText] = React.useState<string>(() => formatMoneyInput(value))
  const focusedRef = React.useRef(false)

  // Sinkronkan dari luar bila input tidak sedang difokuskan
  React.useEffect(() => {
    if (!focusedRef.current) {
      setText(formatMoneyInput(value))
    }
  }, [value])

  const handleChange = (raw: string) => {
    // hanya angka, titik, koma
    const cleaned = raw.replace(/[^\d.,]/g, '')
    setText(cleaned)
    if (!cleaned.trim()) {
      onChange(null)
      return
    }
    const parsed = parseMoneyInput(cleaned)
    if (parsed === null) return // biarkan teks, nilai invalid tidak dikirim
    onChange(parsed)
  }

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
        {prefix}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        type="text"
        required={required}
        disabled={disabled}
        className="pl-10"
        placeholder={placeholder}
        value={text}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
          // normalisasi tampilan saat blur
          setText(value ? formatMoneyInput(value) : '')
          onBlur?.()
        }}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={rest['aria-label']}
      />
    </div>
  )
}
