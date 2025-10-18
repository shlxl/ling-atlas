<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { withBase, useRouter } from 'vitepress'
import { resolveAsset } from '../telemetry'
import { detectLocaleFromPath, normalizeRoutePath } from '../composables/localeMap'

interface KnowledgeItem {
  url: string
  title: string
  anchor: string
  chunk: string
  lang?: string
}

interface KnowledgePayload {
  version: string
  items: KnowledgeItem[]
}

interface ReferenceItem {
  title: string
  url: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  refs?: ReferenceItem[]
  fallback?: Array<{ title: string; url: string; excerpt: string }>
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const input = ref('')
const messages = ref<ChatMessage[]>([])
const loading = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const knowledge = ref<KnowledgeItem[]>([])
const knowledgeLoaded = ref(false)
const knowledgeFailed = ref(false)
const locale = ref<'zh' | 'en'>('zh')
const router = useRouter()

const TEXT = {
  zh: {
    fallback: '暂未生成回答，以下是检索到的内容：',
    empty: '暂未找到相关内容，可换个说法再试试。'
  },
  en: {
    fallback: 'No composed answer yet. Here are the retrieved results:',
    empty: 'No relevant results found. Try adjusting your query.'
  }
}

let pagefindModule: any = null
let pagefindPromise: Promise<boolean> | null = null

const visible = computed(() => props.modelValue)

watch(visible, value => {
  if (value) {
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
})

onMounted(() => {
  updateLocale(router.route.path)
  router.onAfterRouteChanged?.((to: string) => {
    updateLocale(to)
  })
})

function close() {
  emit('update:modelValue', false)
}

function encodeAnchor(anchor: string) {
  if (!anchor) return ''
  const trimmed = anchor.trim()
  if (!trimmed) return ''
  try {
    const decoded = decodeURIComponent(trimmed)
    return encodeURIComponent(decoded)
  } catch {
    return encodeURIComponent(trimmed)
  }
}

function formatRefLink(item: KnowledgeItem) {
  const baseTarget = withBase(item.url)
  const sourceAnchor = (item.anchor ?? '').trim()
  if (!sourceAnchor) return baseTarget

  const rawAnchor = sourceAnchor.startsWith('#') ? sourceAnchor.slice(1) : sourceAnchor
  if (!rawAnchor) return baseTarget

  const encoded = encodeAnchor(rawAnchor)
  if (!encoded) return baseTarget

  const hashlessBase = baseTarget.includes('#') ? baseTarget.slice(0, baseTarget.indexOf('#')) : baseTarget
  return `${hashlessBase}#${encoded}`
}

function updateLocale(path: string) {
  if (!path) return
  const detected = detectLocaleFromPath(path) === 'en' ? 'en' : 'zh'
  locale.value = detected
}

async function ensureKnowledge() {
  if (knowledgeLoaded.value || knowledgeFailed.value) return
  try {
    const url = resolveAsset('/api/knowledge.json').href
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload: KnowledgePayload = await res.json()
    if (!Array.isArray(payload?.items)) throw new Error('invalid payload')
    knowledge.value = payload.items
    knowledgeLoaded.value = true
  } catch (err) {
    console.warn('[chat] knowledge load failed', err)
    knowledgeFailed.value = true
  }
}

function knowledgeForLocale() {
  if (!knowledgeLoaded.value) return []
  const preferred = knowledge.value.filter(item => (item.lang || 'zh') === locale.value)
  return preferred.length ? preferred : knowledge.value
}

async function ensurePagefind() {
  if (pagefindModule) return true
  if (pagefindPromise) return pagefindPromise
  pagefindPromise = (async () => {
    try {
      const moduleUrl = resolveAsset('/pagefind/pagefind.js').href
      const mod = await import(/* @vite-ignore */ moduleUrl)
      const instance = mod && 'default' in mod ? mod.default : mod
      if (!instance || typeof instance.search !== 'function') throw new Error('pagefind not ready')
      pagefindModule = instance
      return true
    } catch (err) {
      console.warn('[chat] pagefind load failed', err)
      return false
    } finally {
      pagefindPromise = null
    }
  })()
  return pagefindPromise
}

function tokenize(input: string) {
  return input
    .split(/[\s，。；；、,.!?？!（）()]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function scoreChunk(item: KnowledgeItem, query: string) {
  const tokens = tokenize(query)
  if (!tokens.length) return 0
  let score = 0
  const lowerChunk = item.chunk.toLowerCase()
  const lowerTitle = item.title.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerChunk.includes(lowerQuery)) score += 8
  if (lowerTitle.includes(lowerQuery)) score += 6

  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'gi')
    const matches = item.chunk.match(regex)
    if (matches) score += matches.length * 3
  }
  return score
}

async function fetchPagefindResults(query: string) {
  const ready = await ensurePagefind()
  if (!ready || !pagefindModule) return []
  const res = await pagefindModule.search(query)
  const results = res?.results || []
  const items = await Promise.all(
    results.slice(0, 5).map(async (entry: any) => {
      const data = await entry.data()
      const rawUrl = data.url || entry?.url || ''
      return {
        title: data.meta?.title || rawUrl,
        url: withBase(rawUrl),
        rawUrl,
        excerpt: data.excerpt || ''
      }
    })
  )
  const same = items.filter(item => {
    const normalized = normalizeRoutePath(item.rawUrl || item.url || '')
    const detected = detectLocaleFromPath(normalized)
    return locale.value === 'en' ? detected === 'en' : detected !== 'en'
  })
  const final = (same.length ? same : items).map(({ rawUrl, ...rest }) => rest)
  return final
}

function buildSummary(chunks: KnowledgeItem[], query: string) {
  if (!chunks.length) return ''
  const pieces = chunks.slice(0, 2).map(item => {
    const text = item.chunk.trim()
    if (text.length <= 160) return text
    return `${text.slice(0, 157)}…`
  })
  return pieces.join(' ')
}

async function runQuery(query: string) {
  await ensureKnowledge()
  let topChunks: KnowledgeItem[] = []
  if (knowledgeLoaded.value) {
    const pool = knowledgeForLocale()
    const scored = pool
      .map(item => ({ item, score: scoreChunk(item, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
    topChunks = scored.slice(0, 4).map(entry => entry.item)
  }

  if (!topChunks.length) {
    const fallback = await fetchPagefindResults(query)
    messages.value.push({
      role: 'assistant',
      content: fallback.length ? TEXT[locale.value].fallback : TEXT[locale.value].empty,
      fallback: fallback.length ? fallback : undefined
    })
    return
  }

  const summary = buildSummary(topChunks, query)
  const refs: ReferenceItem[] = topChunks.slice(0, 4).map(item => ({
    title: item.title,
    url: formatRefLink(item)
  }))

  messages.value.push({
    role: 'assistant',
    content: summary,
    refs
  })
}

async function onSubmit() {
  const value = input.value.trim()
  if (!value || loading.value) return
  messages.value.push({ role: 'user', content: value })
  input.value = ''
  loading.value = true
  try {
    await runQuery(value)
  } catch (err) {
    console.warn('[chat] run query failed', err)
    messages.value.push({
      role: 'assistant',
      content: '抱歉，当前无法生成回答。'
    })
  } finally {
    loading.value = false
    await nextTick()
    const panel = document.querySelector('.chat-messages')
    if (panel) panel.scrollTop = panel.scrollHeight
  }
}

onMounted(() => {
  void ensureKnowledge()
})
</script>

<template>
  <transition name="chat-fade">
    <div v-if="visible" class="chat-overlay">
      <div class="chat-container">
        <header class="chat-header">
          <h2>知识问答</h2>
          <button type="button" class="chat-close" @click="close">×</button>
        </header>
        <div class="chat-messages">
          <p v-if="!messages.length" class="chat-placeholder">
            你好！这里会用最新构建的知识片段来回答问题。如暂时无法生成回答，会展示检索结果。
          </p>
          <div v-for="(msg, idx) in messages" :key="idx" :class="['chat-bubble', msg.role]">
            <div class="chat-content">
              <p>{{ msg.content }}</p>
              <ul v-if="msg.refs?.length" class="chat-refs">
                <li v-for="(ref, ridx) in msg.refs" :key="ref.url + ridx">
                  <a :href="ref.url" target="_blank" rel="noopener">[{{ ridx + 1 }}] {{ ref.title }}</a>
                </li>
              </ul>
              <ul v-else-if="msg.fallback?.length" class="chat-fallback-list">
                <li v-for="item in msg.fallback" :key="item.url">
                  <a :href="item.url" target="_blank" rel="noopener">{{ item.title }}</a>
                  <p class="fallback-excerpt">{{ item.excerpt }}</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <form class="chat-input" @submit.prevent="onSubmit">
          <textarea
            ref="textareaRef"
            v-model="input"
            :disabled="loading"
            placeholder="输入问题，例如：如何部署到 GitHub Pages？"
            rows="2"
          />
          <button type="submit" :disabled="loading || !input.trim()">
            {{ loading ? '生成中…' : '发送' }}
          </button>
        </form>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.chat-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 4rem 1.5rem 1.5rem;
  z-index: 11000;
}
.chat-container {
  width: min(420px, 100%);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-radius: 20px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--vp-c-divider);
}
.chat-header h2 {
  font-size: 1.05rem;
  margin: 0;
}
.chat-close {
  background: transparent;
  border: none;
  color: var(--vp-c-text-2);
  font-size: 1.5rem;
  cursor: pointer;
}
.chat-close:hover {
  color: var(--vp-c-brand-1);
}
.chat-messages {
  padding: 1rem;
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.chat-placeholder {
  color: var(--vp-c-text-2);
  margin: 0;
}
.chat-bubble {
  display: flex;
}
.chat-bubble.user {
  justify-content: flex-end;
}
.chat-bubble.assistant {
  justify-content: flex-start;
}
.chat-content {
  max-width: 90%;
  background: var(--vp-c-bg-soft);
  border-radius: 14px;
  padding: 0.75rem 1rem;
  line-height: 1.5;
  font-size: 0.95rem;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}
.chat-bubble.user .chat-content {
  background: var(--vp-c-brand-1);
  color: #fff;
}
.chat-refs,
.chat-fallback-list {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}
.chat-refs a {
  color: inherit;
  text-decoration: underline;
}
.chat-fallback-list a {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.fallback-excerpt {
  margin: 0.15rem 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
}
.chat-input {
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}
.chat-input textarea {
  flex: 1;
  resize: none;
  font-size: 0.95rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.chat-input button {
  border: none;
  border-radius: 12px;
  padding: 0 1.2rem;
  font-size: 0.95rem;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
}
.chat-input button[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}
.chat-fade-enter-active,
.chat-fade-leave-active {
  transition: opacity 0.2s ease;
}
.chat-fade-enter-from,
.chat-fade-leave-to {
  opacity: 0;
}
@media (max-width: 720px) {
  .chat-container {
    width: 100%;
    height: calc(100vh - 4rem);
  }
  .chat-messages {
    max-height: none;
    flex: 1;
  }
}
</style>
