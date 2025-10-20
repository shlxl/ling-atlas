import { createLocaleMapCore } from './theme/composables/locale-map-core.mjs'
import {
  SUPPORTED_LOCALES,
  getFallbackLocale,
  getSiteBasePath,
  normalizeLocalePath,
  routePrefix,
  withSiteBase
} from './theme/locales.mjs'

const localeMapCore = createLocaleMapCore({
  supportedLocales: SUPPORTED_LOCALES.map(locale => ({ code: locale.code })),
  getFallbackLocale,
  normalizeLocalePath,
  routePrefix
})

const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function cloneRecord(record) {
  if (!isPlainObject(record)) return {}
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  )
}

function mergeRecords(base = {}, override = {}) {
  const merged = { ...cloneRecord(base) }
  for (const [key, value] of Object.entries(cloneRecord(override))) {
    merged[key] = value
  }
  return merged
}

function mergeSeoEntry(defaults = {}, override = {}) {
  const result = {}
  if (defaults.meta || override.meta) {
    result.meta = mergeRecords(defaults.meta, override.meta)
  }
  if (defaults.openGraph || override.openGraph) {
    result.openGraph = mergeRecords(defaults.openGraph, override.openGraph)
  }
  if (defaults.twitter || override.twitter) {
    result.twitter = mergeRecords(defaults.twitter, override.twitter)
  }
  if ((defaults.canonical && defaults.canonical.base) || (override.canonical && override.canonical.base)) {
    result.canonical = {
      ...cloneRecord(defaults.canonical),
      ...cloneRecord(override.canonical)
    }
  }
  return result
}

function toMetaContent(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean).join(', ')
  }
  if (value == null) return ''
  return String(value).trim()
}

function isAbsoluteUrl(value) {
  if (!value) return false
  if (value.startsWith('//')) return true
  return ABSOLUTE_URL_REGEX.test(value)
}

