<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { trackEvent, hashQuery } from '../telemetry'

type LexicalResult = { url: string; title: string; excerpt: string; rank: number }
type SemanticCandidate = { url: string; score: number; vector: number[] | null; rank: number }
type TextItem = { url: string; title: string; text: string }

const isOpen = ref(false)
const query = ref('')
const results = ref<Array<{ url: string; title: string; excerpt: string }>>([])
const loading = ref(false)
const semanticPending = ref(false)
const error = ref<string | null>(null)
const lastQueryHash = ref('')

const rawBase = (import.meta.env?.BASE_URL || '/') as string
const siteBase = (() => {
  const ensured = rawBase.startsWith('/') ? rawBase : `/${rawBase}`
  return ensured.endsWith('/') ? ensured : `${ensured}/`
})()
const siteBasePrefix = siteBase === '/' ? '' : siteBase.slice(0, -1)

const noResults = computed(() => !loading.value && !error.value && query.value.trim().length > 0 && results.value.length === 0)

function resolveAsset(path: string) {
  const cleaned = path.startsWith('/') ? path.slice(1) : path
  const joined = `${siteBase}${cleaned}`.replace(/\/{2,}/g, '/')
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    const normalized = joined.startsWith('/') ? joined : `/${joined}`
    return { href: normalized, pathname: normalized }
  }
  const resolved = new URL(joined, window.location.origin)
  return {
    href: resolved.toString(),
    pathname: resolved.pathname
  }
}

