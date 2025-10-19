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

async function getPipeline(task, model, options) {
  if (!model) {
    throw new Error(
      'transformers-node adapter 需要在 AI_EMBED_MODEL 中提供模型 ID，例如：transformers-node:sentence-transformers/all-MiniLM-L6-v2'
    )
  }
  const key = `${task}:${model}`
  if (!pipelineCache.has(key)) {
    pipelineCache.set(key, pipelineFactory(task, model, options))
  }
  return pipelineCache.get(key)
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
