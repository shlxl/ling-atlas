import { ref } from 'vue'
import {
  SUPPORTED_LOCALES,
  getFallbackLocale,
  isLocaleCode,
  type LocaleCode
} from '../locales'

const STORAGE_KEY = 'ling-atlas:preferred-locale'

const supportedLocaleSet = new Set(SUPPORTED_LOCALES.map(locale => locale.code))

const preferredLocale = ref<LocaleCode>(getFallbackLocale())
let hydrated = false

function normalizeCandidate(value: string | null | undefined): LocaleCode | null {
  if (!value) return null
  const normalized = value.split('-')[0]
  if (isLocaleCode(normalized)) return normalized
  if (supportedLocaleSet.has(normalized)) return normalized as LocaleCode
  return null
}

function readStoredLocale(): LocaleCode | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return normalizeCandidate(stored)
  } catch (error) {
    console.warn('[preferred-locale] failed to access localStorage', error)
    return null
  }
}

function readNavigatorLocales(): LocaleCode[] {
  if (typeof navigator === 'undefined') return []
  const candidates = new Set<string>()
  const navLanguages = Array.isArray(navigator.languages) ? navigator.languages : []
  for (const lang of navLanguages) {
    const normalized = normalizeCandidate(lang)
    if (normalized) candidates.add(normalized)
  }
  const primary = normalizeCandidate(navigator.language)
  if (primary) candidates.add(primary)
  return Array.from(candidates) as LocaleCode[]
}

function detectPreferredLocale(): LocaleCode {
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

  function rememberLocale(locale: LocaleCode) {
    if (!locale || !supportedLocaleSet.has(locale)) return
    preferredLocale.value = locale
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
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

export type { LocaleCode }
