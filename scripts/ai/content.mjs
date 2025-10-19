import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'
import { isDraft, toPlainText } from './utils.mjs'

function buildUrl(mdPath, { contentDir, basePath }) {
  const relative = path.relative(contentDir, mdPath).replace(/\\/g, '/')
  const dir = relative.replace(/\/index\.md$/, '')
  return dir ? `${basePath}${dir}/` : basePath
}

function extractText(frontmatter, content) {
  if (frontmatter?.excerpt) return String(frontmatter.excerpt)
  const normalized = content.trim()
  if (!normalized) return ''
  const segments = normalized.split(/\r?\n\r?\n/)
  const firstBlock = segments.find(block => block.trim().length > 0) || ''
  return toPlainText(firstBlock)
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export async function collectLocaleDocuments(locale) {
  if (!locale) return []
  const { contentDir } = locale
  if (!contentDir || !(await exists(contentDir))) return []
  const files = await globby('**/index.md', { cwd: contentDir, absolute: true })
  const documents = []

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const { data, content } = matter(raw)
    if (isDraft(data)) continue
    const title = String(data.title || '').trim()
    if (!title) continue
    const text = extractText(data, content)
    if (!text) continue
    documents.push({
      url: buildUrl(file, locale),
      title,
      text,
      content,
      frontmatter: data,
      lang: locale.code
    })
  }

  return documents
}

export async function collectEmbeddableItems(locales, preferredLocale) {
  const documents = []
  const sorted = [...locales].sort((a, b) => {
    if (a.code === preferredLocale) return -1
    if (b.code === preferredLocale) return 1
    return a.code.localeCompare(b.code)
  })

  for (const locale of sorted) {
    const docs = await collectLocaleDocuments(locale)
    for (const doc of docs) {
      documents.push({
        url: doc.url,
        title: doc.title,
        text: doc.text,
        lang: doc.lang
      })
    }
  }

  return documents.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
}
