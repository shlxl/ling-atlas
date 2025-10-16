import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.join(__dirname, '..')
export const DOCS_DIR = path.join(ROOT_DIR, 'docs')
export const GENERATED_ROOT = path.join(DOCS_DIR, '_generated')
export const PUBLIC_ROOT = path.join(DOCS_DIR, 'public')

const RAW_LOCALES = {
  zh: {
    preferred: true,
    vitepressLocaleKey: 'root',
    manifestLocale: 'zh',
    aliasLocaleIds: ['root'],
    mirrorContentToRoot: true,
    outMetaFile: 'meta.json',
    basePath: '/content/',
    generatedPathPrefix: '/_generated',
    rssFile: 'rss.xml',
    sitemapFile: 'sitemap.xml',
    labels: {
      category: value => `分类 · ${value}`,
      series: value => `连载 · ${value}`,
      tag: value => `标签 · ${value}`,
      archive: value => `归档 · ${value}`,
      rssTitle: 'Ling Atlas',
      rssDesc: '最新更新'
    },
    contentFields: {
      category: ['category_zh', 'category'],
      tags: ['tags_zh', 'tags'],
      series: ['series'],
      seriesSlug: ['series_slug'],
      status: ['status']
    }
  },
  en: {
    preferred: false,
    vitepressLocaleKey: 'en',
    manifestLocale: 'en',
    aliasLocaleIds: [],
    outMetaFile: 'meta.en.json',
    basePath: '/en/content/',
    generatedPathPrefix: '/en/_generated',
    rssFile: 'rss-en.xml',
    sitemapFile: 'sitemap-en.xml',
    labels: {
      category: value => `Category · ${value}`,
      series: value => `Series · ${value}`,
      tag: value => `Tag · ${value}`,
      archive: value => `Archive · ${value}`,
      rssTitle: 'Ling Atlas (EN)',
      rssDesc: 'Latest updates'
    },
    contentFields: {
      category: ['category_en', 'category'],
      tags: ['tags_en', 'tags'],
      series: ['series_en', 'series'],
      seriesSlug: ['series_slug_en', 'series_slug', 'series_en', 'series'],
      status: ['status']
    }
  }
}

function uniq(paths) {
  const seen = new Set()
  const result = []
  for (const item of paths) {
    if (!item) continue
    const key = path.normalize(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function ensureLeadingSlash(value) {
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

function ensureTrailingSlash(value) {
  if (!value) return '/'
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeGeneratedPrefix(prefix) {
  if (!prefix) return '/_generated'
  const normalized = ensureLeadingSlash(prefix)
  return normalized.endsWith('/_generated') ? normalized : `${normalized}/_generated`
}

function finalizeLocale(code, config = {}) {
  const preferred = Boolean(config.preferred)
  const mirrorContentToRoot = Boolean(config.mirrorContentToRoot)
  const manifestLocale = config.manifestLocale || code
  const aliasLocaleIds = Array.isArray(config.aliasLocaleIds) ? config.aliasLocaleIds : []
  const vitepressLocaleKey = config.vitepressLocaleKey || code

  const defaultRoutePrefix = mirrorContentToRoot ? '' : `/${code}`
  const routePrefix = config.routePrefix ?? defaultRoutePrefix
  const localeRoot = routePrefix ? ensureTrailingSlash(routePrefix) : '/'
  const normalizedRoutePrefix = ensureTrailingSlash(`/${code}`)

  const docsRoot = config.docsRoot || (mirrorContentToRoot ? DOCS_DIR : path.join(DOCS_DIR, code))
  const generatedDir = config.generatedDir || path.join(docsRoot, '_generated')
  const contentDir = config.contentDir || path.join(DOCS_DIR, `content.${code}`)
  const localizedContentDir =
    config.localizedContentDir || (mirrorContentToRoot ? path.join(DOCS_DIR, 'content') : path.join(docsRoot, 'content'))

  const basePath = ensureTrailingSlash(config.basePath || `${localeRoot}content/`)
  const generatedPathPrefix = config.generatedPathPrefix
    ? ensureLeadingSlash(config.generatedPathPrefix)
    : normalizeGeneratedPrefix(routePrefix)

  const navManifestFile = config.navManifestFile || `nav.manifest.${code}.json`
  const navManifestPath = config.navManifestPath || path.join(GENERATED_ROOT, navManifestFile)

  const searchRoots = uniq([
    DOCS_DIR,
    GENERATED_ROOT,
    docsRoot,
    generatedDir,
    ...(Array.isArray(config.searchRoots) ? config.searchRoots : [])
  ])

  const contentRoots = uniq([
    localizedContentDir,
    contentDir,
    ...(Array.isArray(config.contentRoots) ? config.contentRoots : [])
  ])

  const outMetaFile = config.outMetaFile || `meta.${code}.json`
  const outMeta = config.outMeta || path.join(GENERATED_ROOT, outMetaFile)

  return {
    code,
    preferred,
    vitepressLocaleKey,
    manifestLocale,
    aliasLocaleIds,
    mirrorContentToRoot,
    routePrefix,
    localeRoot,
    normalizedRoutePrefix,
    docsRoot,
    generatedDir,
    navManifestFile,
    navManifestPath,
    contentDir,
    localizedContentDir,
    contentRoots,
    searchRoots,
    basePath,
    generatedPathPrefix,
    labels: config.labels || {},
    contentFields: config.contentFields || {},
    rssFile: config.rssFile,
    sitemapFile: config.sitemapFile,
    outMeta
  }
}

const localeEntries = Object.freeze(
  Object.entries(RAW_LOCALES).map(([code, config]) => finalizeLocale(code, config))
)

export const LANG_CONFIG = Object.freeze(Object.fromEntries(localeEntries.map(locale => [locale.code, locale])))
export const LANGUAGES = localeEntries

export const LOCALE_REGISTRY = Object.freeze(
  localeEntries.map(locale => ({
    code: locale.code,
    preferred: locale.preferred,
    routePrefix: locale.routePrefix,
    localeRoot: locale.localeRoot,
    normalizedRoutePrefix: locale.normalizedRoutePrefix,
    navManifestFile: locale.navManifestFile,
    navManifestPath: locale.navManifestPath,
    docsRoot: locale.docsRoot,
    generatedDir: locale.generatedDir,
    searchRoots: locale.searchRoots,
    contentRoots: locale.contentRoots,
    contentDir: locale.contentDir,
    localizedContentDir: locale.localizedContentDir,
    basePath: locale.basePath,
    generatedPathPrefix: locale.generatedPathPrefix
  }))
)

export function getLocaleConfig(localeCode) {
  return LANG_CONFIG[localeCode]
}

export function getPreferredLocale() {
  const preferredLocale = localeEntries.find(locale => locale.preferred)
  return preferredLocale ? preferredLocale.code : localeEntries[0]?.code
}
