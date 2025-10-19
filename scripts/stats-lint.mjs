import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { globby } from 'globby'
import matter from 'gray-matter'
import { LANGUAGES } from './pagegen.locales.mjs'
import { pickField } from './pagegen/collect.mjs'

export async function collectStats(locales = LANGUAGES) {
  const results = []

  for (const locale of locales) {
    const contentDir = locale?.contentDir
    if (!contentDir) continue
    const files = await globby('**/index.md', { cwd: contentDir, absolute: true })
    const categories = new Map()
    const tags = new Map()

    for (const filePath of files) {
      const { data } = matter(await fs.readFile(filePath, 'utf8'))
      const category = normalizeCategory(pickField(locale.contentFields?.category, data))
      if (category) {
        categories.set(category, (categories.get(category) || 0) + 1)
      }
      for (const t of normalizeTags(pickField(locale.contentFields?.tags, data))) {
        tags.set(t, (tags.get(t) || 0) + 1)
      }
    }

    results.push({
      locale: locale.code,
      categories,
      tags
    })
  }

  return results
}

function printStats(stats) {
  for (const entry of stats) {
    console.log(`[${entry.locale}] 分类Top5：`, toTopEntries(entry.categories, 5))
    console.log(`[${entry.locale}] 标签Top10：`, toTopEntries(entry.tags, 10))
  }
}

async function main() {
  const stats = await collectStats()
  printStats(stats)
  await writeSnapshot(stats)
}

const executedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (executedDirectly) {
  main().catch(error => {
    console.error('[stats-lint] failed:', error)
    process.exitCode = 1
  })
}

function normalizeCategory(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function normalizeTags(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，]/)
      .map(item => item.trim())
      .filter(Boolean)
  }
  return []
}

function toTopEntries(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

async function writeSnapshot(stats) {
  const payload = stats.map(entry => ({
    locale: entry.locale,
    categories: Object.fromEntries(entry.categories.entries()),
    tags: Object.fromEntries(entry.tags.entries())
  }))

  const filePath = path.join(process.cwd(), 'data', 'stats.snapshot.json')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify({ generatedAt: new Date().toISOString(), locales: payload }, null, 2))
  console.log(`[stats-lint] snapshot written to ${path.relative(process.cwd(), filePath)}`)
}

export const __test__ = {
  normalizeCategory,
  normalizeTags,
  toTopEntries,
  printStats,
  writeSnapshot
}
