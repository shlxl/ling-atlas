const AGGREGATE_TYPES = new Set(['categories', 'series', 'tags', 'archive'])

function decodePathname(path) {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

export function createLocaleMapCore({
  supportedLocales = [],
  getFallbackLocale,
  normalizeLocalePath,
  routePrefix
}) {
  if (typeof getFallbackLocale !== 'function') {
    throw new TypeError('getFallbackLocale must be a function')
  }
  if (typeof normalizeLocalePath !== 'function') {
    throw new TypeError('normalizeLocalePath must be a function')
  }
  if (typeof routePrefix !== 'function') {
    throw new TypeError('routePrefix must be a function')
  }

  const fallbackCache = Object.create(null)

  function getFallbackPath(locale) {
    if (!fallbackCache[locale]) {
      fallbackCache[locale] = normalizeLocalePath(routePrefix(locale))
    }
    return fallbackCache[locale]
  }

  function resetFallbackCache() {
    for (const key of Object.keys(fallbackCache)) {
      delete fallbackCache[key]
    }
  }

  function normalizeRoutePath(path) {
    const fallbackLocale = getFallbackLocale()
    if (!path) return getFallbackPath(fallbackLocale)
    const [pathname] = String(path).split(/[?#]/)
    if (!pathname) return getFallbackPath(fallbackLocale)
    const decoded = decodePathname(pathname)
    return normalizeLocalePath(decoded)
  }

  function getOrderedPrefixes() {
    return supportedLocales
      .map(locale => ({ code: locale.code, prefix: getFallbackPath(locale.code) }))
      .sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0))
  }

  function detectLocaleFromPath(path) {
    const normalized = normalizeRoutePath(path)
    for (const { code, prefix } of getOrderedPrefixes()) {
      if (normalized.startsWith(prefix)) return code
    }
    return getFallbackLocale()
  }

  function compareLocale(path, locale) {
    const detected = detectLocaleFromPath(path)
    return {
      locale: detected,
      matches: detected === locale
    }
  }

  function hasLocalePrefix(path) {
    const normalized = normalizeRoutePath(path)
    for (const locale of supportedLocales) {
      const code = locale?.code
      if (!code) continue
      const prefix = getFallbackPath(code)
      if (normalized.startsWith(prefix)) return true
    }
    return false
  }

  function parseAggregatePath(path) {
    const normalized = normalizeRoutePath(path)
    let relative = normalized

    for (const { prefix } of getOrderedPrefixes()) {
      if (!normalized.startsWith(prefix)) continue
      relative = prefix === '/' ? normalized : normalized.slice(prefix.length - 1)
      break
    }

    const segments = relative.split('/').filter(Boolean)
    if (!segments.length) return null
    if (segments[0] !== '_generated') return null
    const type = segments[1]
    const slug = segments[2]
    if (!type || !slug) return null
    if (!AGGREGATE_TYPES.has(type)) return null
    return { type, slug }
  }

  function getFirstManifestPath(manifest, type) {
    if (!manifest) return null
    const entries = manifest[type]
    if (!entries) return null
    const first = Object.values(entries)[0]
    if (!first) return null
    return normalizeLocalePath(decodePathname(first))
  }

  function resolveTargetPath(state, path, currentLocale, targetLocale) {
    const normalized = normalizeRoutePath(path)
    const entry = state?.lookup?.[normalized]
    const mapped = entry?.[targetLocale]
    if (mapped) {
      return { path: normalizeLocalePath(mapped), hasMapping: true, reason: 'exact' }
    }

    const manifest = state?.manifests?.[targetLocale]
    const aggregateInfo = parseAggregatePath(normalized)
    if (manifest && aggregateInfo) {
      const direct = manifest?.[aggregateInfo.type]?.[aggregateInfo.slug]
      if (direct) {
        return {
          path: normalizeLocalePath(decodePathname(direct)),
          hasMapping: true,
          reason: 'manifest-match'
        }
      }
      const fallback = getFirstManifestPath(manifest, aggregateInfo.type)
      if (fallback) {
        return { path: fallback, hasMapping: false, reason: 'manifest-fallback' }
      }
    }

    if (normalized === getFallbackPath(currentLocale)) {
      return { path: getFallbackPath(targetLocale), hasMapping: true, reason: 'home' }
    }

    return { path: getFallbackPath(targetLocale), hasMapping: false, reason: 'home' }
  }

  return {
    normalizeRoutePath,
    getFallbackPath,
    detectLocaleFromPath,
    compareLocale,
    parseAggregatePath,
    resolveTargetPath,
    hasLocalePrefix,
    resetFallbackCache
  }
}
