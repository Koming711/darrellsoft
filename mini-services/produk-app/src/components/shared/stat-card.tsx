'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  tone = 'default',
  className,
}: {
  title: string
  value: React.ReactNode
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'emerald' | 'amber' | 'teal'
  className?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-zinc-100 text-zinc-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    teal: 'bg-teal-100 text-teal-700',
  }
  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="p-4 sm:p-5 flex items-start gap-3 sm:gap-4">
        <div className={cn('rounded-lg p-2.5 shrink-0', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-lg sm:text-xl font-semibold tracking-tight truncate" title={typeof value === 'string' ? value : undefined}>
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
