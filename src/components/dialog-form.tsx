'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState, useEffect, useRef } from "react"
import { Loader2, Contact as ContactIcon, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from '@/contexts/language-context'

interface DialogFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  fields: {
    name: string
    label: string
    type: 'text' | 'number' | 'email' | 'tel'
    placeholder?: string
    required?: boolean
  }[]
  initialData?: Record<string, string | number>
  onSave: (data: Record<string, string | number>) => void | Promise<void>
  /**
   * Optional: enable "Pick from Contacts" button (mobile only).
   * Maps contact properties to form field names so selecting a contact
   * auto-fills the corresponding inputs.
   */
  contactPicker?: {
    nameField?: string   // form field to fill with contact.name[0]
    telField?: string    // form field to fill with contact.tel[0]
    emailField?: string  // form field to fill with contact.email[0]
  }
}

export function DialogForm({ open, onOpenChange, title, description, fields, initialData, onSave, contactPicker }: DialogFormProps) {
  const [formData, setFormData] = useState<Record<string, string | number>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isPickingContact, setIsPickingContact] = useState(false)
  const [contactPickerSupported, setContactPickerSupported] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()

  // Detect Contact Picker API support (mobile-only: Android Chrome, Safari iOS 14.5+)
  useEffect(() => {
    if (contactPicker && typeof navigator !== 'undefined' && 'contacts' in navigator && typeof navigator.contacts?.select === 'function') {
      setContactPickerSupported(true)
    } else {
      setContactPickerSupported(false)
    }
  }, [contactPicker])

  const handlePickContact = async () => {
    if (!navigator.contacts?.select) {
      toast.error(t('contact_picker_unsupported'))
      return
    }
    setIsPickingContact(true)
    try {
      const props: ('name' | 'tel' | 'email')[] = []
      if (contactPicker?.nameField) props.push('name')
      if (contactPicker?.telField) props.push('tel')
      if (contactPicker?.emailField) props.push('email')

      if (props.length === 0) {
        toast.error(t('contact_picker_error'))
        return
      }

      const contacts = await navigator.contacts.select(props, { multiple: false })

      if (!contacts || contacts.length === 0) {
        toast.info(t('contact_picker_cancelled'))
        return
      }

      const contact = contacts[0]
      const updates: Record<string, string | number> = { ...formData }

      if (contactPicker?.nameField && contact.name && contact.name.length > 0) {
        updates[contactPicker.nameField] = contact.name[0]
      }
      if (contactPicker?.telField && contact.tel && contact.tel.length > 0) {
        updates[contactPicker.telField] = contact.tel[0]
      }
      if (contactPicker?.emailField && contact.email && contact.email.length > 0) {
        updates[contactPicker.emailField] = contact.email[0]
      }

      setFormData(updates)
      toast.success(t('contact_picker_success'))
    } catch (err) {
      // User cancellation may throw - handle gracefully
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
        toast.info(t('contact_picker_cancelled'))
      } else {
        console.error('[ContactPicker] Error:', err)
        toast.error(t('contact_picker_error'))
      }
    } finally {
      setIsPickingContact(false)
    }
  }

  useEffect(() => {
    requestAnimationFrame(() => {
      if (initialData) {
        setFormData(initialData)
      } else {
        setFormData({})
      }
    })
  }, [initialData, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return // Prevent double-click
    setIsSaving(true)
    try {
      await onSave(formData)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {/* Contact Picker button - mobile only, shown when supported & enabled */}
          {contactPicker && contactPickerSupported && (
            <div className="mb-4 -mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handlePickContact}
                disabled={isSaving || isPickingContact}
                className="w-full border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
                {isPickingContact ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('contact_picker_button')}...</>
                ) : (
                  <><ContactIcon className="w-4 h-4 mr-2" />{t('contact_picker_button')}</>
                )}
              </Button>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 justify-center">
                <Smartphone className="w-3 h-3" />{t('contact_picker_hint')}
              </p>
            </div>
          )}
          <div className="grid gap-4 py-4">
            {fields.map((field) => (
              <div key={field.name} className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor={field.name} className="sm:text-right">
                  {field.label}
                </Label>
                <Input
                  id={field.name}
                  type={field.type}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={formData[field.name] || ''}
                  onChange={(e) => setFormData({ ...formData, [field.name]: field.type === 'number' ? parseFloat(e.target.value) || '' : e.target.value })}
                  className="sm:col-span-3 cursor-text"
                  disabled={isSaving}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('batal')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : t('simpan')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
