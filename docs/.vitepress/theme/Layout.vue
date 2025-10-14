<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRouter, withBase, useData } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import SearchBox from './components/SearchBox.vue'
import { initTelemetry, resolveAsset, setupTelemetryRouterHook } from './telemetry'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const router = useRouter()
const { site } = useData()
const offlineReady = ref(false)
const needRefresh = ref(false)
const chatOpen = ref(false)
const locale = ref<'zh' | 'en'>('zh')
const localeMap = ref<Record<string, { zh?: string; en?: string }>>({})

let updateServiceWorker: (reloadPage?: boolean) => Promise<void>

if (typeof window !== 'undefined') {
  const { updateServiceWorker: pwaUpdate } = useRegisterSW({
    immediate: true,
    onOfflineReady() {
      offlineReady.value = true
    },
    onNeedRefresh() {
      needRefresh.value = true
    }
  })
  updateServiceWorker = pwaUpdate
}

const bannerMessage = computed(() => {
  if (needRefresh.value) return '检测到新版本，点击即可更新。'
  if (offlineReady.value) return '页面已缓存，可离线访问。'
  return ''
})

const ChatWidget = defineAsyncComponent(() => import('./components/ChatWidget.vue'))

const languageButtonLabel = computed(() => (locale.value === 'zh' ? 'EN' : '中文'))
const chatButtonLabel = computed(() => (locale.value === 'zh' ? '知识问答' : 'Knowledge Chat'))

function closeBanner() {
  offlineReady.value = false
  needRefresh.value = false
}

function refreshNow() {
  updateServiceWorker?.(true)
  closeBanner()
}

onMounted(() => {
  void initTelemetry()
  setupTelemetryRouterHook(router)
  updateLocale(router.route.path)
  void loadLocaleMap()
  router.onAfterRouteChanged?.((to: string) => {
    updateLocale(to)
  })
})

async function loadLocaleMap() {
  try {
    const url = resolveAsset('/i18n-map.json').href
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    const payload = await res.json()
    localeMap.value = payload || {}
  } catch (err) {
    console.warn('[i18n-map] failed to load', err)
  }
}

function updateLocale(path: string) {
  locale.value = path.startsWith('/en/') ? 'en' : 'zh'
}

function computeRelativeKey(path: string, lang: 'zh' | 'en') {
  const cleaned = path.split(/[?#]/)[0]
  const prefix = lang === 'en' ? '/en/content/' : '/content/'
  if (!cleaned.startsWith(prefix)) return null
  const rest = cleaned.slice(prefix.length)
  return rest.replace(/\/$/,'')
}

function stripBase(path: string) {
  const base = site.value?.base || '/'
  if (base !== '/' && path.startsWith(base)) {
    return path.slice(base.length - 1)
  }
  return path
}

function switchLocale() {
  const currentPath = stripBase(router.route.path)
  const target = locale.value === 'zh' ? 'en' : 'zh'
  const key = computeRelativeKey(currentPath, locale.value)
  const mapEntry = key ? localeMap.value[key] : null
  let next = target === 'en' ? '/en/' : '/'

  if (mapEntry && mapEntry[target]) {
    next = mapEntry[target]
  }
  if (!next.startsWith('/')) next = `/${next}`

  const resolved = withBase(next)
  if (typeof window !== 'undefined') {
    window.location.href = resolved
  } else {
    router.go(next)
  }
}
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <div class="la-search-wrapper">
        <SearchBox />
        <button class="la-lang-btn" type="button" @click="switchLocale">
          {{ languageButtonLabel }}
        </button>
      </div>
    </template>
    <template #layout-bottom>
      <transition name="pwa-update-fade">
        <div v-if="needRefresh || offlineReady" class="pwa-update-banner">
          <span>{{ bannerMessage }}</span>
          <div class="pwa-update-actions">
            <button v-if="needRefresh" type="button" class="pwa-update-btn" @click="refreshNow">
              刷新
            </button>
            <button type="button" class="pwa-update-btn secondary" @click="closeBanner">
              关闭
            </button>
          </div>
        </div>
      </transition>
      <button type="button" class="chat-fab" @click="chatOpen = true">
        {{ chatButtonLabel }}
      </button>
      <component :is="ChatWidget" v-if="chatOpen" v-model="chatOpen" />
    </template>
  </DefaultTheme.Layout>
</template>

<style scoped>
.pwa-update-banner {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 10000;
  backdrop-filter: blur(10px);
}
.pwa-update-actions {
  display: flex;
  gap: 0.5rem;
}
.pwa-update-btn {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
}
.pwa-update-btn.secondary {
  background: transparent;
  color: var(--vp-c-text-2);
  border-color: var(--vp-c-text-3);
}
.pwa-update-btn:hover {
  opacity: 0.9;
}
.pwa-update-fade-enter-active,
.pwa-update-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.pwa-update-fade-enter-from,
.pwa-update-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
.la-search-wrapper {
  display: flex;
  align-items: center;
  margin-right: 0.75rem;
}
.la-search-wrapper :deep(.la-search-btn) {
  margin-right: 0.5rem;
}
.la-lang-btn {
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.la-lang-btn:hover {
  background: var(--vp-c-bg);
}
.chat-fab {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  border: none;
  border-radius: 999px;
  padding: 0.75rem 1.3rem;
  font-size: 0.95rem;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  z-index: 9999;
}
.chat-fab:hover {
  opacity: 0.9;
}

@media (max-width: 720px) {
  .chat-fab {
    right: 1rem;
    bottom: 1rem;
  }
}
</style>
