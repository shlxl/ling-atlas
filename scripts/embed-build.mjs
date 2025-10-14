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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONTENT_DIR = path.join(ROOT, 'docs', 'content')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'embeddings.json')

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

function buildUrl(mdPath) {
  const relative = path.relative(CONTENT_DIR, mdPath)
  const clean = relative.replace(/\\/g, '/')
  const dir = clean.replace(/\/index\.md$/, '')
  return `/content/${dir}/`
}

async function buildItems() {
  const files = await globby('**/index.md', { cwd: CONTENT_DIR, absolute: true })
  const items = []

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const { data, content } = matter(raw)
    if (isDraft(data)) continue
    const url = buildUrl(file)
    const title = String(data.title || '').trim()
    if (!title) continue
    const text = extractText(data, content)
    if (!text) continue
    items.push({ url, title, text })
  }

  return items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function main() {
  const items = await buildItems()
  await ensureDir(OUTPUT_DIR)
  const payload = {
    generatedAt: new Date().toISOString(),
    items
  }
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`embeddings.json 写入 ${items.length} 条（占位文本模式）`)
}

main().catch(err => {
  console.error('[embed-build] failed:', err)
  process.exitCode = 1
})
