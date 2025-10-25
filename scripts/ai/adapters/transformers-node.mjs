import { summarize as placeholderSummarize, buildQA as placeholderBuildQA } from './placeholder.mjs'

let pipelineFactory
try {
  ({ pipeline: pipelineFactory } = await import('@xenova/transformers'))
} catch (error) {
  const message = error?.message || String(error)
  throw new Error(
    'transformers-node adapter 需要可选依赖 `@xenova/transformers`。请先安装：npm install @xenova/transformers\n' +
      `原始错误：${message}`
  )
}

const pipelineCache = new Map()

function toPipelineModel(model) {
  if (!model) return model
  if (model.startsWith('sentence-transformers:Xenova/')) {
    return model.split(':').slice(-1)[0] // -> Xenova/...
  }
  if (model.startsWith('sentence-transformers/')) {
    const rest = model.slice('sentence-transformers/'.length)
    return `Xenova/${rest}`
  }
  return model
}

async function getPipeline(task, model, options) {
  if (!model) {
    throw new Error(
      'transformers-node adapter 需要在 AI_EMBED_MODEL 中提供模型 ID，例如：transformers-node:sentence-transformers:Xenova/all-MiniLM-L6-v2'
    )
  }
  const effectiveModel = toPipelineModel(model)
  const key = `${task}:${effectiveModel}`
  if (!pipelineCache.has(key)) {
    pipelineCache.set(key, pipelineFactory(task, effectiveModel, options))
  }
  return pipelineCache.get(key)
}

async function getPipelineWithFallback(task, primaryModel, fallbackModels = [], options = {}, logger = console) {
  const candidates = [primaryModel, ...fallbackModels].filter(Boolean)
  let lastError
  for (const candidate of candidates) {
    try {
      const pipe = await getPipeline(task, candidate, { quantized: true, ...options })
      return { pipeline: pipe, model: candidate }
    } catch (error) {
      lastError = error
      const msg = error?.message || String(error)
      logger?.warn?.(`[transformers-node] 加载 ${task} 模型失败：${candidate} → ${msg}`)
    }
  }
  throw lastError || new Error('No available model candidate')
}

async function tensorToList(tensor) {
  if (!tensor) return []
  if (typeof tensor.tolist === 'function') {
    return await tensor.tolist()
  }
  if (Array.isArray(tensor)) return tensor
  if (ArrayBuffer.isView(tensor)) return Array.from(tensor)
  if (tensor.data) {
    const data = tensor.data
    if (Array.isArray(data)) return data
    if (ArrayBuffer.isView(data)) return Array.from(data)
    if (typeof data.tolist === 'function') return await data.tolist()
  }
  return []
}

function normalizeVectors(raw, expected) {
  if (!Array.isArray(raw)) return Array.from({ length: expected }, () => [])
  if (raw.length === expected && raw.every(item => Array.isArray(item))) {
    return raw
  }
  if (raw.length && Array.isArray(raw[0])) {
    return raw.slice(0, expected)
  }
  if (raw.length && raw.every(value => typeof value === 'number')) {
    return Array.from({ length: expected }, () => raw)
  }
  return Array.from({ length: expected }, () => [])
}

export async function generateEmbeddings({ items = [], model, logger, pipelineOptions = {}, callOptions = {} }) {
  if (!items.length) return { items }
  const embedder = await getPipeline('feature-extraction', model, pipelineOptions)
  const texts = items.map(item => item.text)
  const result = await embedder(texts, { pooling: 'mean', normalize: true, ...callOptions })
  const rawList = await tensorToList(result)
  const vectors = normalizeVectors(rawList, items.length)
  if (vectors.length !== items.length) {
    logger?.warn?.('[transformers-node] 返回的嵌入数量与输入不一致，已截断或填充为空向量')
  }
  const enriched = items.map((item, index) => ({
    ...item,
    embedding: vectors[index] || []
  }))
  return { items: enriched, model }
}

function limitLength(text, max = 160) {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export async function summarize({ documents = [], model, logger, pipelineOptions = {}, callOptions = {} } = {}) {
  if (!Array.isArray(documents) || documents.length === 0) return { items: [] }
  const { pipeline: summarizer, model: usedModel } = await getPipelineWithFallback(
    'summarization',
    model,
    ['Xenova/distilbart-cnn-12-6'],
    pipelineOptions,
    logger
  )

  const items = []
  for (const doc of documents) {
    const title = String(doc.title || '').trim()
    if (!title) continue
    const baseText = String(
      doc.frontmatter?.excerpt || doc.content || ''
    ).trim()
    if (!baseText) continue
    const input = baseText.slice(0, 2000)

    const output = await summarizer(input, { max_new_tokens: 64, min_length: 16, ...callOptions })
    const result = Array.isArray(output) ? output[0] : output
    const summaryText = result?.summary_text || result?.generated_text || ''
    items.push({ url: doc.url, title, summary: limitLength(String(summaryText || input)) })
  }

  return { items, model: usedModel }
}

export async function buildQA({ documents = [], model, logger, pipelineOptions = {}, callOptions = {} } = {}) {
  if (!Array.isArray(documents) || documents.length === 0) return { items: [] }
  const { pipeline: qa, model: usedModel } = await getPipelineWithFallback(
    'question-answering',
    model,
    ['Xenova/distilbert-base-uncased-distilled-squad'],
    pipelineOptions,
    logger
  )

  const items = []
  for (const doc of documents) {
    const title = String(doc.title || '').trim()
    if (!title) continue
    const context = String(doc.content || doc.frontmatter?.excerpt || '').trim()
    if (!context) continue
    const limited = context.slice(0, 3000)

    const questions = [
      `${title} 主要讲述了什么内容？`,
      `${title} 的关键结论或要点是什么？`
    ]

    const qaPairs = []
    for (const q of questions) {
      const questionText = String(q ?? '')
      const contextText = String(limited ?? '')
      let out
      try {
        out = await qa({ question: questionText, context: contextText }, { ...callOptions })
      } catch (err) {
        const msg = err?.message || String(err)
        if (/text\.split is not a function/i.test(msg)) {
          // 针对 transformers.js 偶发报错，重试一次
          out = await qa({ question: questionText, context: contextText }, { ...callOptions })
        } else {
          throw err
        }
      }
      const answer = out?.answer || out?.generated_text || ''
      const answerText = String(answer || '')
      if (answerText.trim()) {
        qaPairs.push({ q: questionText, a: limitLength(answerText, 220) })
      }
    }

    if (qaPairs.length) {
      items.push({ url: doc.url, title, qa: qaPairs.slice(0, 5) })
    }
  }

  return { items, model: usedModel }
}
