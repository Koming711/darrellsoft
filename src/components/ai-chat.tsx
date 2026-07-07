'use client'

import * as React from 'react'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'
import { MessageSquare, X, Send, Sparkles, Bot, User, Loader2, Trash2 } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface AIChatProps {
  /** Optional className for positioning */
  className?: string
}

const SUGGESTIONS = {
  id: [
    'Bagaimana cara menghitung biaya cetakan?',
    'Tips menentukan harga jual yang menguntungkan',
    'Jenis kertas apa yang cocok untuk box makanan?',
    'Bagaimana cara memaksimalkan keuntungan?',
  ],
  en: [
    'How do I calculate printing costs?',
    'Tips for setting profitable selling prices',
    'What paper type is suitable for food boxes?',
    'How can I maximize profit?',
  ],
}

const T = {
  id: {
    title: 'Darrell AI',
    subtitle: 'Asisten Cerdas Percetakan',
    placeholder: 'Tulis pertanyaan Anda...',
    send: 'Kirim',
    greeting: 'Halo! Saya Darrell AI. Ada yang bisa saya bantu seputar percetakan atau penggunaan aplikasi?',
    thinking: 'AI sedang mengetik...',
    error: 'Maaf, terjadi kesalahan. Silakan coba lagi.',
    clear: 'Hapus percakapan',
    close: 'Tutup',
    open: 'Buka asisten AI',
    suggestions_title: 'Pertanyaan populer:',
  },
  en: {
    title: 'Darrell AI',
    subtitle: 'Smart Printing Assistant',
    placeholder: 'Type your question...',
    send: 'Send',
    greeting: "Hello! I'm Darrell AI. How can I help you with printing or using the app?",
    thinking: 'AI is typing...',
    error: 'Sorry, an error occurred. Please try again.',
    clear: 'Clear conversation',
    close: 'Close',
    open: 'Open AI assistant',
    suggestions_title: 'Popular questions:',
  },
} as const

