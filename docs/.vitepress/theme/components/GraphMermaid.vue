<template>
  <div
    ref="container"
    class="graph-mermaid"
    :aria-busy="loading"
    :aria-live="loading ? 'polite' : 'off'"
  >
    <div v-if="loading" class="graph-mermaid__loading">正在加载图表…</div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'

let mermaidInstance = null
async function ensureMermaid() {
  if (mermaidInstance) return mermaidInstance
  if (window.mermaid) {
    mermaidInstance = window.mermaid
    return mermaidInstance
  }
  return Promise.reject('Mermaid not found on window')
}

const props = defineProps({
  path: {
    type: String,
    required: true
  },
  chartId: {
    type: String,
    default: 'graphrag-mermaid'
  }
})

const container = ref(null)
const loading = ref(true)
const graphText = ref('')
let renderAbort = false

async function loadGraphText() {
  const url = withBase(props.path)
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`获取 mermaid 文件失败：${response.status}`)
  }
  return response.text()
}

async function renderGraph(text) {
  if (!container.value) return
  const mermaid = await ensureMermaid()
  mermaid.initialize({ startOnLoad: false })
  loading.value = true
  try {
    const { svg } = await mermaid.render(`${props.chartId}-${Date.now()}`, text)
    if (renderAbort || !container.value) return
    container.value.innerHTML = svg
  } finally {
    loading.value = false
  }
}

function normalizeMermaid(text) {
  if (!text) return ''
  return text
    .replace(/^\ufeff/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/linkStyle\s+\d+[^\n]*/g, '')
    .trim()
}

async function loadAndRender() {
  try {
    const raw = await loadGraphText()
    const normalized = normalizeMermaid(raw)
    graphText.value = normalized
    const mermaid = await ensureMermaid()
    mermaid.parseError = error => {
      console.error('[GraphMermaid] 语法解析失败:', error)
    }
    await renderGraph(normalized)
  } catch (error) {
    console.error('[GraphMermaid] 渲染失败:', error)
    if (container.value) {
      container.value.innerHTML = `<pre class="graph-mermaid__error">${String(error)}</pre>`
    }
  }
}

onMounted(() => {
  loadAndRender()
})

watch(
  () => props.path,
  () => {
    renderAbort = true
    renderAbort = false
    loadAndRender()
  }
)
</script>

<style scoped>
.graph-mermaid {
  position: relative;
  min-height: 160px;
  overflow-x: auto;
}
.graph-mermaid__loading {
  padding: 1rem;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}
.graph-mermaid__error {
  padding: 1rem;
  color: var(--vp-c-danger);
  background: var(--vp-c-bg-soft);
  border-radius: 0.5rem;
}
</style>
