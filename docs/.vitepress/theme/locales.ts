export const SUPPORTED_LOCALES = [
  { code: 'zh', vitepressKey: 'root', isDefault: true },
  { code: 'en', vitepressKey: 'en', isDefault: false }
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']
export type VitepressLocaleKey = (typeof SUPPORTED_LOCALES)[number]['vitepressKey']

export const DEFAULT_LOCALE: LocaleCode = SUPPORTED_LOCALES.find(locale => locale.isDefault)!.code

export const LOCALE_BY_CODE: Record<LocaleCode, (typeof SUPPORTED_LOCALES)[number]> = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.code, locale])
) as Record<LocaleCode, (typeof SUPPORTED_LOCALES)[number]>

export const LOCALE_BY_VITEPRESS: Record<VitepressLocaleKey, (typeof SUPPORTED_LOCALES)[number]> = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.vitepressKey, locale])
) as Record<VitepressLocaleKey, (typeof SUPPORTED_LOCALES)[number]>

export const LOCALE_CODES = SUPPORTED_LOCALES.map(locale => locale.code) as LocaleCode[]

export const NON_DEFAULT_LOCALES = SUPPORTED_LOCALES.filter(locale => !locale.isDefault).map(locale => locale.code) as LocaleCode[]

export function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return value != null && Object.prototype.hasOwnProperty.call(LOCALE_BY_CODE, value)
}

export function isVitepressLocaleKey(value: string | null | undefined): value is VitepressLocaleKey {
  return value != null && Object.prototype.hasOwnProperty.call(LOCALE_BY_VITEPRESS, value)
}

export function routePrefix(locale: LocaleCode): string {
  return locale === DEFAULT_LOCALE ? '/' : `/${locale}/`
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