export function AIChat({ className = '' }: AIChatProps) {
  const { language } = useLanguage()
  const t = T[language]

  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [sessionId, setSessionId] = React.useState<string>('')
  const [mounted, setMounted] = React.useState(false)
  const [unread, setUnread] = React.useState(false)

  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Generate a stable session ID on mount
  React.useEffect(() => {
    if (!mounted) return
    let sid = sessionStorage.getItem('ai_chat_session')
    if (!sid) {
      sid = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem('ai_chat_session', sid)
    }
    setSessionId(sid)

    // Load greeting message
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        content: T[language].greeting,
        timestamp: Date.now(),
      },
    ])
  }, [mounted, language])

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (messagesEndRef.current && scrollContainerRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    // Mark unread if panel is closed and new message arrived
    if (!open && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].id !== 'greeting') {
      setUnread(true)
    }
  }, [messages, open])

  // Focus input when opened
  React.useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Clear unread when opened
  React.useEffect(() => {
    if (open) setUnread(false)
  }, [open])

  const sendMessage = React.useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
          language,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.response) {
        setError(data.error || T[language].error)
        return
      }

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, aiMsg])

      if (data.sessionId) {
        setSessionId(data.sessionId)
        sessionStorage.setItem('ai_chat_session', data.sessionId)
      }
    } catch (err) {
      setError(T[language].error)
    } finally {
      setLoading(false)
    }
  }, [loading, sessionId, language])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleClear = () => {
    const newSid = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setSessionId(newSid)
    sessionStorage.setItem('ai_chat_session', newSid)
    setMessages([
      {
        id: 'greeting-new',
        role: 'assistant',
        content: T[language].greeting,
        timestamp: Date.now(),
      },
    ])
    setError('')
  }

  // Don't render anything on server to avoid hydration mismatch
  if (!mounted) return null

  const suggestions = SUGGESTIONS[language]

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t.open}
          title={t.open}
          className={cn(
            'fixed bottom-5 right-5 z-[9990] flex items-center justify-center',
            'w-14 h-14 rounded-full shadow-lg',
            'text-white transition-all duration-300',
            'hover:scale-110 active:scale-95',
            'group',
            className
          )}
          style={{
            background: 'linear-gradient(135deg, #0d9488, #059669)',
            boxShadow: '0 8px 24px rgba(13, 148, 136, 0.4)',
          }}
        >
          {/* Pulsing ring */}
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: '#0d9488' }}
          />
          <MessageSquare className="w-6 h-6 relative z-10" />
          {unread && (
            <span
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-white z-20"
            />
          )}
          {/* Tooltip on hover */}
          <span
            className={cn(
              'absolute right-full mr-3 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
              'bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity',
              'pointer-events-none'
            )}
          >
            {t.title}
          </span>
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className={cn(
            'fixed bottom-5 right-5 z-[9990] flex flex-col',
            'w-[calc(100vw-2.5rem)] sm:w-[400px] h-[600px] max-h-[calc(100vh-2.5rem)]',
            'bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl',
            'border border-zinc-200 dark:border-zinc-700',
            'overflow-hidden',
            className
          )}
          style={{
            animation: 'chatSlideIn 0.25s ease-out',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold truncate">{t.title}</h3>
                  <span className="w-2 h-2 rounded-full bg-green-300 flex-shrink-0" />
                </div>
                <p className="text-[10px] text-white/80 truncate">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleClear}
                aria-label={t.clear}
                title={t.clear}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label={t.close}
                title={t.close}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-zinc-50 dark:bg-zinc-950"
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2.5',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    msg.role === 'user'
                      ? 'bg-zinc-300 dark:bg-zinc-700'
                      : ''
                  )}
                  style={
                    msg.role === 'assistant'
                      ? { background: 'linear-gradient(135deg, #0d9488, #059669)' }
                      : undefined
                  }
                >
                  {msg.role === 'user' ? (
                    <User className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                  ) : (
                    <Bot className="w-4 h-4 text-white" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    'max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm',
                    'leading-relaxed whitespace-pre-wrap break-words',
                    msg.role === 'user'
                      ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-tr-sm'
                      : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-tl-sm shadow-sm border border-zinc-100 dark:border-zinc-700'
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5 flex-row">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
                >
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white dark:bg-zinc-800 rounded-2xl rounded-tl-sm shadow-sm border border-zinc-100 dark:border-zinc-700 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.thinking}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-center">
                <p className="text-xs text-red-500 px-3 py-2 bg-red-50 dark:bg-red-950/30 rounded-lg inline-block">
                  {error}
                </p>
              </div>
            )}

            {/* Suggestions (only show when no user messages yet) */}
            {messages.length === 1 && !loading && !error && (
              <div className="pt-2">
                <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 mb-2 px-1">
                  {t.suggestions_title}
                </p>
                <div className="space-y-1.5">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(s)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-xs',
                        'bg-white dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-zinc-700',
                        'border border-zinc-200 dark:border-zinc-700',
                        'text-zinc-700 dark:text-zinc-300 hover:text-emerald-700 dark:hover:text-emerald-300',
                        'transition-colors'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                rows={1}
                maxLength={2000}
                className={cn(
                  'flex-1 resize-none px-3.5 py-2.5 rounded-xl text-sm',
                  'bg-zinc-100 dark:bg-zinc-800 border-0',
                  'text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400',
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
                  'max-h-24'
                )}
                style={{ minHeight: '42px' }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                aria-label={t.send}
                title={t.send}
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0',
                  'text-white transition-all',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'hover:scale-105 active:scale-95'
                )}
                style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 text-center">
              Darrell AI · {language === 'en' ? 'Powered by AI' : 'Didukung AI'}
            </p>
          </div>

          {/* Animation styles */}
          <style>{`
            @keyframes chatSlideIn {
              0% { opacity: 0; transform: translateY(20px) scale(0.95); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </>
  )
}
