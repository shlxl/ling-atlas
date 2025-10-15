import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'
import { marked } from 'marked'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  DEFAULT_LOCALE,
  DOCS_DIR as DOCS,
  GENERATED_ROOT as GEN,
  PUBLIC_ROOT as PUB,
  LANG_CONFIG,
  LANGUAGES
} from './pagegen.locales.mjs'

export {
  DEFAULT_LOCALE,
  LOCALE_REGISTRY,
  LANG_CONFIG,
  LANGUAGES,
  ROOT_DIR,
  DOCS_DIR,
  GENERATED_ROOT,
  PUBLIC_ROOT,
  getLocaleConfig
} from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let tagAlias = {}
let i18nPairs = new Map()
let navManifest = new Map()

const TAXONOMY_TYPES = ['categories', 'series', 'archive']

function createInitialTaxonomyGroups() {
  return Object.fromEntries(
    TAXONOMY_TYPES.map(type => [type, { groups: new Set(), slugIndex: new Map(), postIndex: new Map() }])
  )
}

let taxonomyGroups = createInitialTaxonomyGroups()
let tagGroups = new Map()

const siteOrigin = process.env.SITE_ORIGIN || 'https://example.com'

async function main() {
  await fs.mkdir(GEN, { recursive: true })
  await fs.mkdir(PUB, { recursive: true })

  i18nPairs = new Map()
  navManifest = new Map()
  taxonomyGroups = createInitialTaxonomyGroups()
  tagGroups = new Map()

  tagAlias = await loadTagAlias()
  await syncLocalizedContent()

  for (const lang of LANGUAGES) {
    ensureNavManifest(lang.code)
    const posts = await collectPosts(lang)
    await fs.writeFile(lang.outMeta, JSON.stringify(posts.meta, null, 2))

    await writeCollections(lang, posts.meta)
    await genRSS(lang, posts.list)
    await genSitemap(lang, posts.list)
    collectI18nPairs(posts.list, lang)
  }

  flushTaxonomyGroups()
  flushTagGroups()
  await writeI18nMap()
  await writeNavManifests()

  console.log('✔ pagegen 完成')
}

function isMain(moduleUrl) {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return moduleUrl === pathToFileURL(path.resolve(entry)).href
  } catch {
    return false
  }
}

if (isMain(import.meta.url)) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

function toExcerpt(md) {
  const html = marked.parse((md || '').split('\n\n')[0] || '')
  return String(html).replace(/<[^>]+>/g, '').slice(0, 180)
}

function ymd(value) {
  return value?.slice(0, 10) || ''
}

function slug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

