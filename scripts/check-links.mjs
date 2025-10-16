import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'

const ROOT = process.cwd()
const DOCS_DIR = path.join(ROOT, 'docs')
const GENERATED_DIR = path.join(ROOT, 'docs/_generated')
const DIST_DIR = path.join(ROOT, 'docs/.vitepress/dist')
let distReady = false
const INTERNAL_PREFIXES = ['/', './', '../']
const ROOT_LOCALE = 'zh'
const FALLBACK_LOCALE_PREFIXES = [
  { locale: 'zh', prefix: '/zh/' },
  { locale: 'en', prefix: '/en/' }
]

const LOCALE_SEARCH_ROOTS = new Map([
  [
    'zh',
    {
      docDirs: [path.join(DOCS_DIR, 'zh')],
      generatedDirs: [path.join(DOCS_DIR, 'zh/_generated')],
      contentDirs: [path.join(DOCS_DIR, 'zh/content')]
    }
  ],
  [
    'en',
    {
      docDirs: [path.join(DOCS_DIR, 'en')],
      generatedDirs: [path.join(DOCS_DIR, 'en/_generated')],
      contentDirs: [path.join(DOCS_DIR, 'en/content')]
    }
  ]
])

let localePrefixes = [...FALLBACK_LOCALE_PREFIXES, { locale: ROOT_LOCALE, prefix: '/' }]
const CONTENT_CACHE = new Map()
const DEFAULT_MANIFESTS = [
  {
    locale: 'zh',
    files: [
      path.join(DOCS_DIR, 'zh/_generated/nav.manifest.zh.json'),
      path.join(GENERATED_DIR, 'nav.manifest.zh.json'),
      path.join(GENERATED_DIR, 'nav.manifest.root.json')
    ]
  },
  {
    locale: 'en',
    files: [
      path.join(DOCS_DIR, 'en/_generated/nav.manifest.en.json'),
      path.join(GENERATED_DIR, 'nav.manifest.en.json')
    ]
  }
]

function isInternalLink(url) {
  return INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix)) && !url.startsWith('http')
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizeInternal(url) {
  if (url.startsWith('/')) return url
  return '/' + url.replace(/^\.\//, '')
}

function stripLocalePrefix(url) {
  for (const { locale, prefix } of localePrefixes) {
    if (!prefix) continue
    const sliceIndex = prefix === '/' ? 1 : prefix.length
    if (prefix === '/') {
      if (!url.startsWith('/')) continue
      return { relative: url.slice(sliceIndex), locale }
    }
    if (url.startsWith(prefix)) {
      return { relative: url.slice(sliceIndex), locale }
    }
  }

  if (url.startsWith('/')) return { relative: url.slice(1), locale: ROOT_LOCALE }
  return { relative: url.replace(/^\/+/, ''), locale: ROOT_LOCALE }
}

async function validateInternalLink(url, filePath) {
  const normalized = normalizeInternal(url)
  if (normalized.endsWith('.html')) {
    if (!distReady) return true
    const distPath = path.join(DIST_DIR, normalized.replace(/\/$/, ''))
    if (await fileExists(distPath)) return true
    if (await fileExists(distPath + '/index.html')) return true
    return `${normalized} (from ${filePath}) -> dist file missing`
  }

  const clean = normalized.replace(/#.+$/, '')
  if (clean === '/' || clean === '') return true
  const { relative, locale } = stripLocalePrefix(clean)
  const normalizedRelative = relative.replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '')
  const contentRelative = normalizedRelative.replace(/^content\//, '')

  const searchCombos = [{ base: DOCS_DIR, rel: normalizedRelative }]

  const localeRoots = LOCALE_SEARCH_ROOTS.get(locale)
  if (localeRoots) {
    for (const docDir of localeRoots.docDirs ?? []) {
      searchCombos.push({ base: docDir, rel: normalizedRelative })
    }
    if (contentRelative) {
      for (const contentDir of localeRoots.contentDirs ?? []) {
        searchCombos.push({ base: contentDir, rel: contentRelative })
      }
    }
    if (normalizedRelative.startsWith('_generated/')) {
      const generatedRelative = normalizedRelative.replace(/^_generated\/?/, '')
      for (const generatedDir of localeRoots.generatedDirs ?? []) {
        searchCombos.push({ base: generatedDir, rel: generatedRelative })
      }
    }
  }

  for (const combo of searchCombos) {
    if (!combo.rel) continue
    const mdBase = path.join(combo.base, combo.rel)
    if (await fileExists(mdBase + '.md')) return true
    if (await fileExists(path.join(mdBase, 'index.md'))) return true
  }

  const generatedMatch = normalizedRelative.match(/^_generated\/([^/]+)\/([^/]+)\/?$/)
  if (generatedMatch) {
    const [, type, rawSlug] = generatedMatch
    const slugValue = decodeURIComponent(rawSlug)
    const backed = await hasBackingContent(locale, type, slugValue)
    if (backed) return true
  }

  const candidateDist = path.join(DIST_DIR, clean)
  if (distReady) {
    if (await fileExists(candidateDist)) return true
    if (await fileExists(path.join(candidateDist, 'index.html'))) return true
  }

  return `${normalized} (from ${filePath}) -> target not found`
}

async function checkFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8')
  const regex = /\[[^\]]+\]\(([^)]+)\)/g
  const errors = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const url = match[1]
    if (url.startsWith('http')) continue
    if (!isInternalLink(url)) continue
    const result = await validateInternalLink(url, path.relative(ROOT, filePath))
    if (result !== true) errors.push(result)
  }
  return errors
}

