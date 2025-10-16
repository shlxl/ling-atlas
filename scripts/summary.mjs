#!/usr/bin/env node

/**
 * 摘要生成占位实现：优先使用 frontmatter.excerpt，其次使用正文首段。
 * 如需接入本地 LLM，可在 `generateSummary` 中替换逻辑。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globby } from 'globby'
import matter from 'gray-matter'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const preferredLocale = getPreferredLocale()
const preferredLocaleConfig =
  LOCALE_REGISTRY.find(locale => locale.code === preferredLocale) || LOCALE_REGISTRY[0]

if (!preferredLocaleConfig) {
  console.warn('[summary] no locale configuration available, skipping generation')
  process.exit(0)
}

const CONTENT_DIR = preferredLocaleConfig.contentDir
const BASE_PATH = preferredLocaleConfig.basePath
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'summaries.json')

function isDraft(frontmatter) {
  const { status, draft } = frontmatter || {}
  if (typeof draft === 'boolean') return draft
  if (typeof status === 'string') return status.toLowerCase() === 'draft'
  return false
}

function toPlainText(markdown) {
  return markdown
    .replace(/^>\s+/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_~#>]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getFirstParagraph(content) {
  const normalized = content.trim()
  if (!normalized) return ''
  const segments = normalized.split(/\r?\n\r?\n/)
  const firstBlock = segments.find(block => block.trim().length > 0) || ''
  return toPlainText(firstBlock)
}

function generateSummary(frontmatter, content) {
  if (frontmatter?.excerpt) return String(frontmatter.excerpt)
  const firstParagraph = getFirstParagraph(content)
  if (!firstParagraph) return ''
  const sentences = firstParagraph.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(Boolean)
  if (sentences.length === 0) return firstParagraph.slice(0, 120)
  const summary = sentences.slice(0, 2).join(' ')
  return summary.length > 160 ? summary.slice(0, 157) + '…' : summary
}

function buildUrl(mdPath) {
  const relative = path.relative(CONTENT_DIR, mdPath).replace(/\\/g, '/')
  const dir = relative.replace(/\/index\.md$/, '')
  return dir ? `${BASE_PATH}${dir}/` : BASE_PATH
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function main() {
  const files = await globby('**/index.md', { cwd: CONTENT_DIR, absolute: true })
  const items = []

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const { data, content } = matter(raw)
    if (isDraft(data)) continue
    const summary = generateSummary(data, content)
    if (!summary) continue
    const title = String(data.title || '').trim()
    if (!title) continue
    const url = buildUrl(file)
    items.push({ url, title, summary })
  }

  await ensureDir(OUTPUT_DIR)
  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        items: items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
      },
      null,
      2
    ),
    'utf8'
  )
  console.log(`summaries.json 写入 ${items.length} 条`)
}

main().catch(err => {
  console.error('[summary] failed:', err)
  process.exitCode = 1
})
