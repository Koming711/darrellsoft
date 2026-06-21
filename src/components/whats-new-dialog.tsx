'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CURRENT_VERSION, CHANGELOG } from '@/lib/changelog'
import { useLanguage } from '@/contexts/language-context'

const T = {
  id: {
    sr_label: 'Informasi fitur terbaru Darrell Soft',
    new_version: 'Versi Baru!',
    got_it: 'Oke, Mengerti',
  },
  en: {
    sr_label: 'Darrell Soft latest feature info',
    new_version: 'New Version!',
    got_it: 'OK, Got It',
  },
} as const

export function WhatsNewDialog() {
  const { language } = useLanguage()
  const t = T[language]
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      const seenVersion = localStorage.getItem('whats_new_version')
      if (seenVersion !== CURRENT_VERSION) {
        // Show dialog for new version
        setOpen(true)
      }
    } catch {}
  }, [])

  const handleClose = () => {
    setOpen(false)
    try {
      localStorage.setItem('whats_new_version', CURRENT_VERSION)
    } catch {}
  }

  // Only show the latest entry (the one that triggered this update)
  const latestEntry = CHANGELOG[0]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-0 shadow-2xl">
        <DialogDescription className="sr-only">{t.sr_label}</DialogDescription>
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-teal-600 via-emerald-600 to-green-700 px-5 pt-5 pb-4">
          <button
            onClick={handleClose}
            className="absolute right-3 top-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{t.new_version}</h2>
              <p className="text-xs text-white/70 font-medium">{latestEntry.date[language]}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 bg-white">
          <h3 className="text-sm font-bold text-slate-800 mb-3">{latestEntry.title[language]}</h3>
          <ul className="space-y-2">
            {latestEntry.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                <ChevronRight className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>{item[language]}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 pt-2 bg-white border-t border-slate-100">
          <Button
            onClick={handleClose}
            className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-semibold"
          >
            {t.got_it}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
