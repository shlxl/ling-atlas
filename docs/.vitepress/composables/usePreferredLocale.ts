import { onMounted, ref } from 'vue'
import { DEFAULT_LOCALE, LocaleCode, isLocaleCode } from '../theme/locales'

export const PREFERRED_LOCALE_STORAGE_KEY = 'ling-atlas:preferred-locale'

function readStoredLocale(): LocaleCode | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage?.getItem(PREFERRED_LOCALE_STORAGE_KEY)
    if (stored && isLocaleCode(stored)) {
      return stored
    }
  } catch {
    /* ignore storage access errors */
  }
  return null
}

const preferredLocale = ref<LocaleCode>(DEFAULT_LOCALE)

if (typeof window !== 'undefined') {
  const stored = readStoredLocale()
  if (stored) {
    preferredLocale.value = stored
  }
}

function detectNavigatorLocale(): LocaleCode | null {
  if (typeof navigator === 'undefined') return null
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : navigator.language
    ? [navigator.language]
    : []

  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = candidate.toLowerCase().split('-')[0]
    if (isLocaleCode(normalized)) {
      return normalized
    }
  }

  return null
}

onMounted(() => {
  const stored = readStoredLocale()
  if (stored) {
    preferredLocale.value = stored
    return
  }

  const detected = detectNavigatorLocale()
  if (detected) {
    preferredLocale.value = detected
  }
})

export function usePreferredLocale() {
  return preferredLocale
}
