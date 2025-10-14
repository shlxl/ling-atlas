import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'
import { marked } from 'marked'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS = path.join(__dirname, '..', 'docs')
const GEN = path.join(DOCS, '_generated')
const PUB = path.join(DOCS, 'public')

await fs.mkdir(GEN, { recursive: true })
await fs.mkdir(PUB, { recursive: true })

const LANG_CONFIG = [
  {
    code: 'zh',
    contentDir: path.join(DOCS, 'content'),
    outMeta: path.join(GEN, 'meta.json'),
    basePath: '/content/',
    genPrefix: '',
    rssFile: 'rss.xml',
    sitemapFile: 'sitemap.xml',
    labels: {
      category: (value) => `分类 · ${value}`,
      series: (value) => `连载 · ${value}`,
      tag: (value) => `标签 · ${value}`,
      archive: (value) => `归档 · ${value}`,
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
  {
    code: 'en',
    contentDir: path.join(DOCS, 'content.en'),
    outMeta: path.join(GEN, 'meta.en.json'),
    basePath: '/en/content/',
    genPrefix: 'en',
    rssFile: 'rss-en.xml',
    sitemapFile: 'sitemap-en.xml',
    labels: {
      category: (value) => `Category · ${value}`,
      series: (value) => `Series · ${value}`,
      tag: (value) => `Tag · ${value}`,
      archive: (value) => `Archive · ${value}`,
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
]

const i18nPairs = new Map()

await syncEnglishContent()

const siteOrigin = process.env.SITE_ORIGIN || 'https://example.com'

for (const lang of LANG_CONFIG) {
  const posts = await collectPosts(lang)
  await fs.writeFile(lang.outMeta, JSON.stringify(posts.meta, null, 2))

  await writeCollections(lang, posts.meta)
  await genRSS(lang, posts.list)
  await genSitemap(lang, posts.list)
  collectI18nPairs(posts.list, lang.code)
}

await writeI18nMap()

console.log('✔ pagegen 完成')

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

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function syncEnglishContent() {
  const source = path.join(DOCS, 'content.en')
  if (!(await exists(source))) return
  const target = path.join(DOCS, 'en', 'content')
  await fs.mkdir(path.join(DOCS, 'en'), { recursive: true })
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(source, target, { recursive: true })
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

    const entry = {
      title: data.title,
      date,
      updated,
      status: data.status,
      category: categoryValue,
      series: seriesValue,
      series_slug: seriesSlug,
      tags: tagsValue,
      slug: data.slug,
      path: url,
      excerpt: data.excerpt || toExcerpt(content),
      relative: without
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
  const prefix = lang.genPrefix ? path.join(lang.genPrefix) : ''

  const write = async (subdir, name, title, items) => {
    const outDir = path.join(GEN, prefix, subdir, name)
    await fs.mkdir(outDir, { recursive: true })
    const md = `---\ntitle: ${title}\n---\n\n${mdList(items, lang)}\n`
    await fs.writeFile(path.join(outDir, 'index.md'), md)
  }

  for (const [category, items] of Object.entries(meta.byCategory))
    await write('categories', slug(category), lang.labels.category(category), items)
  for (const [series, items] of Object.entries(meta.bySeries))
    await write('series', series, lang.labels.series(series), items)
  for (const [tag, items] of Object.entries(meta.byTag))
    await write('tags', slug(tag), lang.labels.tag(tag), items)
  for (const [year, items] of Object.entries(meta.byYear))
    await write('archive', year, lang.labels.archive(year), items)
}

async function genRSS(lang, items) {
  if (!items.length) return
  const feed = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"><channel>`,
    `<title>${escapeXml(lang.labels.rssTitle)}</title>`,
    `<link>${siteOrigin}${lang.code === 'en' ? '/en/' : '/'}</link>`,
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

function collectI18nPairs(list, locale) {
  for (const post of list) {
    if (!post.relative) continue
    const bucket = i18nPairs.get(post.relative) || {}
    bucket[locale] = post.path
    i18nPairs.set(post.relative, bucket)
  }
}

async function writeI18nMap() {
  if (!i18nPairs.size) return
  const out = {}
  for (const [key, value] of i18nPairs.entries()) {
    out[key] = value
  }
  await fs.writeFile(path.join(PUB, 'i18n-map.json'), JSON.stringify(out, null, 2))
}
