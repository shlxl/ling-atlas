import { getFirstParagraph } from '../utils.mjs'

const SENTENCE_SPLIT = /(?<=[。！？!?])/u

function limitLength(text, max = 160) {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export async function generateEmbeddings({ items = [] }) {
  return { items }
}

export async function summarize({ documents = [] }) {
  const items = []

  for (const doc of documents) {
    const summarySource = doc.frontmatter?.excerpt
      ? String(doc.frontmatter.excerpt)
      : getFirstParagraph(doc.content || '')
    if (!summarySource) continue
    const sentences = summarySource
      .split(SENTENCE_SPLIT)
      .map(sentence => sentence.trim())
      .filter(Boolean)
    const summary = sentences.length === 0
      ? summarySource.slice(0, 120)
      : sentences.slice(0, 2).join(' ')
    items.push({
      url: doc.url,
      title: doc.title,
      summary: limitLength(summary)
    })
  }

  return { items }
}

export async function buildQA({ documents = [] }) {
  const items = []

  for (const doc of documents) {
    const qa = []
    const title = String(doc.title || '').trim()
    if (!title) continue

    const summarySource = doc.frontmatter?.excerpt || getFirstParagraph(doc.content || '')
    if (summarySource) {
      qa.push({
        q: `${title} 主要讲述了什么内容？`,
        a: limitLength(String(summarySource))
      })
    }

    if (Array.isArray(doc.frontmatter?.tags_zh) && doc.frontmatter.tags_zh.length) {
      qa.push({
        q: `${title} 涉及了哪些关键主题或标签？`,
        a: doc.frontmatter.tags_zh.join('、')
      })
    }

    if (doc.frontmatter?.series) {
      const text = doc.frontmatter.series_slug
        ? `${doc.frontmatter.series}（slug: ${doc.frontmatter.series_slug}）`
        : doc.frontmatter.series
      qa.push({
        q: `${title} 属于哪个系列？`,
        a: String(text)
      })
    } else if (doc.frontmatter?.category_zh) {
      qa.push({
        q: `${title} 被归类在哪个知识领域？`,
        a: String(doc.frontmatter.category_zh)
      })
    }

    if (doc.frontmatter?.date) {
      qa.push({
        q: `${title} 的发布日期是？`,
        a: String(doc.frontmatter.date)
      })
    }

    if (doc.frontmatter?.updated && doc.frontmatter.updated !== doc.frontmatter.date) {
      qa.push({
        q: `${title} 最近一次更新是什么时候？`,
        a: String(doc.frontmatter.updated)
      })
    }

    if (qa.length) {
      items.push({
        url: doc.url,
        title,
        qa: qa.slice(0, 5)
      })
    }
  }

  return { items }
}
