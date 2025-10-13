<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { withBase } from 'vitepress'

const isOpen = ref(false)
const query = ref('')
const results = ref<Array<any>>([])
const loading = ref(false)
const error = ref<string | null>(null)
let pagefind: any = null

function open() {
  isOpen.value = true
  error.value = null
  // focus input shortly after open
  requestAnimationFrame(() => {
    const el = document.getElementById('la-search-input') as HTMLInputElement | null
    el?.focus()
  })
}
function close() {
  isOpen.value = false
}

async function ensureLoaded() {
  if (pagefind) return true
  try {
    // Pagefind runtime is served from /<base>/pagefind/ in dev/preview/production
    // Resolve with site base to work under GitHub Pages subpath
    const runtimePath = withBase('/pagefind/pagefind.js')
    // @vite-ignore prevents Rollup from trying to resolve this at build-time
    pagefind = await import(/* @vite-ignore */ (runtimePath as any))
    return true
  } catch (e) {
    error.value = '搜索运行时未准备好。请先执行：npm run build && npm run search:index'
    return false
  }
}

async function doSearch() {
  const q = query.value.trim()
  results.value = []
  if (!q) return
  if (!(await ensureLoaded())) return
  loading.value = true
  try {
    const res = await pagefind.search(q)
    const limited = res?.results?.slice(0, 20) || []
    const items = await Promise.all(limited.map((r: any) => r.data()))
    results.value = items.map((d: any) => ({
      url: d.url,
      title: d.meta?.title || d.excerpt?.slice(0, 60) || d.url,
      excerpt: d.excerpt || '',
    }))
  } catch (e) {
    error.value = '搜索失败，请检查控制台与 /pagefind/ 路径'
    console.error(e)
  } finally {
    loading.value = false
  }
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
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
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
          <input id="la-search-input" class="la-search-input" v-model="query" @input="doSearch" placeholder="输入关键词搜索..." />
          <button class="la-close" @click="close">Esc</button>
        </div>
        <div class="la-search-body">
          <div v-if="error" class="la-error">{{ error }}</div>
          <div v-else-if="loading" class="la-loading">正在搜索...</div>
          <ul v-else class="la-results">
            <li v-for="item in results" :key="item.url">
              <a :href="withBase(item.url)" @click="close">
                <div class="la-title">{{ item.title }}</div>
                <div class="la-excerpt">{{ item.excerpt }}</div>
              </a>
            </li>
          </ul>
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
.la-results { list-style: none; padding: 0; margin: 0; }
.la-results li { border-bottom: 1px solid var(--vp-c-divider); }
.la-results a { display: block; padding: 8px 12px; text-decoration: none; color: inherit; }
.la-title { font-weight: 600; margin: 6px 0; }
.la-excerpt { font-size: 13px; color: var(--vp-c-text-2); margin-bottom: 10px; }
.la-error, .la-loading { padding: 14px; }
</style>
