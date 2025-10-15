#!/usr/bin/env node

/**
 * 构建期知识分段导出
 * - 扫描 docs/content.<locale>/ 下各 index.md
 * - 每段 300~500 中文字符（依据句号/换行切分）
 * - 输出 docs/public/api/knowledge.json，供前端检索/问答引用
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globby } from 'globby'
import matter from 'gray-matter'
import { LOCALE_REGISTRY } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'api')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'knowledge.json')
const DOCS_DIR = path.join(ROOT, 'docs')
const DEFAULT_LOCALE = 'zh'
const detectedLocaleDirs = await globby('content.*', {
  cwd: DOCS_DIR,
  onlyDirectories: true
})

const LANG_SOURCES = detectedLocaleDirs
  .map(dirName => {
    const locale = dirName.slice('content.'.length)
    if (!locale) return null
    return {
      code: locale,
      dir: path.join(DOCS_DIR, dirName),
      basePath: locale === DEFAULT_LOCALE ? '/content/' : `/${locale}/content/`
    }
  })
  .filter(Boolean)
  .sort((a, b) => (a.code === DEFAULT_LOCALE ? -1 : b.code === DEFAULT_LOCALE ? 1 : a.code.localeCompare(b.code)))

if (!LANG_SOURCES.some(source => source.code === DEFAULT_LOCALE)) {
  LANG_SOURCES.unshift({
    code: DEFAULT_LOCALE,
    dir: path.join(DOCS_DIR, `content.${DEFAULT_LOCALE}`),
    basePath: '/content/'
  })
}

function isDraft(frontmatter) {
  const { status, draft } = frontmatter || {}
  if (typeof draft === 'boolean') return draft
  if (typeof status === 'string') return status.toLowerCase() === 'draft'
  return false
}

function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/`{3}[\s\S]*?`{3}/g, '') // code fences
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!\[[^\]]*]\([^)]+\)/g, '') // images
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1') // links => keep text
    .replace(/^>+\s?/gm, '') // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, '') // list markers
    .replace(/\*\*/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildUrl(mdPath, source) {
  const relative = path.relative(source.dir, mdPath).replace(/\\/g, '/')
  const dir = relative.replace(/\/index\.md$/, '')
  return `${source.basePath}${dir}/`
}

function segmentSentences(text) {
  if (!text) return []
  const segments = text.split(/(?<=[。！？!?；;])/).map(seg => seg.trim()).filter(Boolean)
  if (segments.length === 0) return [text]
  return segments
}

function chunkText(text, minLen = 300, maxLen = 500) {
  const sentences = segmentSentences(text)
  const chunks = []
  let buffer = ''

  const pushBuffer = () => {
    const trimmed = buffer.trim()
    if (trimmed) chunks.push(trimmed)
    buffer = ''
  }

  for (const sentence of sentences) {
    if ((buffer + sentence).length <= maxLen) {
      buffer += sentence
      continue
    }
    if (buffer.length >= minLen) {
      pushBuffer()
      buffer += sentence
    } else {
      // buffer too short, append sentence even if exceeds max
      buffer += sentence
      pushBuffer()
    }
  }

  if (buffer.trim()) {
    if (chunks.length && buffer.length < minLen) {
      chunks[chunks.length - 1] += buffer
    } else {
      chunks.push(buffer.trim())
    }
  }

  return chunks
}

function extractSections(content) {
  const lines = content.split(/\r?\n/)
  const sections = []
  let currentHeading = '全文'
  let currentAnchor = '#top'
  let currentContent = []

  const flush = () => {
    if (!currentContent.length) return
    sections.push({
      heading: currentHeading,
      anchor: currentAnchor,
      text: currentContent.join('\n')
    })
    currentContent = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)/)
    if (headingMatch) {
      flush()
      currentHeading = headingMatch[2].trim()
      currentAnchor = `#${slugify(currentHeading)}`
      continue
    }
    currentContent.push(line)
  }

  flush()
  return sections
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function buildKnowledgeItems() {
  const items = []

  for (const source of LANG_SOURCES) {
    if (!(await exists(source.dir))) continue
    const files = await globby('**/index.md', { cwd: source.dir, absolute: true })

    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8')
      const { data, content } = matter(raw)
      if (isDraft(data)) continue
      const title = String(data.title || '').trim()
      if (!title) continue
      const baseUrl = buildUrl(file, source)
      const sections = extractSections(content)

      for (const section of sections) {
        const plain = stripMarkdown(section.text)
        if (!plain) continue
        const chunks = chunkText(plain)
        chunks.forEach(chunk => {
          const anchorSuffix = section.anchor || '#top'
          const anchorValue = anchorSuffix.startsWith('#') ? anchorSuffix : `#${anchorSuffix}`
          items.push({
            url: baseUrl,
            title,
            anchor: anchorValue,
            chunk,
            lang: source.code
          })
        })
      }
    }
  }

  return items
}

async function main() {
  const items = await buildKnowledgeItems()
  await ensureDir(OUTPUT_DIR)
  const payload = {
    version: new Date().toISOString(),
    items
  }
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`knowledge.json 写入 ${items.length} 段`)
}

main().catch(err => {
  console.error('[chunk-build] failed:', err)
  process.exitCode = 1
})
