<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import SearchBox from './components/SearchBox.vue'
import { initTelemetry, setupTelemetryRouterHook } from './telemetry'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const router = useRouter()
const offlineReady = ref(false)
const needRefresh = ref(false)

const { updateServiceWorker } = useRegisterSW({
  immediate: true,
  onOfflineReady() {
    offlineReady.value = true
  },
  onNeedRefresh() {
    needRefresh.value = true
  }
})

const bannerMessage = computed(() => {
  if (needRefresh.value) return '检测到新版本，点击即可更新。'
  if (offlineReady.value) return '页面已缓存，可离线访问。'
  return ''
})

function closeBanner() {
  offlineReady.value = false
  needRefresh.value = false
}

function refreshNow() {
  updateServiceWorker(true)
  closeBanner()
}

onMounted(() => {
  void initTelemetry()
  setupTelemetryRouterHook(router)
})
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <SearchBox />
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
</style>
