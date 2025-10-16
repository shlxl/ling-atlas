type LocaleDefinition<TCode extends string = string, TVitepressKey extends string = string> = {
  code: TCode
  vitepressKey: TVitepressKey
}

const RAW_SUPPORTED_LOCALES = [
  { code: 'zh', vitepressKey: 'root' },
  { code: 'en', vitepressKey: 'en' }
] as const satisfies readonly LocaleDefinition[]

export const SUPPORTED_LOCALES = RAW_SUPPORTED_LOCALES

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']
export type VitepressLocaleKey = (typeof SUPPORTED_LOCALES)[number]['vitepressKey']

type LocaleIndex = Record<LocaleCode, (typeof SUPPORTED_LOCALES)[number]>
type VitepressIndex = Record<VitepressLocaleKey, (typeof SUPPORTED_LOCALES)[number]>

export const LOCALE_BY_CODE: LocaleIndex = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.code, locale])
) as LocaleIndex

export const LOCALE_BY_VITEPRESS: VitepressIndex = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.vitepressKey, locale])
) as VitepressIndex

export const LOCALE_CODES = SUPPORTED_LOCALES.map(locale => locale.code) as LocaleCode[]

export function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return value != null && Object.prototype.hasOwnProperty.call(LOCALE_BY_CODE, value)
}

export function isVitepressLocaleKey(value: string | null | undefined): value is VitepressLocaleKey {
  return value != null && Object.prototype.hasOwnProperty.call(LOCALE_BY_VITEPRESS, value)
}

function readFallbackLocale(): LocaleCode | null {
  const envKeys = ['LING_ATLAS_FALLBACK_LOCALE', 'FALLBACK_LOCALE', 'DEFAULT_LOCALE']
  for (const key of envKeys) {
    const raw = typeof process !== 'undefined' ? (process.env?.[key] as string | undefined) : undefined
    if (raw && isLocaleCode(raw)) return raw
  }

  const siteLocale = (globalThis as any)?.__VP_SITE_DATA__?.lang
  if (siteLocale && typeof siteLocale === 'string') {
    const normalized = siteLocale.split('-')[0]
    if (isLocaleCode(normalized)) return normalized
  }

  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement?.lang
    if (htmlLang) {
      const normalized = htmlLang.split('-')[0]
      if (isLocaleCode(normalized)) return normalized
    }
  }

  return null
}

let fallbackLocale: LocaleCode | null = null

export function getFallbackLocale(): LocaleCode {
  if (fallbackLocale) return fallbackLocale
  const detected = readFallbackLocale()
  fallbackLocale = detected && isLocaleCode(detected) ? detected : SUPPORTED_LOCALES[0]!.code
  return fallbackLocale
}

export function normalizedRoutePrefix(locale: LocaleCode): string {
  return `/${locale}/`
}

export function routePrefix(locale: LocaleCode): string {
  const fallback = getFallbackLocale()
  if (locale === fallback) return '/'
  return normalizedRoutePrefix(locale)
}

export function manifestFileName(locale: LocaleCode): string {
  return `nav.manifest.${locale}.json`
}

export function localeFromVitepressKey(key: string | null | undefined): LocaleCode | null {
  if (!key || !isVitepressLocaleKey(key)) return null
  return LOCALE_BY_VITEPRESS[key].code
}

export function vitepressKeyFromLocale(locale: LocaleCode): VitepressLocaleKey {
  return LOCALE_BY_CODE[locale].vitepressKey
}
