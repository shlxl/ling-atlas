<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRouter, useData } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import SearchBox from './components/SearchBox.vue'
import { initTelemetry, setupTelemetryRouterHook } from './telemetry'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useI18nRouting } from './i18nRouting'

const router = useRouter()
const { site } = useData()
const offlineReady = ref(false)
const needRefresh = ref(false)
const chatOpen = ref(false)
const activeLocale = ref('root')

const { ensureLocaleMap, availableLocales, detectLocaleFromPath, resolveLocaleLink } = useI18nRouting()

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

const nextLocaleId = computed(() => {
  const list = availableLocales.value
  if (!list.length) return ''
  const currentIndex = Math.max(list.indexOf(activeLocale.value), 0)
  const nextIndex = (currentIndex + 1) % list.length
  return list[nextIndex]
})

const languageButtonLabel = computed(() => {
  const target = nextLocaleId.value
  if (!target) return ''
  return site.value?.locales?.[target]?.label || target
})

const chatLabels: Record<string, string> = { root: '知识问答', en: 'Knowledge Chat' }
const chatButtonLabel = computed(() => chatLabels[activeLocale.value] || chatLabels.en)

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
  void ensureLocaleMap()
  router.onAfterRouteChanged?.((to: string) => {
    updateLocale(to)
  })
})

function updateLocale(path: string) {
  activeLocale.value = detectLocaleFromPath(path)
}

function switchLocale() {
  const list = availableLocales.value
  if (!list.length) return
  const currentIndex = Math.max(list.indexOf(activeLocale.value), 0)
  const targetIndex = (currentIndex + 1) % list.length
  const target = list[targetIndex]
  const resolved = resolveLocaleLink(router.route.path, target, activeLocale.value)
  if (typeof window !== 'undefined') {
    window.location.href = resolved
  } else {
    router.go(resolved)
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