async function main() {
  distReady = await fileExists(path.join(DIST_DIR, 'index.html'))
  const manifestInfos = await collectManifestInfos()
  localePrefixes = deriveLocalePrefixes(manifestInfos)

  const files = await globby(['docs/**/*.md', '!docs/en/_generated/**/*'], { cwd: ROOT })
  const errors = []
  for (const file of files) {
    const filePath = path.join(ROOT, file)
    const fileErrors = await checkFile(filePath)
    errors.push(...fileErrors)
  }
  const manifestErrors = await validateNavManifests(manifestInfos)
  errors.push(...manifestErrors)
  if (errors.length) {
    console.error('Link check failed:')
    errors.forEach(err => console.error(' -', err))
    process.exit(1)
  }
  console.log('Link check passed')
}

main().catch(err => {
  console.error('Link check script failed:', err)
  process.exit(1)
})

async function validateNavManifests(manifestInfos) {
  const allowedTypes = new Set(['categories', 'series', 'tags', 'archive'])
  const errors = []
  for (const manifestInfo of manifestInfos) {
    const payload = await readManifest(manifestInfo.file)
    if (!payload) continue
    for (const [type, entries] of Object.entries(payload)) {
      if (!allowedTypes.has(type)) continue
      if (typeof entries !== 'object' || !entries) continue
      for (const [slug, targetPath] of Object.entries(entries)) {
        if (typeof targetPath !== 'string' || !targetPath) continue
        const context = `nav.manifest.${manifestInfo.locale}.json [${type}:${slug}]`
        const result = await validateInternalLink(targetPath, context)
        if (result !== true) errors.push(result)
      }
    }
  }
  return errors
}

async function readManifest(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function collectManifestInfos() {
  const patterns = [
    'docs/_generated/nav.manifest.*.json',
    'docs/public/nav.manifest.*.json'
  ]
  const matches = await globby(patterns, { cwd: ROOT, absolute: true })
  const byLocale = new Map()

  for (const absolutePath of matches) {
    const locale = extractLocaleFromManifest(absolutePath)
    if (!byLocale.has(locale)) {
      byLocale.set(locale, { locale, file: absolutePath })
    }
  }

  for (const manifest of DEFAULT_MANIFESTS) {
    if (byLocale.has(manifest.locale)) continue
    for (const candidate of manifest.files) {
      if (!candidate) continue
      if (!(await fileExists(candidate))) continue
      byLocale.set(manifest.locale, { locale: manifest.locale, file: candidate })
      break
    }
  }

  return Array.from(byLocale.values())
}

function extractLocaleFromManifest(filePath) {
  const match = /nav\.manifest\.([^.]+)\.json$/i.exec(filePath)
  if (match && match[1]) {
    return match[1] === 'root' ? 'zh' : match[1]
  }
  return 'zh'
}

function deriveLocalePrefixes(manifestInfos) {
  const seen = new Map()

  for (const entry of FALLBACK_LOCALE_PREFIXES) {
    if (!entry?.locale || !entry?.prefix) continue
    const set = seen.get(entry.locale) ?? new Set()
    set.add(entry.prefix)
    seen.set(entry.locale, set)
  }

  for (const info of manifestInfos) {
    if (!info?.locale) continue
    const locale = info.locale
    const set = seen.get(locale) ?? new Set()
    if (locale === ROOT_LOCALE) {
      set.add('/')
    } else {
      set.add(`/${locale}/`)
    }
    seen.set(locale, set)
  }

  if (!seen.has(ROOT_LOCALE)) {
    seen.set(ROOT_LOCALE, new Set(['/']))
  }

  return Array.from(seen.entries())
    .flatMap(([locale, prefixes]) => Array.from(prefixes).map(prefix => ({ locale, prefix })))
    .sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0))
}

