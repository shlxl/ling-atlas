export type LocaleCode = 'zh' | 'en'
export type VitepressLocaleKey = 'zh' | 'en'

export interface LocaleDefinition<TCode extends string = string, TVitepressKey extends string = string> {
  code: TCode
  vitepressKey: TVitepressKey
}

export declare const SUPPORTED_LOCALES: readonly LocaleDefinition<LocaleCode, VitepressLocaleKey>[]
export declare const DEFAULT_LOCALE: LocaleCode
export declare const LOCALE_BY_CODE: Record<LocaleCode, LocaleDefinition<LocaleCode, VitepressLocaleKey>>
export declare const LOCALE_BY_VITEPRESS: Record<VitepressLocaleKey, LocaleDefinition<LocaleCode, VitepressLocaleKey>>
export declare const LOCALE_CODES: LocaleCode[]

export declare function getSiteBasePath(): string
export declare function withSiteBase(path: string | null | undefined): string
export declare function normalizeLocalePath(path: string | null | undefined): string
export declare function isLocaleCode(value: string | null | undefined): value is LocaleCode
export declare function isVitepressLocaleKey(value: string | null | undefined): value is VitepressLocaleKey
export declare function getFallbackLocale(): LocaleCode
export declare function normalizedRoutePrefix(locale: LocaleCode): string
export declare function routePrefix(locale: LocaleCode): string
export declare function manifestFileName(locale: LocaleCode): string
export declare function localeFromVitepressKey(key: string | null | undefined): LocaleCode | null
export declare function vitepressKeyFromLocale(locale: LocaleCode): VitepressLocaleKey
