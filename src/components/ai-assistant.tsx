'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import { Sparkles, X, Send, Trash2, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AIAssistantProps {
  /** Bottom offset in px, to clear the mobile bottom nav when needed. Default: 84 (mobile) / 24 (desktop). */
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

interface DragState {
  pointerId: number
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
  moved: boolean
  defaultLeft: number
  defaultTop: number
  buttonSize: number
}

const FAB_STORAGE_KEY = 'ai_fab_offset'
// Pointer must move MORE than this (net displacement) to count as a drag, not a tap.
// Higher threshold for touch because fingers naturally jitter more than a mouse.
const DRAG_THRESHOLD_MOUSE = 6
const DRAG_THRESHOLD_TOUCH = 14
const VIEWPORT_MARGIN = 8 // px — keep button at least this far from viewport edges

function dragThresholdFor(pointerType: string) {
  return pointerType === 'mouse' ? DRAG_THRESHOLD_MOUSE : DRAG_THRESHOLD_TOUCH
}

export function AIAssistant({ bottomOffset }: AIAssistantProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [showQuestionPopup, setShowQuestionPopup] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false) // waiting for first token / request in flight
  const [streaming, setStreaming] = useState(false) // actively receiving tokens
  const [messages, setMessages] = useState<Message[]>([])
  const streamingMsgIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fetchedWelcomeRef = useRef(false)

  // FAB bottom offset — hydration-safe.
  // Stable initial value (24) matches SSR + initial client render.
  // Updated AFTER mount to clear mobile bottom nav (84) on small screens.
  const [fabBottom, setFabBottom] = useState<number>(24)
  const [isDragging, setIsDragging] = useState(false)

  // Drag offset via Framer Motion motion values — hydration-safe.
  // Start at 0 on both server & client; updated client-only after mount / during drag.
  // Framer Motion composes `x`/`y` with `scale` (from animate) into a single transform — no conflict.
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)

  const dragRef = useRef<DragState | null>(null)
  const wasDragRef = useRef(false)
  const fabRef = useRef<HTMLDivElement>(null)

  // After mount: set mobile/desktop offset + restore saved drag position (clamped to viewport)
  useEffect(() => {
    if (bottomOffset !== undefined) {
      setFabBottom(bottomOffset)
    } else {
      setFabBottom(window.innerWidth < 768 ? 84 : 24)
    }
    try {
      const saved = localStorage.getItem(FAB_STORAGE_KEY)
      if (saved) {
        const offset = JSON.parse(saved)
        if (typeof offset.x === 'number' && typeof offset.y === 'number') {
          // Clamp saved position so the FAB is always reachable.
          // Default position is right-4 (16px) + bottom fabBottom, button is ~56-64px.
          const btnSize = window.innerWidth < 768 ? 56 : 64
          const defaultLeft = window.innerWidth - 16 - btnSize
          const defaultTop = window.innerHeight - (window.innerWidth < 768 ? 84 : 24) - btnSize
          const minX = VIEWPORT_MARGIN - defaultLeft
          const maxX = window.innerWidth - defaultLeft - btnSize - VIEWPORT_MARGIN
          const minY = VIEWPORT_MARGIN - defaultTop
          const maxY = window.innerHeight - defaultTop - btnSize - VIEWPORT_MARGIN
          const clampedX = Math.min(Math.max(offset.x, minX), maxX)
          const clampedY = Math.min(Math.max(offset.y, minY), maxY)
          dragX.set(clampedX)
          dragY.set(clampedY)
          // If the saved position was out of bounds, persist the clamped version.
          if (clampedX !== offset.x || clampedY !== offset.y) {
            try {
              localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ x: clampedX, y: clampedY }))
            } catch {}
          }
        }
      }
    } catch {}
  }, [bottomOffset, dragX, dragY])

  // Re-clamp position on viewport resize (saved position might now be out of bounds)
  useEffect(() => {
    const handleResize = () => {
      const el = fabRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const currentX = dragX.get()
      const currentY = dragY.get()
      const defaultLeft = rect.left - currentX
      const defaultTop = rect.top - currentY
      const buttonSize = rect.width
      const minX = VIEWPORT_MARGIN - defaultLeft
      const maxX = window.innerWidth - defaultLeft - buttonSize - VIEWPORT_MARGIN
      const minY = VIEWPORT_MARGIN - defaultTop
      const maxY = window.innerHeight - defaultTop - buttonSize - VIEWPORT_MARGIN
      dragX.set(Math.min(Math.max(currentX, minX), maxX))
      dragY.set(Math.min(Math.max(currentY, minY), maxY))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [dragX, dragY])

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
    if (!open && !showQuestionPopup) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (open) setOpen(false)
        else if (showQuestionPopup) setShowQuestionPopup(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, showQuestionPopup])

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

    // Insert user message + an empty assistant placeholder that we'll fill as tokens stream in.
    const aiMsgId = genId()
    streamingMsgIdRef.current = aiMsgId
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: aiMsgId, role: 'assistant', content: '' },
    ])
    setInput('')
    setLoading(true)
    setStreaming(false)

    // Safety: if no first token arrives within 25s, show a gentle nudge (but keep waiting).
    let firstTokenTimer: ReturnType<typeof setTimeout> | null = null
    let firstTokenReceived = false

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: trimmed, history }),
      })

      // Non-streaming error response (JSON)
      const contentType = res.headers.get('content-type') || ''
      if (!res.ok || !contentType.includes('text/event-stream')) {
        let errMsg = t('ai_assistant_error')
        try {
          const data = await res.json()
          if (data?.error) errMsg = data.error
        } catch {}
        throw new Error(errMsg)
      }

      if (!res.body) {
        throw new Error(t('ai_assistant_error'))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      let backendError: string | null = null

      const flushEvents = (eventsChunk: string) => {
        const events = eventsChunk.split('\n\n')
        const leftover = events.pop() || ''
        for (const evt of events) {
          const trimmedEvt = evt.trim()
          if (!trimmedEvt) continue
          for (const line of trimmedEvt.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            if (payload === '[DONE]') return 'done' as const
            // Try JSON parse first; if it fails, treat payload as raw text delta
            let json: any = null
            try {
              json = JSON.parse(payload)
            } catch {
              // Plain-text delta (not JSON) — stream as raw text
              if (payload.length > 0) {
                if (!firstTokenReceived) {
                  firstTokenReceived = true
                  setStreaming(true)
                  setLoading(false)
                  if (firstTokenTimer) {
                    clearTimeout(firstTokenTimer)
                    firstTokenTimer = null
                  }
                }
                accumulated += payload
                const snapshot = accumulated
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMsgId ? { ...m, content: snapshot } : m))
                )
              }
              continue
            }
            // Backend sent an error event — capture it (don't throw inside try/catch)
            if (json?.error) {
              backendError = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
              return 'error' as const
            }
            const delta: string | undefined =
              json?.delta ??
              json?.choices?.[0]?.delta?.content ??
              json?.choices?.[0]?.message?.content ??
              json?.content
            if (typeof delta === 'string' && delta.length > 0) {
              if (!firstTokenReceived) {
                firstTokenReceived = true
                setStreaming(true)
                setLoading(false)
                if (firstTokenTimer) {
                  clearTimeout(firstTokenTimer)
                  firstTokenTimer = null
                }
              }
              accumulated += delta
              const snapshot = accumulated
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, content: snapshot } : m))
              )
            }
          }
        }
        return leftover
      }

      firstTokenTimer = setTimeout(() => {
        if (!firstTokenReceived && streamingMsgIdRef.current === aiMsgId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: 'Sedang berpikir… mohon tunggu sebentar.' }
                : m
            )
          )
        }
      }, 25000)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const result = flushEvents(buffer)
        if (result === 'done' || result === 'error') {
          buffer = ''
          break
        }
        buffer = result
      }
      // Flush trailing
      if (buffer.trim() && backendError === null) {
        flushEvents(buffer + '\n\n')
      }

      // Surface backend error to the user
      if (backendError) {
        throw new Error(backendError)
      }

      if (!firstTokenReceived) {
        // No tokens ever arrived — replace placeholder with an error message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: t('ai_assistant_error') }
              : m
          )
        )
        toast.error(t('ai_assistant_error'))
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('ai_assistant_error')
      toast.error(errorMsg)
      setMessages((prev) => {
        // If the placeholder is still empty, replace it; otherwise append a new error msg.
        const placeholder = prev.find((m) => m.id === aiMsgId)
        if (placeholder && placeholder.content === '') {
          return prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: errorMsg } : m
          )
        }
        return [...prev, { id: genId(), role: 'assistant', content: errorMsg }]
      })
    } finally {
      if (firstTokenTimer) clearTimeout(firstTokenTimer)
      streamingMsgIdRef.current = null
      setLoading(false)
      setStreaming(false)
    }
  }, [loading, messages, t])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleClear = () => {
    streamingMsgIdRef.current = null
    setLoading(false)
    setStreaming(false)
    setMessages([{ id: genId(), role: 'assistant', content: t('ai_assistant_welcome') }])
    try {
      sessionStorage.removeItem('ai_assistant_messages')
    } catch {}
  }

  // -------------------- Drag handlers --------------------

  const handlePointerDown = (e: React.PointerEvent) => {
    const el = fabRef.current
    if (!el) return
    // Only respond to primary mouse button; touch & pen always start drag
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rect = el.getBoundingClientRect()
    const currentX = dragX.get()
    const currentY = dragY.get()
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: currentX,
      startOffsetY: currentY,
      moved: false,
      defaultLeft: rect.left - currentX,
      defaultTop: rect.top - currentY,
      buttonSize: rect.width,
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const ds = dragRef.current
    if (!ds || ds.pointerId !== e.pointerId) return
    const dx = e.clientX - ds.startClientX
    const dy = e.clientY - ds.startClientY
    const threshold = dragThresholdFor(e.pointerType)
    if (!ds.moved && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
      ds.moved = true
      setIsDragging(true)
    }
    if (!ds.moved) return
    const minX = VIEWPORT_MARGIN - ds.defaultLeft
    const maxX = window.innerWidth - ds.defaultLeft - ds.buttonSize - VIEWPORT_MARGIN
    const minY = VIEWPORT_MARGIN - ds.defaultTop
    const maxY = window.innerHeight - ds.defaultTop - ds.buttonSize - VIEWPORT_MARGIN
    const newX = Math.min(Math.max(ds.startOffsetX + dx, minX), maxX)
    const newY = Math.min(Math.max(ds.startOffsetY + dy, minY), maxY)
    dragX.set(newX)
    dragY.set(newY)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const ds = dragRef.current
    if (!ds) return
    // Compute NET displacement from pointerdown to pointerup.
    // Only treat as drag if the pointer moved beyond the threshold overall —
    // intermediate jitter that returned close to the start position is still a tap.
    const netDx = Math.abs(e.clientX - ds.startClientX)
    const netDy = Math.abs(e.clientY - ds.startClientY)
    const threshold = dragThresholdFor(e.pointerType)
    const wasRealDrag = ds.moved && (netDx > threshold || netDy > threshold)
    wasDragRef.current = wasRealDrag
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(ds.pointerId)
    } catch {}
    if (ds.moved) {
      setIsDragging(false)
      if (wasRealDrag) {
        try {
          localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ x: dragX.get(), y: dragY.get() }))
        } catch {}
      }
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    // If the last pointer interaction was a real drag (not a tap), don't open the chat.
    if (wasDragRef.current) {
      wasDragRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    setShowQuestionPopup(true)
  }

  // Handle a question being picked from the popup.
  // Opens the chat panel and auto-sends the selected question.
  const handlePickQuestion = (question: string) => {
    setShowQuestionPopup(false)
    setOpen(true)
    // Defer sendMessage so the chat panel mounts before we start streaming.
    setTimeout(() => {
      sendMessage(question)
    }, 50)
  }

  // Handle "type your own question" — opens the chat panel and focuses the input.
  const handleCustomQuestion = () => {
    setShowQuestionPopup(false)
    setOpen(true)
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 100)
  }

  // Reset position (double-click / context menu action)
  const handleDoubleClick = () => {
    dragX.set(0)
    dragY.set(0)
    try {
      localStorage.removeItem(FAB_STORAGE_KEY)
    } catch {}
    toast.success('Posisi icon AI direset')
  }

  return (
    <>
      {/* Floating Action Button (FAB) — draggable */}
      <AnimatePresence>
        {!open && (
          <motion.div
            ref={fabRef}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed z-[9999] right-4 md:right-6 touch-none select-none"
            style={{
              bottom: fabBottom,
              x: dragX,
              y: dragY,
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleClick}
                    aria-label={t('ai_assistant_title')}
                    className={`group relative flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-blue-600 to-sky-400 hover:from-blue-700 hover:to-sky-500 text-white shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:shadow-blue-600/40 transition-all duration-300 hover:scale-105 active:scale-95 ${
                      isDragging ? 'ring-4 ring-blue-400/50 scale-105 shadow-2xl' : ''
                    }`}
                  >
                    {/* Pulse ring */}
                    <span className="absolute inset-0 rounded-full bg-blue-500/40 animate-ping [animation-duration:2s]" />
                    <Sparkles className="relative w-6 h-6 md:w-7 md:h-7" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="mr-2">
                  <p className="text-xs font-medium">{t('ai_assistant_title')}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Geser untuk memindahkan · Double-klik untuk reset</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question Popup — shown when the FAB is clicked, before opening the chat */}
      <AnimatePresence>
        {showQuestionPopup && !open && (
          <>
            {/* Backdrop — click outside to dismiss */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQuestionPopup(false)}
              className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              className="fixed z-[10001] flex flex-col bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden
                inset-x-3 bottom-3 top-auto max-h-[80vh]
                md:inset-auto md:bottom-24 md:right-6 md:w-[380px] md:max-h-[70vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-sky-500 text-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/20 shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm truncate">{t('ai_assistant_popup_title')}</h3>
                    <p className="text-[11px] text-white/80 truncate">
                      {t('ai_assistant_subtitle')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowQuestionPopup(false)}
                  aria-label={t('ai_assistant_close')}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body — question list */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50 dark:bg-slate-950/50
                [scrollbar-width:thin] [scrollbar-color:rgb(148_163_184_0.5)_transparent]
                [&::-webkit-scrollbar]:w-1.5
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb]:bg-slate-300/70
                dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
              >
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                  {t('ai_assistant_popup_subtitle')}
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handlePickQuestion(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors group"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/40 text-blue-600 dark:text-sky-300 shrink-0 group-hover:from-blue-600 group-hover:to-sky-400 group-hover:text-white transition-colors">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 leading-snug">{s}</span>
                  </button>
                ))}

                {/* Custom question option */}
                <button
                  onClick={handleCustomQuestion}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-dashed border-blue-400 dark:border-blue-500 text-left text-[13px] text-blue-600 dark:text-sky-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors group mt-1"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-sky-300 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Send className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 font-medium">{t('ai_assistant_popup_custom')}</span>
                </button>
              </div>
            </motion.div>
          </>
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
              className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm md:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="fixed z-[10001] flex flex-col bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden
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
                {messages.map((msg) => {
                  const isStreamingMsg =
                    msg.role === 'assistant' &&
                    streamingMsgIdRef.current === msg.id &&
                    (loading || streaming)
                  const showDots = isStreamingMsg && msg.content === '' && loading
                  const showCursor = isStreamingMsg && msg.content !== '' && streaming
                  return (
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
                        {showDots ? (
                          <div className="flex items-center gap-1 py-0.5">
                            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {renderContent(msg.content)}
                            {showCursor && (
                              <span className="inline-block w-1.5 h-3.5 align-text-bottom ml-0.5 bg-blue-500 dark:bg-sky-400 animate-pulse rounded-sm" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Suggestion chips - only show when idle and few messages */}
                {messages.length <= 1 && !loading && !streaming && (
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
                    disabled={loading || streaming}
                    rows={1}
                    maxLength={1000}
                    className="flex-1 resize-none min-h-[40px] max-h-[120px] text-[13px] bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500/30 rounded-xl"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={loading || streaming || !input.trim()}
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