function canonicalTag(tag) {
  if (!tag) return ''
  const direct = tagAlias?.[tag]
  if (direct) return slug(direct)
  const lowered = tag.toLowerCase?.()
  if (lowered && tagAlias?.[lowered]) return slug(tagAlias[lowered])
  return slug(tag)
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function syncLocalizedContent() {
  for (const lang of LANGUAGES) {
    if (!(await exists(lang.contentDir))) continue
    if (lang.isDefault) {
      const target = path.join(DOCS, 'content')
      if (target === lang.contentDir) continue
      await fs.rm(target, { recursive: true, force: true })
      await fs.cp(lang.contentDir, target, { recursive: true })
      continue
    }
    const localeRoot = path.join(DOCS, lang.code)
    const target = path.join(localeRoot, 'content')
    await fs.mkdir(localeRoot, { recursive: true })
    await fs.rm(target, { recursive: true, force: true })
    await fs.cp(lang.contentDir, target, { recursive: true })
  }
}

async function collectPosts(lang) {
  const list = []
  const meta = { byCategory: {}, bySeries: {}, byTag: {}, byYear: {}, all: [] }
  if (!(await exists(lang.contentDir))) return { list, meta }

  const files = await globby('**/index.md', { cwd: lang.contentDir })
  for (const file of files) {
    const raw = await fs.readFile(path.join(lang.contentDir, file), 'utf8')
    const { data, content } = matter(raw)
    const status = pickField(lang.contentFields.status, data)?.toLowerCase?.()
    if (status === 'draft') continue

    const posix = file.replace(/\\/g, '/')
    const without = posix.includes('/') ? posix.substring(0, posix.lastIndexOf('/')) : ''
    const url = lang.basePath + (without ? `${without}/` : '')

    const date = ymd(data.date)
    const updated = ymd(data.updated)
    const categoryValue = pickField(lang.contentFields.category, data) || 'Uncategorized'
    const tagsValue = toArray(pickField(lang.contentFields.tags, data))
    const seriesValue = pickField(lang.contentFields.series, data)
    const seriesSlug = slug(pickField(lang.contentFields.seriesSlug, data) || seriesValue || '')
    const categorySlug = slug(categoryValue)
    const year = (updated || date)?.slice(0, 4) || ''

    const entry = {
      title: data.title,
      date,
      updated,
      status: data.status,
      category: categoryValue,
      category_slug: categorySlug,
      series: seriesValue,
      series_slug: seriesSlug,
      tags: tagsValue,
      slug: data.slug,
      path: url,
      excerpt: data.excerpt || toExcerpt(content),
      relative: without,
      year
    }

    list.push(entry)
  }

  list.sort((a, b) => (b.updated || b.date).localeCompare(a.updated || a.date))
  meta.all = list

  for (const post of list) {
    ;(meta.byCategory[post.category] ||= []).push(post)
    if (post.series) (meta.bySeries[post.series_slug || slug(post.series)] ||= []).push(post)
    for (const tag of post.tags) (meta.byTag[tag] ||= []).push(post)
    const y = (post.updated || post.date).slice(0, 4)
    if (y) (meta.byYear[y] ||= []).push(post)
  }

  return { list, meta }
}

function pickField(names, data) {
  if (Array.isArray(names)) {
    for (const key of names) {
      if (key in data && data[key] != null) return data[key]
    }
    return null
  }
  return data[names]
}

function toArray(input) {
  if (Array.isArray(input)) return input
  if (!input) return []
  if (typeof input === 'string') return input.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  return []
}

function mdList(items, lang) {
  return items
    .map(post => {
      const updated = post.updated ? (lang.code === 'en' ? ` (updated: ${post.updated})` : `（更:${post.updated}）`) : ''
      const excerptLine = post.excerpt ? `> ${post.excerpt}` : ''
      const dateText = lang.code === 'en' ? ` · ${post.date || post.updated}` : ` · ${post.date}`
      return `- [${post.title}](${post.path})${dateText}${updated}\n  ${excerptLine}`
    })
    .join('\n\n')
}

async function writeCollections(lang, meta) {
  const write = async (subdir, name, title, items) => {
    const outDir = path.join(lang.generatedDir, subdir, name)
    await fs.mkdir(outDir, { recursive: true })
    const md = `---\ntitle: ${title}\n---\n\n${mdList(items, lang)}\n`
    await fs.writeFile(path.join(outDir, 'index.md'), md)
  }

  for (const [category, items] of Object.entries(meta.byCategory)) {
    const categorySlug = slug(category)
    await write('categories', categorySlug, lang.labels.category(category), items)
    registerNavEntry('categories', lang, categorySlug)
  }
  for (const [series, items] of Object.entries(meta.bySeries)) {
    await write('series', series, lang.labels.series(series), items)
    registerNavEntry('series', lang, series)
  }
  for (const [tag, items] of Object.entries(meta.byTag)) {
    const tagSlug = slug(tag)
    await write('tags', tagSlug, lang.labels.tag(tag), items)
    registerNavEntry('tags', lang, tagSlug)
  }
  for (const [year, items] of Object.entries(meta.byYear)) {
    await write('archive', year, lang.labels.archive(year), items)
    registerNavEntry('archive', lang, year)
  }
}

async function genRSS(lang, items) {
  if (!items.length) return
  const feed = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"><channel>`,
    `<title>${escapeXml(lang.labels.rssTitle)}</title>`,
    `<link>${siteOrigin}${lang.localeRoot}</link>`,
    `<description>${escapeXml(lang.labels.rssDesc)}</description>`
  ]

  for (const post of items.slice(0, 50)) {
    feed.push(
      `<item><title>${escapeXml(post.title)}</title>` +
        `<link>${siteOrigin}${post.path}</link>` +
        `<pubDate>${new Date(post.updated || post.date).toUTCString()}</pubDate>` +
        `<description>${escapeXml(post.excerpt || '')}</description></item>`
    )
  }
  feed.push(`</channel></rss>`)
  await fs.writeFile(path.join(PUB, lang.rssFile), feed.join(''))
}

async function genSitemap(lang, items) {
  if (!items.length) return
  const urls = items
    .map(post => `<url><loc>${siteOrigin}${post.path}</loc><lastmod>${post.updated || post.date}</lastmod></url>`)
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  await fs.writeFile(path.join(PUB, lang.sitemapFile), xml)
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
}

function collectI18nPairs(list, lang) {
  for (const post of list) {
    if (!post.relative) continue

    registerI18nEntry(post.relative, lang.code, post.path)

    if (post.category_slug)
      registerSingleTaxonomy('categories', lang, post.category_slug, post.relative)

    if (post.series_slug)
      registerSingleTaxonomy('series', lang, post.series_slug, post.relative)

    if (post.year)
      registerSingleTaxonomy('archive', lang, post.year, post.relative)

    for (const tag of post.tags || []) {
      const tagSlug = slug(tag)
      if (!tagSlug) continue
      const canonical = canonicalTag(tag)
      registerTagGroup(canonical, {
        localeCode: lang.code,
        slug: tagSlug,
        path: taxonomyPath('tags', tagSlug, lang)
      })
    }
  }
}

function registerI18nEntry(key, localeCode, pathValue) {
  if (!key || !localeCode || !pathValue) return
  const entry = i18nPairs.get(key) || {}
  entry[localeCode] = pathValue
  i18nPairs.set(key, entry)
}

