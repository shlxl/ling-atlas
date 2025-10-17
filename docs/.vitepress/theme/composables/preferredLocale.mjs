import { ref } from 'vue'
import { SUPPORTED_LOCALES, getFallbackLocale, isLocaleCode } from '../locales.mjs'

export const PREFERRED_LOCALE_STORAGE_KEY = 'ling-atlas:preferred-locale'

const supportedLocaleSet = new Set(SUPPORTED_LOCALES.map(locale => locale.code))

const preferredLocale = ref(getFallbackLocale())
let hydrated = false

function normalizeCandidate(value) {
  if (!value) return null
  const normalized = value.split('-')[0]
  if (isLocaleCode(normalized)) return normalized
  if (supportedLocaleSet.has(normalized)) return normalized
  return null
}

function readStoredLocale() {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(PREFERRED_LOCALE_STORAGE_KEY)
    return normalizeCandidate(stored)
  } catch (error) {
    console.warn('[preferred-locale] failed to access localStorage', error)
    return null
  }
}

function readNavigatorLocales() {
  if (typeof navigator === 'undefined') return []
  const candidates = new Set()
  const navLanguages = Array.isArray(navigator.languages) ? navigator.languages : []
  for (const lang of navLanguages) {
    const normalized = normalizeCandidate(lang)
    if (normalized) candidates.add(normalized)
  }
  const primary = normalizeCandidate(navigator.language)
  if (primary) candidates.add(primary)
  return Array.from(candidates)
}

function detectPreferredLocale() {
  const stored = readStoredLocale()
  if (stored) return stored

  const navigatorLocales = readNavigatorLocales()
  for (const locale of navigatorLocales) {
    if (locale) return locale
  }

  return getFallbackLocale()
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  preferredLocale.value = detectPreferredLocale()
}

export function usePreferredLocale() {
  ensureHydrated()

  function rememberLocale(locale) {
    if (!locale || !supportedLocaleSet.has(locale)) return
    preferredLocale.value = locale
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(PREFERRED_LOCALE_STORAGE_KEY, locale)
    } catch (error) {
      console.warn('[preferred-locale] failed to persist locale', error)
    }
  }

  function refreshPreferredLocale() {
    if (typeof window === 'undefined') return
    preferredLocale.value = detectPreferredLocale()
  }

  return {
    preferredLocale,
    rememberLocale,
    refreshPreferredLocale
  }
}

export function resetPreferredLocaleForTesting() {
  hydrated = false
  preferredLocale.value = getFallbackLocale()
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PREFERRED_LOCALE_STORAGE_KEY)
    } catch {
      // ignore errors when clearing storage in tests
    }
  }
}