const LOCALE_CONTENT_FIELDS = {
  zh: {
    category: ['category_zh', 'category'],
    tags: ['tags_zh', 'tags'],
    series: ['series'],
    seriesSlug: ['series_slug'],
    contentDir: path.join(DOCS_DIR, 'zh/content')
  },
  en: {
    category: ['category_en', 'category'],
    tags: ['tags_en', 'tags'],
    series: ['series_en', 'series'],
    seriesSlug: ['series_slug_en', 'series_slug', 'series_en', 'series'],
    contentDir: path.join(DOCS_DIR, 'en/content')
  }
}

function slug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

function pickField(names, data) {
  if (!names) return undefined
  const list = Array.isArray(names) ? names : [names]
  for (const key of list) {
    if (key in data && data[key] != null) return data[key]
  }
  return undefined
}

function toArray(input) {
  if (Array.isArray(input)) return input
  if (typeof input === 'string') {
    return input
      .split(/[,，]/)
      .map(item => item.trim())
      .filter(Boolean)
  }
  return []
}

async function hasBackingContent(locale, type, slugValue) {
  if (!locale || !type || !slugValue) return false
  const index = await getContentIndex(locale)
  if (!index) return false

  const normalizedSlug = slug(slugValue)
  switch (type) {
    case 'categories':
      return index.categories.has(normalizedSlug)
    case 'series':
      return index.series.has(normalizedSlug)
    case 'tags':
      return index.tags.has(normalizedSlug)
    case 'archive':
      return index.archive.has(slugValue)
    default:
      return false
  }
}

async function getContentIndex(locale) {
  if (CONTENT_CACHE.has(locale)) return CONTENT_CACHE.get(locale)
  const fields = LOCALE_CONTENT_FIELDS[locale]
  if (!fields) {
    CONTENT_CACHE.set(locale, null)
    return null
  }

  const { contentDir } = fields
  if (!(await fileExists(contentDir))) {
    CONTENT_CACHE.set(locale, {
      categories: new Set(),
      series: new Set(),
      tags: new Set(),
      archive: new Set()
    })
    return CONTENT_CACHE.get(locale)
  }

  const files = await globby('**/index.md', { cwd: contentDir })
  const index = {
    categories: new Set(),
    series: new Set(),
    tags: new Set(),
    archive: new Set()
  }

  for (const relative of files) {
    const filePath = path.join(contentDir, relative)
    const raw = await fs.readFile(filePath, 'utf8')
    const { data } = matter(raw)

    const categoryValue = pickField(fields.category, data) || 'Uncategorized'
    if (categoryValue) {
      index.categories.add(slug(categoryValue))
    }

    const seriesValue = pickField(fields.series, data)
    if (seriesValue) {
      const seriesSlug = slug(pickField(fields.seriesSlug, data) || seriesValue)
      if (seriesSlug) index.series.add(seriesSlug)
    }

    const tagsValue = toArray(pickField(fields.tags, data))
    for (const tag of tagsValue) {
      const tagSlug = slug(tag)
      if (tagSlug) index.tags.add(tagSlug)
    }

    const updated = data.updated || data.date
    if (typeof updated === 'string' && updated.length >= 4) {
      index.archive.add(updated.slice(0, 4))
    }
  }

  CONTENT_CACHE.set(locale, index)
  return index
}
