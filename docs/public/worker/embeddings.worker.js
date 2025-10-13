const TRANSFORMERS_URL = 'https://esm.sh/@xenova/transformers@2.7.0'
let manifestCache = null

async function loadSriManifest() {
  if (manifestCache) return manifestCache
  const manifestUrl = new URL('../.well-known/sri-manifest.json', import.meta.url)
  const response = await fetch(manifestUrl, { cache: 'no-cache', credentials: 'omit' })
  if (!response.ok) throw new Error(`Failed to load SRI manifest (${response.status})`)
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error('SRI manifest malformed')
  manifestCache = data
  return manifestCache
}

async function importWithSri(url) {
  const manifest = await loadSriManifest()
  const entry = manifest.find(item => item?.url === url)
  if (!entry?.integrity) {
    throw new Error(`Missing SRI entry for ${url}`)
  }
  const request = new Request(url, {
    mode: 'cors',
    credentials: 'omit',
    integrity: entry.integrity,
    referrerPolicy: 'no-referrer'
  })
  const response = await fetch(request)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`)
  }
  const source = await response.text()
  const blob = new Blob([source], { type: 'application/javascript' })
  const moduleUrl = URL.createObjectURL(blob)
  try {
    return await import(moduleUrl)
  } finally {
    URL.revokeObjectURL(moduleUrl)
  }
}

let pipelineModulePromise = null

let encoderPromise = null
const pendingCache = new Map()

async function ensurePipelineModule() {
  if (!pipelineModulePromise) {
    pipelineModulePromise = importWithSri(TRANSFORMERS_URL)
  }
  return pipelineModulePromise
}

function ensureEncoder(){
  if (!encoderPromise){
    encoderPromise = ensurePipelineModule().then((mod) => {
      if (!mod?.pipeline) throw new Error('Transformers pipeline unavailable')
      return mod.pipeline('feature-extraction', 'Xenova/gte-small', { quantized: true })
    })
  }
  return encoderPromise
}

function resolveCache(requestId, value){
  const resolver = pendingCache.get(requestId)
  if (resolver){
    pendingCache.delete(requestId)
    resolver(value)
  }
}

async function cacheGet(key){
  return new Promise(resolve => {
    const requestId = `get_${Math.random().toString(36).slice(2)}`
    pendingCache.set(requestId, resolve)
    self.postMessage({ type: 'cache:get', key, requestId })
    setTimeout(() => {
      if (pendingCache.has(requestId)){
        pendingCache.delete(requestId)
        resolve(null)
      }
    }, 5000)
  })
}

function cacheSet(key, value){
  try {
    self.postMessage({ type: 'cache:set', key, value })
  } catch (error) {
    // ignore cache write failures
  }
}

async function sha1(text){
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function encodeBatch(texts){
  const encoder = await ensureEncoder()
  const results = []
  for (const text of texts){
    const key = 'embed:' + await sha1(text)
    const cached = await cacheGet(key)
    if (cached && Array.isArray(cached)){
      results.push(cached)
      continue
    }
    const output = await encoder(text, { pooling: 'mean', normalize: true })
    const vector = Array.from(output.data)
    cacheSet(key, vector)
    results.push(vector)
  }
  return results
}

self.onmessage = async (event) => {
  const data = event.data || {}
  try {
    if (data.type === 'cache:result'){
      resolveCache(data.requestId, data.value ?? null)
      return
    }
    if (data.type === 'init'){
      await ensureEncoder()
      self.postMessage({ type: 'ready' })
      return
    }
    if (data.type === 'encode'){
      const { batch = [], requestId } = data
      const vecs = await encodeBatch(Array.isArray(batch) ? batch : [])
      self.postMessage({ type: 'vecs', vecs, requestId })
      return
    }
  } catch (error) {
    const payload = { type: 'error', reason: error?.message || String(error) }
    if (data.requestId) payload.requestId = data.requestId
    self.postMessage(payload)
  }
}