function joinUrl(base, path) {
  if (!base) return path
  const normalizedBase = String(base).replace(/\/+$/g, '')
  if (!path) return normalizedBase
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function shouldStripBaseFromPath(canonicalBase, siteBasePath) {
  if (!canonicalBase) return false
  if (!siteBasePath || siteBasePath === '/') return false

  const trimmedSiteBase = siteBasePath.endsWith('/')
    ? siteBasePath.slice(0, -1)
    : siteBasePath
  if (!trimmedSiteBase) return false

  try {
    const parsed = new URL(canonicalBase)
    const canonicalPath = parsed.pathname || '/'
    const normalizedCanonicalPath = canonicalPath.endsWith('/')
      ? canonicalPath
      : `${canonicalPath}/`
    const normalizedSiteBase = siteBasePath
    return (
      normalizedCanonicalPath === normalizedSiteBase ||
      normalizedCanonicalPath.endsWith(`${trimmedSiteBase}/`)
    )
  } catch {
    return (
      canonicalBase.endsWith(trimmedSiteBase) ||
      canonicalBase.endsWith(`${trimmedSiteBase}/`)
    )
  }
}

function normalizeCanonicalPath(canonicalBase, normalizedPath) {
  if (!normalizedPath) return normalizedPath
  const siteBasePath = getSiteBasePath()
  const shouldStrip = shouldStripBaseFromPath(canonicalBase, siteBasePath)
  if (!shouldStrip) return normalizedPath
  if (!siteBasePath || siteBasePath === '/') return normalizedPath
  if (!normalizedPath.startsWith(siteBasePath)) return normalizedPath
  const remainder = normalizedPath.slice(siteBasePath.length)
  return remainder ? `/${remainder}` : '/'
}

function normalizeAssetUrl(value, siteOrigin) {
  if (!value) return ''
  if (isAbsoluteUrl(value)) return value
  const withBase = withSiteBase(value)
  if (!siteOrigin) return withBase
  const normalizedPath = normalizeCanonicalPath(siteOrigin, withBase)
  return joinUrl(siteOrigin, normalizedPath || withBase)
}

function resolveEntry(config, locale) {
  const defaults = isPlainObject(config?.defaults) ? config.defaults : {}
  const localeOverrides = isPlainObject(config?.locales?.[locale]) ? config.locales[locale] : {}
  return {
    entry: mergeSeoEntry(defaults, localeOverrides),
    defaults,
    overrides: localeOverrides
  }
}

const URL_KEYS = new Set(['url', 'image', 'image:url', 'image:secure_url'])

function buildMetaEntries(record = {}, { attr, prefix, siteOrigin }) {
  const entries = []
  for (const [key, rawValue] of Object.entries(record)) {
    const content = toMetaContent(rawValue)
    if (!content) continue
    const normalizedContent = URL_KEYS.has(key) ? normalizeAssetUrl(content, siteOrigin) : content
    entries.push(['meta', { [attr]: `${prefix}${key}`, content: normalizedContent }])
  }
  return entries
}

export function resolveSeoHead({ seoConfig = {}, locale, normalizedPath, siteOrigin }) {
  const { entry, defaults, overrides } = resolveEntry(seoConfig, locale)
  const defaultCanonical = defaults?.canonical?.base
  const overrideCanonical = overrides?.canonical?.base
  const envOriginSource = typeof process !== 'undefined' ? process.env?.SITE_ORIGIN : undefined
  const envOrigin = siteOrigin || envOriginSource
  const canonicalBase =
    (overrideCanonical && String(overrideCanonical).trim()) ||
    (envOrigin && String(envOrigin).trim()) ||
    (defaultCanonical && String(defaultCanonical).trim()) ||
    'https://example.com'
  if (!entry.canonical) {
    entry.canonical = {}
  }
  entry.canonical.base = canonicalBase
  const canonicalPath = normalizeCanonicalPath(canonicalBase, normalizedPath)
  const canonicalUrl =
    canonicalBase && canonicalPath ? joinUrl(canonicalBase, canonicalPath) : null

  const head = []
  if (canonicalUrl) {
    head.push(['link', { rel: 'canonical', href: canonicalUrl }])
  }

  const meta = cloneRecord(entry.meta)
  const openGraph = cloneRecord(entry.openGraph)
  const twitter = cloneRecord(entry.twitter)

  if (meta.description) {
    if (!openGraph.description) openGraph.description = meta.description
    if (!twitter.description) twitter.description = meta.description
  }

  if (canonicalUrl) {
    if (!openGraph.url) openGraph.url = canonicalUrl
    if (!twitter.url) twitter.url = canonicalUrl
  }

  head.push(...buildMetaEntries(meta, { attr: 'name', prefix: '', siteOrigin: canonicalBase }))
  head.push(
    ...buildMetaEntries(openGraph, {
      attr: 'property',
      prefix: 'og:',
      siteOrigin: canonicalBase
    })
  )
  head.push(
    ...buildMetaEntries(twitter, {
      attr: 'name',
      prefix: 'twitter:',
      siteOrigin: canonicalBase
    })
  )

  return {
    head,
    canonicalUrl,
    entry,
    locale
  }
}

export function resolveRoutePathFromRelative(relativePath) {
  if (!relativePath) return '/'
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized === 'index.md') return '/'
  if (normalized.endsWith('/index.md')) {
    const withoutIndex = normalized.slice(0, -'index.md'.length)
    return withoutIndex.startsWith('/') ? withoutIndex : `/${withoutIndex}`
  }
  if (normalized.endsWith('.md')) {
    const withoutExt = normalized.slice(0, -'.md'.length)
    return `/${withoutExt}.html`
  }
  return `/${normalized}`
}

export function normalizeRoutePath(path) {
  return localeMapCore.normalizeRoutePath(path)
}

export function detectLocaleFromPath(path) {
  return localeMapCore.detectLocaleFromPath(path)
}
