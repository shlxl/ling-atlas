import { getFallbackLocale, LocaleCode, SUPPORTED_LOCALES, normalizeLocalePath, routePrefix } from './locales'

export function useI18nRouting() {
  function detectLocaleFromPath(path: string): LocaleCode {
    const [pathname] = (path || '').split(/[?#]/)
    const normalized = normalizeLocalePath(pathname || '/')
    const ordered = [...SUPPORTED_LOCALES]
      .map(locale => ({ code: locale.code, prefix: routePrefix(locale.code as LocaleCode) }))
      .sort((a, b) => b.prefix.length - a.prefix.length)

    for (const { code, prefix } of ordered) {
      if (normalized.startsWith(prefix)) return code as LocaleCode
    }

    return getFallbackLocale()
  }

  return { detectLocaleFromPath }
}
