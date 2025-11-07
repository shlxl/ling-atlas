<template>
  <div
    ref="container"
    class="graph-mermaid"
    :aria-busy="loading"
    :aria-live="loading ? 'polite' : 'off'"
  >
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, withBase } from 'vitepress'

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

const route = useRoute()
const mermaidSources = import.meta.glob('../../../**/*.mmd', {
  query: '?raw',
  import: 'default'
})

const resolvedPath = computed(() => resolveGraphPath(props.path))

function buildModuleKey(pathname) {
  if (!pathname) return null
  const normalized = pathname.replace(/^\/+/, '')
  if (!normalized) return null
  return `../../../${normalized}`
}

function resolveGraphPath(rawPath) {
  if (!rawPath) {
    return { url: rawPath, moduleKey: null }
  }

  if (/^(https?:)?\/\//.test(rawPath)) {
    return { url: rawPath, moduleKey: null }
  }

  if (rawPath.startsWith('/')) {
    return {
      url: withBase(rawPath),
      moduleKey: buildModuleKey(rawPath)
    }
  }

  const relativePath = route.data?.relativePath ?? ''
  const baseUrl = new URL(relativePath || '.', 'http://mermaid.local/')
  const resolved = new URL(rawPath, baseUrl)
  const pathname = resolved.pathname

  return {
    url: withBase(pathname),
    moduleKey: buildModuleKey(pathname)
  }
}

async function loadGraphText() {
  const { url, moduleKey } = resolvedPath.value

  if (moduleKey && mermaidSources[moduleKey]) {
    const loader = mermaidSources[moduleKey]
    const loaded = await loader()
    if (typeof loaded === 'string') {
      return loaded
    }
    if (loaded && typeof loaded === 'object' && 'default' in loaded) {
      return loaded.default
    }
  }

  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`获取 mermaid 文件失败：${response.status}`)
  }
  return response.text()
}

async function renderGraph(text) {
  if (!container.value) return

  // Set loading message directly
  container.value.innerHTML = '<div class="graph-mermaid__loading">正在加载图表…</div>';

  const mermaid = await ensureMermaid()
  mermaid.initialize({ startOnLoad: false })
  loading.value = true // Keep for aria attributes

  try {
    const { svg } = await mermaid.render(`${props.chartId}-${Date.now()}`, text)
    if (renderAbort || !container.value) return
    container.value.innerHTML = svg
  } catch (error) {
    console.error('[GraphMermaid] 渲染失败:', error)
    if (container.value) {
      container.value.innerHTML = `<pre class="graph-mermaid__error">${String(error)}</pre>`
    }
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
  () => [resolvedPath.value.url, resolvedPath.value.moduleKey, route.data?.relativePath],
  () => {
    renderAbort = true
    setTimeout(() => { renderAbort = false }, 0)
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
