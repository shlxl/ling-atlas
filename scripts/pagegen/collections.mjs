import fs from 'node:fs/promises'
import path from 'node:path'
import { slug } from './collect.mjs'

export async function writeCollections(lang, meta, writer, options = {}) {
  const dryRun = Boolean(options.dryRun)
  const navEntries = {
    categories: new Map(),
    series: new Map(),
    tags: new Map(),
    archive: new Map()
  }

  const stage = `collections`

  const write = async (subdir, name, title, items) => {
    const outDir = path.join(lang.generatedDir, subdir, name)
    const md = `---\ntitle: ${title}\n---\n\n${mdList(items, lang)}\n`
    if (writer && !dryRun) {
      writer.addFileTask({
        stage,
        locale: lang.manifestLocale,
        target: path.join(outDir, 'index.md'),
        content: md
      })
    }
    if (!writer && !dryRun) {
      await fs.mkdir(outDir, { recursive: true })
      await fs.writeFile(path.join(outDir, 'index.md'), md)
    }
    return outDir
  }

  for (const [category, items] of Object.entries(meta.byCategory || {})) {
    const categorySlug = slug(category)
    await write('categories', categorySlug, lang.labels.category(category), items)
    navEntries.categories.set(categorySlug, taxonomyPath('categories', categorySlug, lang))
  }

  for (const [series, items] of Object.entries(meta.bySeries || {})) {
    const seriesSlug = series
    await write('series', seriesSlug, lang.labels.series(series), items)
    navEntries.series.set(seriesSlug, taxonomyPath('series', seriesSlug, lang))
  }

  for (const [tag, items] of Object.entries(meta.byTag || {})) {
    const tagSlug = slug(tag)
    await write('tags', tagSlug, lang.labels.tag(tag), items)
    navEntries.tags.set(tagSlug, taxonomyPath('tags', tagSlug, lang))
  }

  for (const [year, items] of Object.entries(meta.byYear || {})) {
    await write('archive', year, lang.labels.archive(year), items)
    navEntries.archive.set(year, taxonomyPath('archive', year, lang))
  }

  return navEntries
}

function mdList(items = [], lang) {
  return items
    .map(post => {
      const updated = post.updated ? (lang.code === 'en' ? ` (updated: ${post.updated})` : `（更:${post.updated}）`) : ''
      const excerptLine = post.excerpt ? `> ${post.excerpt}` : ''
      const dateText = lang.code === 'en' ? ` · ${post.date || post.updated}` : ` · ${post.date}`
      return `- [${post.title}](${post.path})${dateText}${updated}\n  ${excerptLine}`
    })
    .join('\n\n')
}

function taxonomyPath(type, slugValue, lang) {
  if (!slugValue) return ''
  const base = lang.localeRoot === '/' ? '' : lang.localeRoot.replace(/\/$/, '')
  return `${base}/_generated/${type}/${slugValue}/`
}
