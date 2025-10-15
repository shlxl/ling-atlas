import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.join(__dirname, '..')
export const DOCS_DIR = path.join(ROOT_DIR, 'docs')
export const GENERATED_ROOT = path.join(DOCS_DIR, '_generated')
export const PUBLIC_ROOT = path.join(DOCS_DIR, 'public')

export const DEFAULT_LOCALE = 'zh'

const RAW_LOCALES = {
  zh: {
    isDefault: true,
    vitepressLocaleKey: 'root',
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
    isDefault: false,
    vitepressLocaleKey: 'en',
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

function finalizeLocale(code, config) {
  const isDefault = config.isDefault ?? code === DEFAULT_LOCALE
  const routePrefix = isDefault ? '' : `/${code}`
  const docsRoot = isDefault ? DOCS_DIR : path.join(DOCS_DIR, code)
  const generatedDir = isDefault ? GENERATED_ROOT : path.join(docsRoot, '_generated')
  const navManifestFile = `nav.manifest.${code}.json`
  const navManifestPath = path.join(GENERATED_ROOT, navManifestFile)
  const contentDir = path.join(DOCS_DIR, `content.${code}`)
  const localizedContentDir = isDefault ? path.join(DOCS_DIR, 'content') : path.join(docsRoot, 'content')
  const basePath = `${routePrefix}/content/`
  const generatedPathPrefix = `${routePrefix}/_generated`
  const localeRoot = routePrefix ? `${routePrefix}/` : '/'

  const searchRoots = uniq([
    DOCS_DIR,
    GENERATED_ROOT,
    docsRoot,
    generatedDir
  ])

  const contentRoots = uniq([
    localizedContentDir,
    contentDir,
    path.join(DOCS_DIR, 'content'),
    path.join(DOCS_DIR, `content.${DEFAULT_LOCALE}`)
  ])

  return {
    code,
    ...config,
    isDefault,
    routePrefix,
    docsRoot,
    contentDir,
    localizedContentDir,
    contentRoots,
    searchRoots,
    generatedDir,
    navManifestFile,
    navManifestPath,
    basePath,
    generatedPathPrefix,
    localeRoot,
    outMeta: path.join(GENERATED_ROOT, isDefault ? 'meta.json' : `meta.${code}.json`)
  }
}

const localeEntries = Object.freeze(Object.entries(RAW_LOCALES).map(([code, config]) => finalizeLocale(code, config)))

export const LANG_CONFIG = Object.freeze(Object.fromEntries(localeEntries.map(locale => [locale.code, locale])))
export const LANGUAGES = localeEntries

export const LOCALE_REGISTRY = Object.freeze(localeEntries.map(locale => ({
  code: locale.code,
  isDefault: locale.isDefault,
  routePrefix: locale.routePrefix,
  localeRoot: locale.localeRoot,
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
})))

export function getLocaleConfig(localeCode) {
  return LANG_CONFIG[localeCode]
}
