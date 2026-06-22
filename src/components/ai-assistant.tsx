'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Trash2, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AIAssistantProps {
  /** Bottom offset in px, to clear the mobile bottom nav when needed. Default: 80 (mobile) / 24 (desktop). */
  bottomOffset?: number
}

// Simple id generator (avoid crypto for SSR safety)
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// Very small markdown-ish renderer: supports **bold**, line breaks, and bullet lists
function renderContent(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.trim() === '') return <div key={i} className="h-2" />
    // bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    const rendered = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
      }
      return <span key={j}>{part}</span>
    })
    return <div key={i} className="leading-relaxed">{rendered}</div>
  })
}

export function AIAssistant({ bottomOffset }: AIAssistantProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fetchedWelcomeRef = useRef(false)

  // Load persisted conversation from sessionStorage
  useEffect(() => {
    if (fetchedWelcomeRef.current) return
    fetchedWelcomeRef.current = true
    try {
      const saved = sessionStorage.getItem('ai_assistant_messages')
      if (saved) {
        const parsed = JSON.parse(saved) as Message[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          return
        }
      }
    } catch {}
    // Initial welcome message
    setMessages([
      { id: genId(), role: 'assistant', content: t('ai_assistant_welcome') },
    ])
  }, [t])

  // Persist messages to sessionStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem('ai_assistant_messages', JSON.stringify(messages))
      } catch {}
    }
  }, [messages])

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const suggestions = [
    t('ai_assistant_suggestion_1'),
    t('ai_assistant_suggestion_2'),
    t('ai_assistant_suggestion_3'),
    t('ai_assistant_suggestion_4'),
    t('ai_assistant_suggestion_5'),
  ]

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { id: genId(), role: 'user', content: trimmed }
    const history = messages
      .filter((m) => !(m.role === 'assistant' && m.id === messages[0]?.id)) // exclude welcome if it's first
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('ai_assistant_error'))
      }
      const aiMsg: Message = { id: genId(), role: 'assistant', content: data.response }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('ai_assistant_error')
      toast.error(errorMsg)
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: 'assistant', content: t('ai_assistant_error') },
      ])
    } finally {
      setLoading(false)
    }
  }, [loading, messages, t])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleClear = () => {
    setMessages([{ id: genId(), role: 'assistant', content: t('ai_assistant_welcome') }])
    try {
      sessionStorage.removeItem('ai_assistant_messages')
    } catch {}
  }

  // Compute bottom position: clear mobile bottom nav (~64px) on small screens
  const fabBottom = bottomOffset ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 84 : 24)

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed z-[60] right-4 md:right-6"
            style={{ bottom: fabBottom }}
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpen(true)}
                    aria-label={t('ai_assistant_title')}
                    className="group relative flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:shadow-blue-600/40 transition-all duration-300 hover:scale-105 active:scale-95"
                  >
                    {/* Pulse ring */}
                    <span className="absolute inset-0 rounded-full bg-blue-500/40 animate-ping [animation-duration:2s]" />
                    <Sparkles className="relative w-6 h-6 md:w-7 md:h-7" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="mr-2">
                  <p className="text-xs font-medium">{t('ai_assistant_title')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm md:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="fixed z-[70] flex flex-col bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden
                inset-2 bottom-2 top-auto h-[85vh] max-h-[640px]
                md:inset-auto md:bottom-6 md:right-6 md:w-[400px] md:h-[600px] md:max-h-[75vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-sky-500 text-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/20 shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm truncate">{t('ai_assistant_title')}</h3>
                    <p className="text-[11px] text-white/80 truncate flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      {t('ai_assistant_subtitle')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleClear}
                          aria-label={t('ai_assistant_clear')}
                          className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">{t('ai_assistant_clear')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label={t('ai_assistant_close')}
                    className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Messages area */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-slate-50 dark:bg-slate-950/50
                  [scrollbar-width:thin] [scrollbar-color:rgb(148_163_184_0.5)_transparent]
                  [&::-webkit-scrollbar]:w-1.5
                  [&::-webkit-scrollbar-thumb]:rounded-full
                  [&::-webkit-scrollbar-thumb]:bg-slate-300/70
                  dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div
                      className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                        msg.role === 'user'
                          ? 'bg-slate-200 dark:bg-slate-700'
                          : 'bg-gradient-to-br from-blue-600 to-sky-400 text-white'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div
                      className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13px] ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-md'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-md shadow-sm'
                      }`}
                    >
                      <div className="space-y-1">{renderContent(msg.content)}</div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-2.5 flex-row">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-blue-600 to-sky-400 text-white">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggestion chips - only show when few messages */}
                {messages.length <= 1 && !loading && (
                  <div className="pt-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 px-1">
                      Saran pertanyaan:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="px-3 py-1.5 text-[12px] rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Input area */}
              <form
                onSubmit={handleSubmit}
                className="shrink-0 px-3 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(input)
                      }
                    }}
                    placeholder={t('ai_assistant_placeholder')}
                    disabled={loading}
                    rows={1}
                    maxLength={1000}
                    className="flex-1 resize-none min-h-[40px] max-h-[120px] text-[13px] bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500/30 rounded-xl"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={loading || !input.trim()}
                    aria-label={t('ai_assistant_send')}
                    className="shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 h-10 w-10"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 text-center">
                  Darrellsoft AI · {input.length}/1000
                </p>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
