#!/usr/bin/env node

/**
 * 方案B（占位实现）：扫描内容并导出文本，供前端或后续任务生成向量。
 * 若未来接入本地编码器，只需在 `buildItems` 中补充向量生成逻辑，并更新输出结构。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globby } from 'globby'
import matter from 'gray-matter'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'
import { createAiEventRecorder } from './ai/event-logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'embeddings.json')
const preferredLocale = getPreferredLocale()

const LANG_SOURCES = LOCALE_REGISTRY.map(locale => ({
  code: locale.code,
  dir: locale.contentDir,
  basePath: locale.basePath
})).sort((a, b) => {
  if (a.code === preferredLocale) return -1
  if (b.code === preferredLocale) return 1
  return a.code.localeCompare(b.code)
})

function isDraft(frontmatter) {
  const { status, draft } = frontmatter || {}
  if (typeof draft === 'boolean') return draft
  if (typeof status === 'string') return status.toLowerCase() === 'draft'
  return false
}

function toPlainText(markdown) {
  return markdown
    .replace(/^>\s+/gm, '') // blockquote
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/[*_~#>]/g, '') // emphasis/symbols
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // links
    .replace(/!\[(.*?)\]\((.*?)\)/g, '$1') // images
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractText(frontmatter, body) {
  if (frontmatter?.excerpt) return String(frontmatter.excerpt)
  const normalized = body.trim()
  if (!normalized) return ''
  const segments = normalized.split(/\r?\n\r?\n/)
  const firstBlock = segments.find(block => block.trim().length > 0) || ''
  return toPlainText(firstBlock)
}

function buildUrl(mdPath, source) {
  const relative = path.relative(source.dir, mdPath)
  const clean = relative.replace(/\\/g, '/')
  const dir = clean.replace(/\/index\.md$/, '')
  return dir ? `${source.basePath}${dir}/` : source.basePath
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function buildItems() {
  const items = []
  const localeSummaries = []

  for (const source of LANG_SOURCES) {
    if (!(await exists(source.dir))) {
      localeSummaries.push({ locale: source.code, status: 'missing', totalFiles: 0, included: 0 })
      continue
    }

    const files = await globby('**/index.md', { cwd: source.dir, absolute: true })
    let included = 0

    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8')
      const { data, content } = matter(raw)
      if (isDraft(data)) continue
      const url = buildUrl(file, source)
      const title = String(data.title || '').trim()
      if (!title) continue
      const text = extractText(data, content)
      if (!text) continue
      items.push({ url, title, text, lang: source.code })
      included += 1
    }

    localeSummaries.push({
      locale: source.code,
      status: included > 0 ? 'ok' : 'empty',
      totalFiles: files.length,
      included
    })
  }

  return {
    items: items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    locales: localeSummaries
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

const EMBED_ADAPTER = process.env.AI_EMBED_ADAPTER || 'placeholder'

function durationFrom(start) {
  const diff = process.hrtime.bigint() - start
  return Number(diff / 1000000n)
}

async function main() {
  const runLogger = createAiEventRecorder({ script: 'embed-build', namespace: 'ai.embed' })
  const started = process.hrtime.bigint()
  runLogger.record('ai.embed.started', {
    status: 'running',
    adapter: EMBED_ADAPTER,
    localesPlanned: LANG_SOURCES.length
  })

  try {
    const { items, locales } = await buildItems()
    await ensureDir(OUTPUT_DIR)
    const payload = {
      generatedAt: new Date().toISOString(),
      items
    }
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8')
    const durationMs = durationFrom(started)
    runLogger.record('ai.embed.completed', {
      status: 'success',
      adapter: EMBED_ADAPTER,
      durationMs,
      itemsProcessed: items.length,
      outputPath: OUTPUT_FILE,
      locales
    })
    console.log(`embeddings.json 写入 ${items.length} 条（占位文本模式）`)
  } catch (error) {
    runLogger.record('ai.embed.failed', {
      status: 'failed',
      adapter: EMBED_ADAPTER,
      durationMs: durationFrom(started),
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error)
    })
    throw error
  } finally {
    await runLogger.flush()
  }
}

main().catch(err => {
  console.error('[embed-build] failed:', err)
  process.exitCode = 1
})
