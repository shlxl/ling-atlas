import * as placeholder from './placeholder.mjs'

const ADAPTER_LOADERS = {
  placeholder: async () => placeholder,
  'transformers-node': () => import('./transformers-node.mjs'),
  onnxruntime: () => import('./onnxruntime.mjs')
}

function parseModelSpec(spec) {
  if (!spec) return { adapterName: 'placeholder', model: null }
  const [adapterName, ...rest] = String(spec).split(':')
  const model = rest.length ? rest.join(':') : null
  return { adapterName: adapterName || 'placeholder', model }
}

async function resolveAdapter(method, spec, logger = console) {
  const { adapterName, model } = parseModelSpec(spec)
  const placeholderResult = {
    adapter: placeholder,
    adapterName: 'placeholder',
    requested: adapterName,
    model,
    isFallback: adapterName !== 'placeholder',
    reason: adapterName === 'placeholder' ? 'explicit-placeholder' : 'default'
  }

  if (!adapterName || adapterName === 'placeholder') {
    return { ...placeholderResult, isFallback: adapterName !== 'placeholder' }
  }

  const loader = ADAPTER_LOADERS[adapterName]
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
      model,
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
