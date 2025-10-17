export type AggregateType = 'categories' | 'series' | 'tags' | 'archive'

export type LocaleEntry = Record<string, string>

export type NavManifestSection = Record<string, string>

export type NavManifest = {
  locale: string
  categories: NavManifestSection
  series: NavManifestSection
  tags: NavManifestSection
  archive: NavManifestSection
}

export type LocaleMapState = {
  lookup: Record<string, LocaleEntry>
  manifests: Partial<Record<string, NavManifest>>
}

export type ResolveTargetPathResult = {
  path: string
  hasMapping: boolean
  reason: 'exact' | 'manifest-match' | 'manifest-fallback' | 'home'
}

export type LocaleMapCoreDeps = {
  supportedLocales: Array<{ code: string }>
  getFallbackLocale: () => string
  normalizeLocalePath: (path: string) => string
  routePrefix: (locale: string) => string
}

export function createLocaleMapCore(deps: LocaleMapCoreDeps): {
  normalizeRoutePath(path: string): string
  getFallbackPath(locale: string): string
  detectLocaleFromPath(path: string): string
  compareLocale(path: string, locale: string): { locale: string; matches: boolean }
  hasLocalePrefix(path: string): boolean
  parseAggregatePath(path: string): { type: AggregateType; slug: string } | null
  resolveTargetPath(
    state: LocaleMapState,
    path: string,
    currentLocale: string,
    targetLocale: string
  ): ResolveTargetPathResult
  resetFallbackCache(): void
}
