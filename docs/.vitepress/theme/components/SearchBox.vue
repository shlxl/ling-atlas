<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vitepress'
import { trackEvent, hashQuery, resolveAsset } from '../telemetry'
import { detectLocaleFromPath, normalizeRoutePath } from '../composables/localeMap'
import { getFallbackLocale, type LocaleCode } from '../locales.mjs'

type LexicalResult = { url: string; title: string; excerpt: string; rank: number }
type SemanticCandidate = { url: string; score: number; vector: number[] | null; rank: number }
type TextItem = { url: string; title: string; text: string; lang?: 'zh' | 'en' }

const isOpen = ref(false)
const query = ref('')
const results = ref<Array<{ url: string; title: string; excerpt: string }>>([])
const loading = ref(false)
const semanticPending = ref(false)
const error = ref<string | null>(null)
const lastQueryHash = ref('')
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
const allowedVariants = new Set(['lex', 'rrf', 'rrf-mmr'])
const activeVariant = ref<'none' | 'lex' | 'rrf' | 'rrf-mmr'>('none')
let interleaveTeams: Record<string, 'control' | 'variant'> = {}
const fallbackLocale = getFallbackLocale()
const currentLocale = ref<LocaleCode>(fallbackLocale)
const router = useRouter()
const rootPathPrefix = normalizeRoutePath('/')
const SEARCH_I18N = {
  zh: {
    button: '搜索（Ctrl/⌘K）',
    placeholder: '输入关键词搜索...',
    loading: '正在搜索...',
    semantic: '正在融合语义结果...',
    empty: '没有找到匹配内容，换个关键词试试？',
    error: '搜索失败，请稍后再试'
  },
  en: {
    button: 'Search (Ctrl/⌘K)',
    placeholder: 'Type keywords to search…',
    loading: 'Searching…',
    semantic: 'Merging semantic results…',
    empty: 'No matches found, try another query?',
    error: 'Search failed, please try again later.'
  }
} as const
const uiText = computed(() => SEARCH_I18N[currentLocale.value])

function normalizeResultUrl(raw: string) {
  if (!raw) return rootPathPrefix
  if (/^https?:\/\//i.test(raw)) return raw
  try {
    const normalized = raw.startsWith('/') ? raw : `/${raw}`
    const url = resolveAsset(normalized)
    return `${url.pathname}${url.search}${url.hash}`
  } catch (err) {
    console.warn('[search] normalizeResultUrl failed', err)
    return raw
  }
}

function detectVariantFromLocation() {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const tryVariant = params.get('variant')
    if (tryVariant && allowedVariants.has(tryVariant)) {
      activeVariant.value = tryVariant as typeof activeVariant.value
    }
  } catch (err) {
    console.warn('[search] variant parse failed', err)
  }
}

function updateLocaleFromPath(path: string) {
  if (!path) return
  try {
    const detected = detectLocaleFromPath(path)
    currentLocale.value = detected
  } catch (err) {
    console.warn('[search] locale detection failed', err)
    currentLocale.value = fallbackLocale
  }
}

type RankedItem = { url: string; title: string; excerpt: string }
type InterleaveEntry = { item: RankedItem; team: 'control' | 'variant' }

function splitByLocale(items: RankedItem[]) {
  const same: RankedItem[] = []
  const others: RankedItem[] = []
  for (const item of items) {
    const detected = detectResultLocale(item.url)
    if (detected === currentLocale.value) {
      same.push(item)
    } else {
      others.push(item)
    }
  }
  return same.length ? same.concat(others) : others
}

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url)
}

function detectResultLocale(url: string): LocaleCode {
  if (!url || isExternalUrl(url)) return fallbackLocale
  try {
    return detectLocaleFromPath(url)
  } catch (err) {
    console.warn('[search] result locale detection failed', err)
    return fallbackLocale
  }
}

