import { onMounted, ref } from 'vue'
import { DEFAULT_LOCALE, LocaleCode, isLocaleCode } from '../theme/locales'

const preferredLocale = ref<LocaleCode>(DEFAULT_LOCALE)

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
  const detected = detectNavigatorLocale()
  if (detected) {
    preferredLocale.value = detected
  }
})

export function usePreferredLocale() {
  return preferredLocale
}
