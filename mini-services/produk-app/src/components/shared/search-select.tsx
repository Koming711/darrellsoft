'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface SearchSelectOption {
  value: string
  label: string
  description?: string
  /** kata kunci tambahan untuk pencarian (mis. kode barang) */
  keywords?: string[]
}

interface SearchSelectProps {
  value: string | null
  onChange: (value: string | null) => void
  options: SearchSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  allowClear?: boolean
  id?: string
}

/** Dropdown dengan pencarian — dipakai untuk memilih customer/produk dari master data. */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Cari...',
  emptyText = 'Tidak ada data',
  disabled = false,
  className,
  triggerClassName,
  allowClear = false,
  id,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-10', !selected && 'text-muted-foreground', triggerClassName)}
        >
          <span className="truncate text-left">
            {selected ? (
              <span className="flex flex-col items-start leading-tight">
                <span className="truncate">{selected.label}</span>
                {selected.description && (
                  <span className="text-xs text-muted-foreground truncate max-w-full">{selected.description}</span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-0 w-[min(22rem,var(--radix-popover-trigger-width))]', className)} align="start">
        <Command
          filter={(itemValue, search) => {
            const v = search.toLowerCase()
            if (!v) return 1
            const hay = itemValue.toLowerCase()
            return hay.includes(v) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-64">
            <CommandEmpty className="flex items-center gap-2 justify-center py-6 text-sm text-muted-foreground">
              <SearchX className="h-4 w-4" /> {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const hay = [option.label, option.description ?? '', ...(option.keywords ?? [])].join(' ').toLowerCase()
                return (
                  <CommandItem
                    key={option.value}
                    value={hay}
                    onSelect={() => {
                      onChange(option.value === value && allowClear ? null : option.value)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <Check className={cn('h-4 w-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="flex flex-col">
                      <span>{option.label}</span>
                      {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