function normalizeResultUrl(raw: string) {
  if (!raw) return '/'
  const value = raw.trim()
  if (/^https?:\/\//i.test(value)) return value
  const basePrefix = siteBasePrefix
  if (basePrefix && value === basePrefix) return '/'
  if (basePrefix && value.startsWith(`${basePrefix}/`)) {
    const sliced = value.slice(basePrefix.length)
    return sliced.startsWith('/') ? sliced : `/${sliced}`
  }
  if (value.startsWith('/')) return value
  return `/${value}`
}

function resolveHref(url: string) {
  if (!url) return siteBase
  if (/^https?:\/\//i.test(url)) return url
  const normalized = url.startsWith('/') ? url : `/${url}`
  const combined = `${siteBase}${normalized.startsWith('/') ? normalized.slice(1) : normalized}`.replace(/\/{2,}/g, '/')
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return combined.startsWith('/') ? combined : `/${combined}`
  }
  return new URL(combined, window.location.origin).toString()
}

let pagefind: any = null
let semanticWorker: Worker | null = null
const workerPending = new Map<string, { resolve: (vecs: number[][]) => void; reject: (reason: any) => void; timer: number }>()
const semanticReady = ref(false)
let semanticDisabled = false
let texts: TextItem[] = []
const textMap = new Map<string, TextItem>()
const textVectors = new Map<string, number[]>()
const vectorPromises = new Map<string, Promise<number[]>>()
const queryVecCache = new Map<string, number[]>()
let searchToken = 0
let debounceTimer = 0

function open() {
  isOpen.value = true
  error.value = null
  requestAnimationFrame(() => {
    const el = document.getElementById('la-search-input') as HTMLInputElement | null
    el?.focus()
  })
  if (!semanticReady.value && !semanticDisabled) void initSemantic()
  void trackEvent('search_open')
}

function close() {
  isOpen.value = false
}

function disableSemantic(reason: unknown) {
  if (semanticDisabled) return
  semanticDisabled = true
  semanticReady.value = false
  workerPending.forEach(({ reject, timer }) => {
    clearTimeout(timer)
    reject(reason ?? new Error('semantic disabled'))
  })
  workerPending.clear()
  if (semanticWorker) {
    semanticWorker.terminate()
    semanticWorker = null
  }
  console.warn('[semantic disabled]', reason)
}

let pagefindPromise: Promise<boolean> | null = null

async function ensurePagefind() {
  if (pagefind) return true
  if (pagefindPromise) return pagefindPromise
  pagefindPromise = (async () => {
    try {
      const runtime = resolveAsset('/pagefind/pagefind.js')
      const basePathAsset = resolveAsset('/pagefind/')
      const baseAsset = resolveAsset('/')
      // @vite-ignore
      const runtimePath = runtime.pathname.startsWith('/') ? runtime.pathname : `/${runtime.pathname}`
      const mod = await import(/* @vite-ignore */ (runtimePath as any))
      const instance = (mod && 'default' in mod ? mod.default : mod)
      if (!instance || typeof instance.search !== 'function') {
        throw new Error('Pagefind runtime missing search implementation')
      }
      const pagefindOptions: Record<string, unknown> = {
        basePath: basePathAsset.pathname,
        baseUrl: baseAsset.pathname
      }
      if (typeof instance.options === 'function') {
        await instance.options(pagefindOptions)
      }
      if (typeof instance.init === 'function') {
        await instance.init()
      }
      pagefind = instance
      return true
    } catch (err) {
      error.value = '搜索运行时未准备好。请先执行：npm run build && npm run search:index'
      console.error(err)
      return false
    } finally {
      pagefindPromise = null
    }
  })()
  return pagefindPromise
}

function handleWorkerMessage(ev: MessageEvent<any>) {
  const data = ev.data || {}
  if (data.type === 'cache:get') {
    const { key, requestId } = data
    let value: any = null
    try {
      const stored = localStorage.getItem(String(key))
      if (stored) value = JSON.parse(stored)
    } catch (err) {
      console.warn('[semantic cache:get]', err)
    }
    try {
      semanticWorker?.postMessage({ type: 'cache:result', requestId, value })
    } catch (err) {
      console.warn('[semantic cache:result]', err)
    }
    return
  }
  if (data.type === 'cache:set') {
    const { key, value } = data
    try {
      localStorage.setItem(String(key), JSON.stringify(value))
    } catch (err) {
      console.warn('[semantic cache:set]', err)
    }
    return
  }
  if (data.type === 'ready') {
    semanticReady.value = true
    return
  }
  if (data.type === 'vecs') {
    const pending = data.requestId ? workerPending.get(data.requestId) : undefined
    if (pending) {
      clearTimeout(pending.timer)
      workerPending.delete(data.requestId)
      pending.resolve(data.vecs || [])
    }
    return
  }
  if (data.type === 'error') {
    const pending = data.requestId ? workerPending.get(data.requestId) : undefined
    if (pending) {
      clearTimeout(pending.timer)
      workerPending.delete(data.requestId)
      pending.reject(data.reason)
    }
    disableSemantic(data.reason)
  }
}

async function initSemantic() {
  if (semanticWorker || semanticDisabled) return
  try {
    const embeddingsUrl = resolveAsset('/embeddings-texts.json').href
    const res = await fetch(embeddingsUrl, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to load embeddings-texts.json (${res.status})`)
    const payload = await res.json()
    const items = Array.isArray(payload?.items) ? payload.items : []
    texts = items.map((item: any) => ({
      url: String(item.url || ''),
      title: String(item.title || ''),
      text: String(item.text || '')
    })).filter(it => it.url)
    texts.forEach(it => textMap.set(it.url, it))

    const workerUrl = resolveAsset('/worker/embeddings.worker.js').href
    semanticWorker = new Worker(workerUrl, { type: 'module' })
    semanticWorker.onmessage = handleWorkerMessage
    semanticWorker.onerror = (err) => disableSemantic(err?.message || err)
    semanticWorker.postMessage({ type: 'init' })
  } catch (err) {
    disableSemantic(err)
  }
}

function enqueueWorker(batch: string[]): Promise<number[][]> {
  if (!semanticWorker || !semanticReady.value) {
    return Promise.reject(new Error('Semantic worker unavailable'))
  }
  const requestId = `req_${Math.random().toString(36).slice(2)}`
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      workerPending.delete(requestId)
      reject(new Error('Embedding timeout'))
    }, 30000)
    workerPending.set(requestId, { resolve, reject, timer })
    try {
      semanticWorker!.postMessage({ type: 'encode', batch, requestId })
    } catch (err) {
      clearTimeout(timer)
      workerPending.delete(requestId)
      reject(err)
    }
  })
}

async function encodeQueryVector(input: string) {
  const key = input.trim().toLowerCase()
  if (queryVecCache.has(key)) return queryVecCache.get(key) as number[]
  const [vec] = await enqueueWorker([input])
  queryVecCache.set(key, vec)
  return vec
}

async function getVectorForItem(item: TextItem) {
  if (textVectors.has(item.url)) return textVectors.get(item.url) as number[]
  let promise = vectorPromises.get(item.url)
  if (!promise) {
    const payload = `${item.title}\n\n${item.text}`.trim()
    promise = enqueueWorker([payload]).then(([vec]) => {
      textVectors.set(item.url, vec)
      vectorPromises.delete(item.url)
      return vec
    })
    vectorPromises.set(item.url, promise)
  }
  return promise
}

async function getLexicalResults(q: string): Promise<LexicalResult[]> {
  const res = await pagefind.search(q)
  const list = res?.results || []
  const limited = list.slice(0, 50)
  const items = await Promise.all(limited.map(async (entry: any, idx: number) => {
    const data = await entry.data()
    const rawUrl = data.url || entry?.url || ''
    const normalizedUrl = normalizeResultUrl(rawUrl)
    return {
      url: normalizedUrl,
      title: data.meta?.title || data.excerpt?.slice(0, 60) || rawUrl,
      excerpt: data.excerpt || '',
      rank: idx + 1
    }
  }))
  return items
}

function dot(a: number[], b: number[]) {
  let sum = 0
  for (let i = 0; i < a.length && i < b.length; i++) sum += a[i] * b[i]
  return sum
}

async function semanticSearch(q: string): Promise<{ items: SemanticCandidate[]; queryVec: number[] | null }> {
  if (semanticDisabled || !semanticReady.value || !semanticWorker || !texts.length) {
    return { items: [], queryVec: null }
  }
  try {
    const queryVec = await encodeQueryVector(q)
    const vectors = await Promise.all(texts.map(item => getVectorForItem(item)))
    const scored = texts.map((item, idx) => ({
      url: item.url,
      score: dot(queryVec, vectors[idx]),
      vector: vectors[idx],
      rank: idx + 1
    }))
    scored.sort((a, b) => b.score - a.score)
    return { items: scored.slice(0, 50), queryVec }
  } catch (err) {
    console.warn('[semantic search failed]', err)
    disableSemantic(err)
    return { items: [], queryVec: null }
  }
}

function rrfFuse(lexical: LexicalResult[], semantic: SemanticCandidate[], k = 60) {
  const combined = new Map<string, { url: string; score: number; vector: number[] | null; lex?: LexicalResult }>()
  lexical.forEach((item, idx) => {
    const entry = combined.get(item.url) || { url: item.url, score: 0, vector: null }
    entry.score += 1 / (k + idx + 1)
    entry.lex = item
    combined.set(item.url, entry)
  })
  semantic.forEach((item, idx) => {
    const entry = combined.get(item.url) || { url: item.url, score: 0, vector: null }
    entry.score += 1 / (k + idx + 1)
    entry.vector = item.vector
    combined.set(item.url, entry)
  })
  return Array.from(combined.values()).sort((a, b) => b.score - a.score)
}

function mmrSelect(candidates: Array<{ url: string; score: number; vector: number[] | null }>, queryVec: number[] | null, top = 20, lambda = 0.7) {
  if (!candidates.length) return []
  const pool = candidates.slice()
  const selected: Array<{ url: string; score: number; vector: number[] | null }> = []
  while (pool.length && selected.length < top) {
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i]
      const relevance = cand.score
      let diversity = 0
      if (cand.vector && selected.length) {
        for (const chosen of selected) {
          if (!chosen.vector) continue
          const sim = dot(cand.vector, chosen.vector)
          if (sim > diversity) diversity = sim
        }
      }
      const mmrScore = queryVec ? lambda * relevance - (1 - lambda) * diversity : relevance
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }
    selected.push(pool.splice(bestIdx, 1)[0])
  }
  return selected
}

async function runSearch(input: string) {
  const q = input.trim()
  const token = ++searchToken
  results.value = []
  error.value = null
  lastQueryHash.value = ''
  semanticPending.value = false
  loading.value = true

  if (!q) {
    loading.value = false
    return
  }

  if (!(await ensurePagefind())) {
    loading.value = false
    return
  }

  let lexical: LexicalResult[] = []
  try {
    const hashPromise = hashQuery(q).catch(() => '')
    lexical = await getLexicalResults(q)
    if (token !== searchToken) return

    results.value = lexical.slice(0, 20).map(item => ({ url: item.url, title: item.title, excerpt: item.excerpt }))

    void hashPromise.then((qHash) => {
      if (!qHash || token !== searchToken) return
      lastQueryHash.value = qHash
      void trackEvent('search_query', { qHash, len: q.length })
    })
  } catch (err) {
    console.error('[search failed]', err)
    error.value = '搜索失败，请检查控制台日志'
  } finally {
    if (token === searchToken) loading.value = false
  }

  if (token !== searchToken || semanticDisabled) return

  semanticPending.value = true
  let semantic: Awaited<ReturnType<typeof semanticSearch>> | null = null
  try {
    semantic = await semanticSearch(q)
  } catch (err) {
    console.warn('[semantic search failed]', err)
  } finally {
    if (token === searchToken) semanticPending.value = false
  }

  if (!semantic || token !== searchToken || !semantic.items.length) return

  const fused = rrfFuse(lexical, semantic.items)
  const reranked = mmrSelect(fused, semantic.queryVec, 20)
  const lexicalMap = new Map(lexical.map(item => [item.url, item]))
  results.value = reranked.map(item => {
    const lex = lexicalMap.get(item.url)
    if (lex) return { url: lex.url, title: lex.title, excerpt: lex.excerpt }
    const fallback = textMap.get(item.url)
    return {
      url: item.url,
      title: fallback?.title || item.url,
      excerpt: (fallback?.text || '').slice(0, 160)
    }
  })
}

function scheduleSearch() {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    void runSearch(query.value)
  }, 160)
}

function onResultClick(item: { url: string }, index: number) {
  if (lastQueryHash.value) {
    void trackEvent('search_click', { qHash: lastQueryHash.value, rank: index + 1, url: item.url })
  }
  close()
}

function onKey(e: KeyboardEvent) {
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')) {
    e.preventDefault()
    open()
  } else if (e.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void initSemantic()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (semanticWorker) {
    semanticWorker.terminate()
    semanticWorker = null
  }
})
</script>

<template>
  <div class="la-search">
    <button class="la-search-btn" type="button" @click="open">
      搜索（Ctrl/⌘K）
    </button>

    <div v-if="isOpen" class="la-search-overlay" @click.self="close">
      <div class="la-search-panel">
        <div class="la-search-header">
          <input id="la-search-input" class="la-search-input" v-model="query" @input="scheduleSearch" placeholder="输入关键词搜索..." />
          <button class="la-close" @click="close">Esc</button>
        </div>
        <div class="la-search-body">
          <div v-if="error" class="la-error">{{ error }}</div>
          <div v-else-if="loading" class="la-loading">正在搜索...</div>
          <div v-else-if="noResults" class="la-loading">暂无匹配的结果，换个关键词试试～</div>
          <div v-else class="la-results-wrapper">
            <div v-if="semanticPending" class="la-semantic-hint">语义结果加载中，先为你展示基础结果…</div>
            <ul class="la-results">
              <li v-for="(item, index) in results" :key="item.url">
                <a :href="resolveHref(item.url)" @click="onResultClick(item, index)">
                  <div class="la-title">{{ item.title }}</div>
                  <div class="la-excerpt">{{ item.excerpt }}</div>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.la-search-btn {
  font-size: 0.9rem;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.la-search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 9999;
}
.la-search-panel {
  width: min(800px, 92vw);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  overflow: hidden;
}
.la-search-header {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.la-search-input {
  flex: 1;
  padding: 10px 12px;
  font-size: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.la-close { padding: 8px 10px; }
.la-search-body { max-height: 60vh; overflow: auto; }
.la-results-wrapper { display: flex; flex-direction: column; gap: 4px; }
.la-semantic-hint { font-size: 12px; color: var(--vp-c-text-2); padding: 6px 12px 0; }
.la-results { list-style: none; padding: 0; margin: 0; }
.la-results li { border-bottom: 1px solid var(--vp-c-divider); }
.la-results a { display: block; padding: 8px 12px; text-decoration: none; color: inherit; }
.la-title { font-weight: 600; margin: 6px 0; }
.la-excerpt { font-size: 13px; color: var(--vp-c-text-2); margin-bottom: 10px; }
.la-error, .la-loading { padding: 14px; }
</style>
