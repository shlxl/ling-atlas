<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useData, useRouter } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import SearchBox from './components/SearchBox.vue'
import LocaleToggleButton from './components/LocaleToggleButton.vue'
import { initTelemetry, setupTelemetryRouterHook } from './telemetry'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { getFallbackLocale, type LocaleCode } from './locales.mjs'
import { usePreferredLocale } from './composables/preferredLocale.mjs'
import {
  detectLocaleFromPath,
  getFallbackPath,
  hasLocalePrefix,
  normalizeRoutePath
} from './composables/localeMap'
import { useSeoHead } from './composables/seoHead.mjs'

const router = useRouter()
const { theme } = useData()
const offlineReady = ref(false)
const needRefresh = ref(false)
const chatOpen = ref(false)
const activeLocale = ref<LocaleCode>(getFallbackLocale())
const { preferredLocale, rememberLocale, refreshPreferredLocale } = usePreferredLocale()
const { applyForPath: applySeoHead } = useSeoHead()

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

const chatLabels: Record<LocaleCode, string> = { zh: '知识问答', en: 'Knowledge Chat' }
const chatButtonLabel = computed(() => chatLabels[activeLocale.value] || chatLabels[getFallbackLocale()])
const brandLink = computed(() => getFallbackPath(activeLocale.value))
const localeBypassPrefixes = ['/graph/']

function normalizePath(path: string) {
  return normalizeRoutePath(path)
}

function shouldBypassLocaleRedirect(path: string) {
  return localeBypassPrefixes.some(prefix => path.startsWith(prefix))
}

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
  refreshPreferredLocale()
  const initialPath = normalizePath(router.route.path)
  let redirected = false
  if (!hasLocalePrefix(initialPath) && !shouldBypassLocaleRedirect(initialPath)) {
    const targetLocale = preferredLocale.value
    const targetPath = getFallbackPath(targetLocale)
    if (initialPath !== targetPath) {
      redirected = true
      activeLocale.value = targetLocale
      rememberLocale(targetLocale)
      router.go(targetPath)
    }
  }
  if (!redirected) {
    updateLocale(initialPath)
    rememberLocale(activeLocale.value)
    applySeoHead(initialPath, activeLocale.value)
  }
  router.onAfterRouteChanged?.((to: string) => {
    handleRouteChange(to)
  })
})

function updateLocale(path: string) {
  const normalized = normalizePath(path)
  activeLocale.value = detectLocaleFromPath(normalized) as LocaleCode
}

function handleRouteChange(path: string) {
  const normalized = normalizePath(path)
  updateLocale(normalized)
  rememberLocale(activeLocale.value)
  applySeoHead(normalized, activeLocale.value)
}

watch(
  brandLink,
  link => {
    if (!link) return
    const current = theme.value.logoLink
    if (typeof current === 'string') {
      if (current !== link) {
        theme.value.logoLink = link
      }
      return
    }
    if (current && typeof current === 'object') {
      if (current.link !== link) {
        theme.value.logoLink = { ...current, link }
      }
      return
    }
    theme.value.logoLink = link
  },
  { immediate: true }
)

</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <div class="la-nav-bar-actions">
        <div class="la-nav-bar-search VPNavBarSearch">
          <SearchBox />
        </div>
        <div class="la-nav-bar-locale">
          <LocaleToggleButton />
        </div>
      </div>
    </template>
    <template #nav-screen-content-after>
      <div class="la-nav-screen-locale">
        <LocaleToggleButton />
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

.la-nav-bar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: clamp(0.2rem, 1vw, 0.45rem);
  min-width: 0;
  flex: 0 1 auto;
  flex-wrap: nowrap;
}

.la-nav-bar-search {
  display: flex;
  justify-content: flex-end;
  flex: 0 1 clamp(150px, 38vw, 260px);
  min-width: 0;
  max-width: 100%;
}

.la-nav-bar-search :deep(.la-search) {
  width: 100%;
  max-width: 100%;
}

.la-nav-bar-search :deep(.la-search-btn) {
  width: 100%;
}

.la-nav-bar-locale {
  display: none;
  flex: 0 0 auto;
  min-width: 0;
}

@media (max-width: 959px) {
  .la-nav-bar-actions {
    gap: clamp(0.2rem, 1vw, 0.35rem);
  }

  .la-nav-bar-search {
    flex-basis: clamp(140px, 42vw, 220px);
  }
}

@media (min-width: 640px) {
  .la-nav-bar-locale {
    display: flex;
    align-items: center;
    padding-left: 10px;
  }
}

@media (min-width: 960px) {
  .la-nav-bar-search {
    flex-basis: clamp(180px, 28vw, 280px);
  }

  .la-nav-bar-locale {
    padding-left: 16px;
  }
}

.la-nav-bar-locale :deep(.la-locale-toggle) {
  min-width: 0;
}

.la-nav-bar-locale :deep(.la-locale-toggle__select) {
  min-width: 0;
  max-width: clamp(120px, 40vw, 180px);
}

.la-nav-screen-locale {
  border-top: 1px solid var(--vp-c-divider);
  padding: 1rem 1.5rem 0;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 767px) {
  .la-nav-bar-actions {
    flex: 1 1 100%;
  }

  .la-nav-bar-search {
    flex: 0 1 clamp(136px, 54vw, 210px);
  }

  .la-nav-bar-search :deep(.la-search) {
    width: 100%;
  }

  .la-nav-screen-locale {
    padding: 0.75rem 1.25rem 0;
  }
}

@media (max-width: 639px) {
  .la-nav-bar-search {
    flex-basis: clamp(132px, 62vw, 200px);
  }

  .la-nav-bar-locale {
    padding-left: 8px;
  }
}

:deep(.VPNavBarTranslations),
:deep(.VPNavScreenTranslations) {
  display: none !important;
}

.la-nav-screen-locale :deep(.la-locale-toggle) {
  width: 100%;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.la-nav-screen-locale :deep(.la-locale-toggle__label) {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  clip: auto;
  white-space: nowrap;
  border: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.la-nav-screen-locale :deep(.la-locale-toggle__select) {
  width: 100%;
  max-width: none;
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
