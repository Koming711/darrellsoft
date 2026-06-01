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
import { Loader2 } from "lucide-react"
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
}

export function DialogForm({ open, onOpenChange, title, description, fields, initialData, onSave }: DialogFormProps) {
  const [formData, setFormData] = useState<Record<string, string | number>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const contentRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()

  useEffect(() => {
    requestAnimationFrame(() => {
      if (initialData) {
        setFormData(initialData)
      } else {
        setFormData({})
        setPosition({ x: 0, y: 0 })
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && contentRef.current?.contains(e.target)) {
      const inputElements = contentRef.current.querySelectorAll('input, button, select, textarea')
      const isInput = Array.from(inputElements).some(el => el.contains(e.target as Node))
      
      if (!isInput) {
        setIsDragging(true)
        setDragOffset({
          x: e.clientX - position.x,
          y: e.clientY - position.y
        })
      }
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        ref={contentRef}
        className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        onMouseDown={handleMouseDown}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
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
                  onMouseDown={(e) => e.stopPropagation()}
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
