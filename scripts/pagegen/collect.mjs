import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'
import { marked } from 'marked'

export async function collectPosts(lang, options = {}) {
  if (!lang || !lang.contentDir) {
    throw new Error('collectPosts: missing language configuration')
  }

  const cacheEnabled = !options.disableCache
  const cacheDir = options.cacheDir || path.join(process.cwd(), 'data')
  const concurrency = Math.max(1, Number(options.concurrency || process.env.PAGEGEN_CONCURRENCY || 8))

  if (!(await pathExists(lang.contentDir))) {
    return { list: [], meta: createEmptyMeta(), stats: createStats(0) }
  }

  const files = await globby('**/index.md', { cwd: lang.contentDir })
  const stats = createStats(files.length)

  const cachePath = path.join(cacheDir, `pagegen-cache.${lang.code || lang.manifestLocale || 'unknown'}.json`)
  const { cacheEntries, exists: cacheExists } = cacheEnabled ? await readCache(cachePath) : { cacheEntries: {}, exists: false }
  const nextCache = {}

  const results = new Array(files.length)
  const toParse = []

  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const absolute = path.join(lang.contentDir, file)
    const stat = await fs.stat(absolute)
    const signature = createSignature(stat)
    const cached = cacheEnabled ? cacheEntries[file] : null

    if (cacheEnabled && cached && signaturesEqual(cached.signature, signature) && cached.entry) {
      stats.cacheHits++
      nextCache[file] = cached
      if (cached.entry.status?.toLowerCase?.() !== 'draft') {
        results[index] = restoreEntry(cached.entry)
      }
      continue
    }

    stats.cacheMisses++
    toParse.push({ file, absolute, index, signature })
  }

  stats.parsedFiles = toParse.length

  await runWithConcurrency(concurrency, toParse, async item => {
    const raw = await fs.readFile(item.absolute, 'utf8')
    const { data, content } = matter(raw)

    const status = pickField(lang.contentFields?.status, data)?.toLowerCase?.()
    if (status === 'draft') {
      nextCache[item.file] = { signature: item.signature, entry: { status: data.status } }
      return
    }

    const posix = item.file.replace(/\\/g, '/')
    const without = posix.includes('/') ? posix.substring(0, posix.lastIndexOf('/')) : ''
    const url = (lang.basePath || '/') + (without ? `${without}/` : '')

    const date = ymd(data.date)
    const updated = ymd(data.updated)
    const categoryValue = pickField(lang.contentFields?.category, data) || 'Uncategorized'
    const tagsValue = toArray(pickField(lang.contentFields?.tags, data))
    const seriesValue = pickField(lang.contentFields?.series, data)
    const seriesSlug = slug(pickField(lang.contentFields?.seriesSlug, data) || seriesValue || '')
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

    results[item.index] = entry
    if (cacheEnabled) {
      nextCache[item.file] = { signature: item.signature, entry }
    }
  })

  stats.cacheDisabled = !cacheEnabled

  const list = results.filter(Boolean)

  list.sort((a, b) => (b.updated || b.date).localeCompare(a.updated || a.date))
  const meta = buildMeta(list)
  if (cacheEnabled) {
    await writeCache(cachePath, nextCache)
  } else if (cacheExists) {
    await fs.rm(cachePath, { force: true })
  }
  return { list, meta, stats }
}

export function toExcerpt(md) {
  const html = marked.parse((md || '').split('\n\n')[0] || '')
  return String(html).replace(/<[^>]+>/g, '').slice(0, 180)
}

export function ymd(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

export function slug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

export function toArray(input) {
  if (Array.isArray(input)) return input
  if (!input) return []
  if (typeof input === 'string') return input.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  return []
}

function pickField(names, data = {}) {
  if (Array.isArray(names)) {
    for (const key of names) {
      if (key in data && data[key] != null) return data[key]
    }
    return null
  }
  if (typeof names === 'string') return data[names]
  return null
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function createEmptyMeta() {
  return { byCategory: {}, bySeries: {}, byTag: {}, byYear: {}, all: [] }
}

function buildMeta(list) {
  const meta = createEmptyMeta()
  meta.all = list

  for (const post of list) {
    ;(meta.byCategory[post.category] ||= []).push(post)
    if (post.series) (meta.bySeries[post.series_slug || slug(post.series)] ||= []).push(post)
    for (const tag of post.tags || []) (meta.byTag[tag] ||= []).push(post)
    const y = (post.updated || post.date).slice(0, 4)
    if (y) (meta.byYear[y] ||= []).push(post)
  }

  return meta
}

export { pickField }

function createSignature(stat) {
  return {
    mtimeMs: Number(stat.mtimeMs),
    size: Number(stat.size)
  }
}

function signaturesEqual(a = {}, b = {}) {
  return Number(a?.mtimeMs) === Number(b?.mtimeMs) && Number(a?.size) === Number(b?.size)
}

async function readCache(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return { cacheEntries: parsed?.files || {}, exists: true }
  } catch {
    return { cacheEntries: {}, exists: false }
  }
}

async function writeCache(filePath, cacheEntries) {
  const payload = JSON.stringify({ files: cacheEntries }, null, 2)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, payload)
}

function restoreEntry(entry) {
  return { ...entry, tags: Array.isArray(entry.tags) ? [...entry.tags] : [] }
}

function createStats(totalFiles) {
  return {
    totalFiles,
    parsedFiles: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheDisabled: false
  }
}

async function runWithConcurrency(limit, items, handler) {
  if (!items.length) return
  const poolSize = Math.min(limit, items.length)
  const workers = []
  let cursor = 0

  for (let i = 0; i < poolSize; i++) {
    workers.push(
      (async function worker() {
        while (cursor < items.length) {
          const current = items[cursor++]
          await handler(current)
        }
      })()
    )
  }

  await Promise.all(workers)
}