function teamDraftInterleave(control: RankedItem[], variant: RankedItem[], seed: string, limit = 20): InterleaveEntry[] {
  const seen = new Set<string>()
  const result: InterleaveEntry[] = []
  const controlQueue = control.slice()
  const variantQueue = variant.slice()
  const startControl = seed ? Number.parseInt(seed.slice(-2), 16) % 2 === 0 : true
  let currentTeam: 'control' | 'variant' = startControl ? 'control' : 'variant'

  const takeFromQueue = (queue: RankedItem[], team: 'control' | 'variant') => {
    while (queue.length) {
      const item = queue.shift()!
      if (seen.has(item.url)) continue
      seen.add(item.url)
      result.push({ item, team })
      return true
    }
    return false
  }

  while (result.length < limit && (controlQueue.length || variantQueue.length)) {
    const queue = currentTeam === 'control' ? controlQueue : variantQueue
    const took = takeFromQueue(queue, currentTeam)
    if (!took) {
      currentTeam = currentTeam === 'control' ? 'variant' : 'control'
      continue
    }
    currentTeam = currentTeam === 'control' ? 'variant' : 'control'
  }

  // 填充剩余位置，优先控制队列再到实验队列
  while (result.length < limit && controlQueue.length) {
    const took = takeFromQueue(controlQueue, 'control')
    if (!took) break
  }
  while (result.length < limit && variantQueue.length) {
    const took = takeFromQueue(variantQueue, 'variant')
    if (!took) break
  }

  return result
}

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
      const moduleUrl = resolveAsset('/pagefind/pagefind.js').href
      const mod = await import(/* @vite-ignore */ moduleUrl)
      const instance = mod && 'default' in mod ? mod.default : mod
      if (!instance || typeof instance.search !== 'function') {
        throw new Error('Pagefind runtime missing search implementation')
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
      text: String(item.text || ''),
      lang: item.lang === 'en' ? 'en' : 'zh'
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
    const localeTexts = texts.filter(item => (item.lang || 'zh') === currentLocale.value)
    const pool = localeTexts.length ? localeTexts : texts
    const vectors = await Promise.all(pool.map(item => getVectorForItem(item)))
    const scored = pool.map((item, idx) => ({
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
  semanticPending.value = false
  loading.value = true
  interleaveTeams = {}
  let variantExpose: ((hash: string) => void) | null = null

  if (!q) {
    loading.value = false
    return
  }
  const hashPromise = hashQuery(q)

  if (!(await ensurePagefind())) {
    loading.value = false
    return
  }

  let lexical: LexicalResult[] = []
  let lexicalRanked: RankedItem[] = []
  try {
    lexical = await getLexicalResults(q)
    if (token !== searchToken) return

    lexicalRanked = lexical.map(item => ({ url: item.url, title: item.title, excerpt: item.excerpt }))
    lexicalRanked = splitByLocale(lexicalRanked)

    results.value = lexicalRanked.slice(0, 20)

  } catch (err) {
    console.error('[search failed]', err)
    error.value = SEARCH_I18N[currentLocale.value].error
    return
  } finally {
    if (token === searchToken) loading.value = false
  }

  if (token !== searchToken || semanticDisabled) {
    if (activeVariant.value !== 'none' && lexicalRanked.length) {
      interleaveTeams = Object.fromEntries(lexicalRanked.map(item => [item.url, 'control']))
    }
    return
  }

  let semantic: Awaited<ReturnType<typeof semanticSearch>> | null = null
  semanticPending.value = true
  try {
    semantic = await semanticSearch(q)
  } catch (err) {
    console.warn('[semantic search failed]', err)
  } finally {
    if (token === searchToken) semanticPending.value = false
  }

  if (token !== searchToken) return

  const lexicalMap = new Map(lexical.map(item => [item.url, item]))
  const baseLexical = lexicalRanked.length
    ? lexicalRanked
    : splitByLocale(lexical.map(item => ({ url: item.url, title: item.title, excerpt: item.excerpt })))

  let rrfRanked: RankedItem[] = baseLexical
  let mmrRanked: RankedItem[] = baseLexical

  if (semantic && semantic.items.length) {
    const fused = rrfFuse(lexical, semantic.items)
    rrfRanked = fused.map(entry => {
      const lex = lexicalMap.get(entry.url)
      if (lex) return { url: lex.url, title: lex.title, excerpt: lex.excerpt }
      const fallback = textMap.get(entry.url)
      return {
        url: entry.url,
        title: fallback?.title || entry.url,
        excerpt: (fallback?.text || '').slice(0, 160)
      }
    })
    rrfRanked = splitByLocale(rrfRanked)
    const reranked = mmrSelect(fused, semantic.queryVec, 20)
    mmrRanked = reranked.map(entry => {
      const lex = lexicalMap.get(entry.url)
      if (lex) return { url: lex.url, title: lex.title, excerpt: lex.excerpt }
      const fallback = textMap.get(entry.url)
      return {
        url: entry.url,
        title: fallback?.title || entry.url,
        excerpt: (fallback?.text || '').slice(0, 160)
      }
    })
    mmrRanked = splitByLocale(mmrRanked)
  }

  const controlList = semantic && semantic.items.length ? mmrRanked : baseLexical
  let finalList = controlList

  if (activeVariant.value !== 'none') {
    const variantList =
      activeVariant.value === 'lex'
        ? baseLexical
        : activeVariant.value === 'rrf'
          ? rrfRanked
          : mmrRanked

    if (activeVariant.value === 'rrf-mmr') {
      interleaveTeams = Object.fromEntries(controlList.map(item => [item.url, 'control']))
      variantExpose = (hash) => {
        void trackEvent('search_variant_expose', {
          qHash: hash,
          variant: activeVariant.value,
          control: 'rrf-mmr',
          mode: 'direct',
          locale: currentLocale.value
        })
      }
    } else {
      const seed = lastQueryHash.value || q
      const interleaved = teamDraftInterleave(controlList, variantList, seed, 20)
      if (interleaved.length) {
        finalList = interleaved.map(entry => entry.item)
        interleaveTeams = interleaved.reduce<Record<string, 'control' | 'variant'>>((acc, entry) => {
          acc[entry.item.url] = entry.team
          return acc
        }, {})
        const controlCount = interleaved.filter(entry => entry.team === 'control').length
        const variantCount = interleaved.filter(entry => entry.team === 'variant').length
        variantExpose = (hash) => {
          void trackEvent('search_variant_expose', {
            qHash: hash,
            variant: activeVariant.value,
            control: 'rrf-mmr',
            mode: 'interleave',
            controlCount,
            variantCount,
            locale: currentLocale.value
          })
        }
      } else {
        interleaveTeams = {}
      }
    }
  } else {
    interleaveTeams = {}
  }

  results.value = finalList.slice(0, 20)

  void hashPromise.then(qHash => {
    if (!qHash || token !== searchToken) return
    lastQueryHash.value = qHash
    void trackEvent('search_query', { qHash, len: q.length, locale: currentLocale.value })
    if (variantExpose) variantExpose(qHash)
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
    const team = activeVariant.value !== 'none' ? interleaveTeams[item.url] ?? 'control' : 'control'
    const payload: Record<string, any> = { qHash: lastQueryHash.value, rank: index + 1, url: item.url, team, locale: currentLocale.value }
    if (activeVariant.value !== 'none') payload.variant = activeVariant.value
    void trackEvent('search_click', payload)
    if (activeVariant.value !== 'none') {
      void trackEvent('search_interleave_click', {
        qHash: lastQueryHash.value,
        variant: activeVariant.value,
        team,
        rank: index + 1,
        url: item.url,
        locale: currentLocale.value
      })
    }
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
  detectVariantFromLocation()
  updateLocaleFromPath(router.route.path)
  router.onAfterRouteChanged?.((to: string) => {
    updateLocaleFromPath(to)
    detectVariantFromLocation()
  })
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
    <button class="la-search-btn" type="button" :aria-label="uiText.button" @click="open">
      <svg
        class="la-search-btn__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M11 4a7 7 0 0 1 5.61 11.28l3.55 3.56a1 1 0 0 1-1.42 1.42l-3.56-3.55A7 7 0 1 1 11 4m0 2a5 5 0 1 0 0 10a5 5 0 0 0 0-10"
        />
      </svg>
      <span class="la-search-btn__label">{{ uiText.button }}</span>
    </button>

    <div v-if="isOpen" class="la-search-overlay" @click.self="close">
      <div class="la-search-panel">
        <div class="la-search-header">
          <input id="la-search-input" class="la-search-input" v-model="query" @input="scheduleSearch" :placeholder="uiText.placeholder" />
          <button class="la-close" @click="close">Esc</button>
        </div>
        <div class="la-search-body">
          <div v-if="error" class="la-error">{{ error }}</div>
          <div v-else-if="loading" class="la-loading">{{ uiText.loading }}</div>
          <div v-else class="la-results-wrapper">
            <template v-if="results.length">
              <p v-if="semanticPending" class="la-semantic-hint">{{ uiText.semantic }}</p>
              <ul class="la-results">
                <li v-for="(item, idx) in results" :key="item.url">
                  <a :href="item.url" @click="onResultClick(item, idx)">
                    <div class="la-title">{{ item.title }}</div>
                    <div class="la-excerpt">{{ item.excerpt }}</div>
                  </a>
                </li>
              </ul>
            </template>
            <p v-else class="la-empty">{{ uiText.empty }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.la-search-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  min-height: 2.75rem;
  min-width: 2.75rem;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.la-search-btn:hover {
  background: var(--vp-c-bg-soft);
}

.la-search-btn:focus-visible {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--vp-c-brand-1) 35%, transparent);
}

.la-search-btn__icon {
  flex-shrink: 0;
}

.la-search-btn__label {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

@media (max-width: 640px) {
  .la-search-btn {
    justify-content: center;
    padding-inline: 0.75rem;
  }

  .la-search-btn__label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
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
.la-empty { padding: 14px; font-size: 14px; color: var(--vp-c-text-2); text-align: center; }
</style>
