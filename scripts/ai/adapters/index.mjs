import * as placeholder from './placeholder.mjs'

const DEFAULT_LOADERS = new Map([
  ['placeholder', async () => placeholder],
  ['transformers-node', () => import('./transformers-node.mjs')],
  ['onnxruntime', () => import('./onnxruntime.mjs')]
])

const ADAPTER_LOADERS = new Map(DEFAULT_LOADERS)

export function registerAdapter(name, loader) {
  if (!name || typeof name !== 'string') {
    throw new Error('registerAdapter 需要提供字符串形式的名称')
  }
  if (!loader) {
    throw new Error(`registerAdapter("${name}") 缺少 loader 或模块定义`)
  }
  if (typeof loader === 'function') {
    ADAPTER_LOADERS.set(name, loader)
  } else {
    ADAPTER_LOADERS.set(name, async () => loader)
  }
}

export function resetAdapterRegistry() {
  ADAPTER_LOADERS.clear()
  for (const [name, loader] of DEFAULT_LOADERS.entries()) {
    ADAPTER_LOADERS.set(name, loader)
  }
}

function getAdapterLoader(name) {
  return ADAPTER_LOADERS.get(name)
}

function parseModelSpec(spec) {
  if (!spec) return { adapterName: 'placeholder', model: null }
  const [adapterName, ...rest] = String(spec).split(':')
  const model = rest.length ? rest.join(':') : null
  return { adapterName: adapterName || 'placeholder', model }
}

function normalizeModelSpec(adapterName, model) {
  if (!model) return model
  if (adapterName === 'transformers-node') {
    // 常见原仓模型到 Xenova 移植模型的映射（用于 summarization / QA 等）
    const KNOWN_MAPPINGS = new Map([
      // QA: 统一映射到更稳定的 uncased distilbert 版本
      ['deepset/roberta-base-squad2', 'Xenova/distilbert-base-uncased-distilled-squad'],
      ['roberta-base-squad2', 'Xenova/distilbert-base-uncased-distilled-squad'],
      ['deberta-v3-base-squad2', 'Xenova/distilbert-base-uncased-distilled-squad'],
      // Summary: distilbart
      ['philschmid/bart-large-cnn-samsum', 'Xenova/distilbart-cnn-12-6'],
      ['bart-large-cnn-samsum', 'Xenova/distilbart-cnn-12-6']
    ])

    // 规范化 all-MiniLM-L6-v2 相关别名为期望的返回值
    const wantPrefix = 'sentence-transformers:Xenova/'
    if (model.startsWith('sentence-transformers:Xenova/')) return model
    if (model.startsWith('sentence-transformers/')) {
      const rest = model.slice('sentence-transformers/'.length)
      return `${wantPrefix}${rest}`
    }
    if (model.startsWith('Xenova/')) {
      const rest = model.slice('Xenova/'.length)
      return `${wantPrefix}${rest}`
    }
    if (model === 'all-MiniLM-L6-v2' || /(?:^|\/)all-MiniLM-L6-v2$/.test(model)) {
      return `${wantPrefix}all-MiniLM-L6-v2`
    }

    // 非 sentence-transformers 域的模型：尝试映射到 Xenova 等价仓
    if (!model.startsWith('sentence-transformers')) {
      if (KNOWN_MAPPINGS.has(model)) return KNOWN_MAPPINGS.get(model)
      const repo = model.includes('/') ? model.split('/').pop() : model
      if (KNOWN_MAPPINGS.has(repo)) return KNOWN_MAPPINGS.get(repo)
    }
  }
  return model
}

async function resolveAdapter(method, spec, logger = console) {
  const { adapterName, model } = parseModelSpec(spec)
  const normalizedModel = normalizeModelSpec(adapterName, model)
  const placeholderResult = {
    adapter: placeholder,
    adapterName: 'placeholder',
    requested: adapterName,
    model: normalizedModel,
    isFallback: adapterName !== 'placeholder',
    reason: adapterName === 'placeholder' ? 'explicit-placeholder' : 'default'
  }

  if (!adapterName || adapterName === 'placeholder') {
    return { ...placeholderResult, isFallback: adapterName !== 'placeholder' }
  }

  const loader = getAdapterLoader(adapterName)
  if (!loader) {
    logger?.warn?.(`[ai] adapter "${adapterName}" is not registered, fallback到 placeholder`)
    return { ...placeholderResult, reason: 'not-registered' }
  }

  try {
    const module = await loader()
    if (typeof module[method] !== 'function') {
      logger?.warn?.(`[ai] adapter "${adapterName}" 缺少 ${method} 实现，已降级至 placeholder`)
      return { ...placeholderResult, reason: 'missing-method' }
    }
    return {
      adapter: module,
      adapterName,
      requested: adapterName,
      model: normalizedModel,
      isFallback: false
    }
  } catch (error) {
    const message = error?.message || String(error)
    logger?.warn?.(`[ai] adapter "${adapterName}" 加载失败：${message}，已降级至 placeholder`)
    return { ...placeholderResult, reason: 'load-error', error }
  }
}

export async function loadEmbeddingAdapter(spec, logger = console) {
  return resolveAdapter('generateEmbeddings', spec, logger)
}

export async function loadSummaryAdapter(spec, logger = console) {
  return resolveAdapter('summarize', spec, logger)
}

export async function loadQAAdapter(spec, logger = console) {
  return resolveAdapter('buildQA', spec, logger)
}

export { placeholder }
