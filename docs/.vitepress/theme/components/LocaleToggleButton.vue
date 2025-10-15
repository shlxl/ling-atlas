<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, useData } from 'vitepress'
import { useI18nRouting } from '../i18nRouting'
import { redirectTo } from '../navigation'

const router = useRouter()
const { site } = useData()
const { availableLocales, resolveLocaleLink, detectLocaleFromPath, ensureLocaleMap } = useI18nRouting()

onMounted(() => {
  void ensureLocaleMap()
})

const buttonState = computed(() => {
  const locales = availableLocales.value
  if (locales.length <= 1) {
    return { id: '', label: '', link: '' }
  }
  const current = detectLocaleFromPath(router.route.path)
  const currentIndex = Math.max(locales.indexOf(current), 0)
  const nextIndex = (currentIndex + 1) % locales.length
  const id = locales[nextIndex]
  const label = site.value?.locales?.[id]?.label || id
  const link = resolveLocaleLink(router.route.path, id, current)
  return { id, label, link }
})

const buttonLabel = computed(() => buttonState.value.label)
const isDisabled = computed(() => !buttonState.value.link)

function handleClick() {
  const target = buttonState.value.link
  if (!target) return
  redirectTo(router, target)
}
</script>

<template>
  <button class="la-lang-btn" type="button" :disabled="isDisabled" @click="handleClick">
    {{ buttonLabel }}
  </button>
</template>

<style scoped>
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

.la-lang-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
