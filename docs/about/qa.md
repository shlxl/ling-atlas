---
title: 常见问答索引
layout: doc
---

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'

interface QAEntry {
  url: string
  title: string
  qa: Array<{ q: string; a: string }>
}

interface QAData {
  generatedAt: string
  items: QAEntry[]
}

const loading = ref(true)
const error = ref<string | null>(null)
const entries = ref<QAEntry[]>([])
const generatedAt = ref('')

onMounted(async () => {
  try {
    const res = await fetch(withBase('/data/qa.json'), { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: QAData = await res.json()
    const items = Array.isArray(data?.items) ? data.items.slice() : []
    entries.value = items
    generatedAt.value = data?.generatedAt || ''
  } catch (err: any) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
})

function resolveLink(url: string) {
  if (!url) return '#'
  if (/^https?:\/\//i.test(url)) return url
  return withBase(url)
}
</script>

<div v-if="loading" class="qa-loading">正在载入问答数据…</div>
<div v-else-if="error" class="qa-error">载入失败：{{ error }}</div>
<div v-else class="qa-container">
  <p v-if="generatedAt" class="qa-meta">数据生成于 {{ new Date(generatedAt).toLocaleString() }}</p>
  <p v-else class="qa-meta">自动生成问答数据，供快速检索摘要使用。</p>

  <section v-for="item in entries" :key="item.url" class="qa-item">
    <h2>
      <a :href="resolveLink(item.url)">{{ item.title }}</a>
    </h2>
    <ul class="qa-list" v-if="item.qa?.length">
      <li v-for="pair in item.qa" :key="pair.q">
        <p class="qa-question">Q：{{ pair.q }}</p>
        <p class="qa-answer">A：{{ pair.a }}</p>
      </li>
    </ul>
    <p v-else class="qa-empty">暂无问答，后续会随着内容补充。</p>
  </section>
</div>

<style scoped>
.qa-container {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}
.qa-meta {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
}
.qa-item h2 {
  font-size: 1.25rem;
  margin-bottom: 0.8rem;
}
.qa-item h2 a {
  text-decoration: none;
}
.qa-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.qa-question {
  font-weight: 600;
  margin: 0;
}
.qa-answer {
  margin: 0.2rem 0 0;
  color: var(--vp-c-text-2);
}
.qa-empty {
  color: var(--vp-c-text-2);
}
.qa-loading,
.qa-error {
  padding: 1rem;
}
</style>
