'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/contexts/language-context'

const TITLES: Record<string, string> = {
  id: 'Darrell Soft - Kalkulator Hitung Cetakan',
  en: 'Darrell Soft - Printing Cost Calculator',
}

const DESCRIPTIONS: Record<string, string> = {
  id: 'Aplikasi kalkulator hitung cetakan profesional',
  en: 'Professional printing cost calculator application',
}

/**
 * Keeps document.title and <html lang="..."> in sync with the active app language.
 * Uses React 19's native <title> / <meta> hoisting (supported in Next.js App Router)
 * so the tags are managed by React and won't be overwritten by the static metadata.
 */
export function DocumentLanguageSync() {
  const { language, loading } = useLanguage()

  useEffect(() => {
    // Update <html lang="..."> attribute for accessibility / SEO
    document.documentElement.lang = language || 'id'
  }, [language, loading])

  if (loading) {
    // Render nothing while loading; static metadata from layout.tsx is used as fallback
    return null
  }

  const title = TITLES[language] || TITLES.id
  const description = DESCRIPTIONS[language] || DESCRIPTIONS.id

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
    </>
  )
}
