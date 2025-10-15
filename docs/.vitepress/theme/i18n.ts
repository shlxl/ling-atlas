import { DEFAULT_LOCALE, LocaleCode, NON_DEFAULT_LOCALES, routePrefix } from './locales'

export function useI18nRouting() {
  function detectLocaleFromPath(path: string): LocaleCode {
    const normalized = path.startsWith('/') ? path : `/${path}`
    for (const locale of NON_DEFAULT_LOCALES as LocaleCode[]) {
      if (normalized.startsWith(routePrefix(locale))) return locale
    }
    return DEFAULT_LOCALE
  }

  return { detectLocaleFromPath }
}