function taxonomyPath(type, slugValue, lang) {
  if (!slugValue) return ''
  return `${lang.generatedPathPrefix}/${type}/${slugValue}/`
}

function registerSingleTaxonomy(type, lang, slugValue, relative) {
  if (!slugValue) return
  const info = taxonomyGroups[type]
  if (!info) return

  const slugKey = `${lang.code}|${slugValue}`
  let group = info.slugIndex.get(slugKey)
  if (!group) {
    group = { entries: new Map() }
    info.groups.add(group)
    info.slugIndex.set(slugKey, group)
  }

  group.entries.set(lang.code, {
    slug: slugValue,
    path: taxonomyPath(type, slugValue, lang)
  })

  if (relative != null) {
    const postKey = `${relative}|${type}`
    const existing = info.postIndex.get(postKey)
    if (existing && existing !== group) {
      mergeTaxonomyGroups(info, existing, group)
    } else {
      info.postIndex.set(postKey, group)
    }
  }
}

function mergeTaxonomyGroups(info, target, source) {
  if (target === source) return target

  for (const [localeCode, value] of source.entries) {
    if (!target.entries.has(localeCode)) target.entries.set(localeCode, value)
    info.slugIndex.set(`${localeCode}|${value.slug}`, target)
  }

  for (const [key, group] of info.postIndex.entries()) {
    if (group === source) info.postIndex.set(key, target)
  }

  info.groups.delete(source)
  return target
}

function registerTagGroup(canonicalId, { localeCode, slug, path }) {
  if (!canonicalId || !localeCode || !slug || !path) return
  let group = tagGroups.get(canonicalId)
  if (!group) {
    group = { entries: new Map() }
    tagGroups.set(canonicalId, group)
  }
  group.entries.set(localeCode, { slug, path })
}

function flushTaxonomyGroups() {
  for (const type of TAXONOMY_TYPES) {
    const info = taxonomyGroups[type]
    if (!info) continue
    for (const group of info.groups) {
      const localePaths = Object.fromEntries([...group.entries].map(([loc, value]) => [loc, value.path]))
      for (const [, value] of group.entries) {
        registerI18nGroupEntry(`${type}/${value.slug}`, localePaths)
      }
    }
  }
}

function flushTagGroups() {
  for (const group of tagGroups.values()) {
    const localePaths = Object.fromEntries([...group.entries].map(([loc, value]) => [loc, value.path]))
    for (const [, value] of group.entries) {
      registerI18nGroupEntry(`tags/${value.slug}`, localePaths)
    }
  }
}

function registerI18nGroupEntry(key, localePaths) {
  if (!key) return
  const existing = i18nPairs.get(key) || {}
  for (const [loc, pathValue] of Object.entries(localePaths)) {
    if (pathValue) existing[loc] = pathValue
  }
  i18nPairs.set(key, existing)
}

async function writeI18nMap() {
  const out = {}
  for (const [key, value] of i18nPairs.entries()) {
    const locales = Object.keys(value || {})
    if (locales.length < 2) continue
    out[key] = value
  }
  await fs.writeFile(path.join(PUB, 'i18n-map.json'), JSON.stringify(out, null, 2))
}

async function loadTagAlias() {
  try {
    const raw = await fs.readFile(path.join(__dirname, '..', 'schema', 'tag-alias.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function ensureNavManifest(localeCode) {
  if (navManifest.has(localeCode)) return navManifest.get(localeCode)
  const manifest = {
    locale: localeCode,
    categories: new Map(),
    series: new Map(),
    tags: new Map(),
    archive: new Map()
  }
  navManifest.set(localeCode, manifest)
  return manifest
}

function registerNavEntry(type, lang, slugValue) {
  if (!slugValue) return
  const manifest = ensureNavManifest(lang.code)
  const target = taxonomyPath(type, slugValue, lang)
  if (!target) return
  if (!manifest[type] || !(manifest[type] instanceof Map)) return
  manifest[type].set(slugValue, target)
}

async function writeNavManifests() {
  await cleanupLegacyNavManifests()
  for (const lang of LANGUAGES) {
    const manifest = ensureNavManifest(lang.code)
    const serialize = map => Object.fromEntries(map.entries())
    const payload = {
      locale: lang.code,
      vitepressLocaleKey: lang.vitepressLocaleKey,
      categories: serialize(manifest.categories),
      series: serialize(manifest.series),
      tags: serialize(manifest.tags),
      archive: serialize(manifest.archive)
    }
    const json = `${JSON.stringify(payload, null, 2)}\n`
    const file = lang.navManifestFile
    await fs.writeFile(path.join(GEN, file), json)
    await fs.writeFile(path.join(PUB, file), json)
  }
}

async function cleanupLegacyNavManifests() {
  const legacyFiles = ['nav.manifest.root.json']
  for (const dir of [GEN, PUB]) {
    for (const file of legacyFiles) {
      try {
        await fs.rm(path.join(dir, file), { force: true })
      } catch {}
    }
  }
}
