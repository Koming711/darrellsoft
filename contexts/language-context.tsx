'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { translations, Language, TranslationKey } from '@/lib/i18n'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
  loading: boolean
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'id',
  setLanguage: () => {},
  t: (key: TranslationKey) => key,
  loading: true,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('id')
  const [loading, setLoading] = useState(true)

  // Load language from localStorage first, then from public API
  useEffect(() => {
    const savedLang = localStorage.getItem('app_language') as Language | null
    if (savedLang && (savedLang === 'id' || savedLang === 'en')) {
      setLanguageState(savedLang)
    }

    // Fetch from public API (no auth needed)
    fetch('/api/public-settings')
      .then(r => r.json())
      .then(data => {
        if (data?.app_language && (data.app_language === 'id' || data.app_language === 'en')) {
          setLanguageState(data.app_language)
          localStorage.setItem('app_language', data.app_language)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('app_language', lang)

    // Save to API (best effort - uses auth endpoint)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'app_language', value: lang }),
    }).catch(() => {})
  }, [])

  const t = useCallback((key: TranslationKey): string => {
    return translations[language]?.[key] || translations.id[key] || key
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, loading }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
