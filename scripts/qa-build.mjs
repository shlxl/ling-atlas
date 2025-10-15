#!/usr/bin/env node

/**
 * 问答对占位实现：基于 frontmatter 元信息生成结构化 Q&A。
 * 后续可替换为真实的本地 LLM 生成逻辑。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globby } from 'globby'
import matter from 'gray-matter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DEFAULT_LOCALE = 'zh'
const CONTENT_DIR = path.join(ROOT, 'docs', `content.${DEFAULT_LOCALE}`)
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'qa.json')

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

function buildUrl(mdPath) {
  const relative = path.relative(CONTENT_DIR, mdPath).replace(/\\/g, '/')
  const dir = relative.replace(/\/index\.md$/, '')
  return `/content/${dir}/`
}

function buildQA(frontmatter, content) {
  const qa = []
  const title = String(frontmatter?.title || '').trim()
  if (!title) return qa

  const summary = frontmatter?.excerpt || getFirstParagraph(content)
  if (summary) {
    qa.push({
      q: `${title} 主要讲述了什么内容？`,
      a: summary.length > 160 ? summary.slice(0, 157) + '…' : summary
    })
  }

  if (Array.isArray(frontmatter?.tags_zh) && frontmatter.tags_zh.length) {
    qa.push({
      q: `${title} 涉及了哪些关键主题或标签？`,
      a: frontmatter.tags_zh.join('、')
    })
  }

  if (frontmatter?.series) {
    const text = frontmatter.series_slug
      ? `${frontmatter.series}（slug: ${frontmatter.series_slug}）`
      : frontmatter.series
    qa.push({
      q: `${title} 属于哪个系列？`,
      a: String(text)
    })
  } else if (frontmatter?.category_zh) {
    qa.push({
      q: `${title} 被归类在哪个知识领域？`,
      a: String(frontmatter.category_zh)
    })
  }

  if (frontmatter?.date) {
    qa.push({
      q: `${title} 的发布日期是？`,
      a: String(frontmatter.date)
    })
  }

  if (frontmatter?.updated && frontmatter.updated !== frontmatter.date) {
    qa.push({
      q: `${title} 最近一次更新是什么时候？`,
      a: String(frontmatter.updated)
    })
  }

  return qa.slice(0, 5)
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
    const qa = buildQA(data, content)
    if (!qa.length) continue
    items.push({
      url: buildUrl(file),
      title: String(data.title || '').trim(),
      qa
    })
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
  console.log(`qa.json 写入 ${items.length} 篇文档的问答对`)
}

main().catch(err => {
  console.error('[qa-build] failed:', err)
  process.exitCode = 1
})
