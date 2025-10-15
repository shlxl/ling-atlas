<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleToggle } from '../composables/localeMap'
import { LocaleCode } from '../locales'

const { targetLocale, destination, goToTarget, hasMapping } = useLocaleToggle()

const localeLabels: Record<LocaleCode, { button: string; aria: string }> = {
  zh: { button: '中文', aria: '切换到中文内容' },
  en: { button: 'EN', aria: 'Switch to English content' }
}

const buttonText = computed(() => localeLabels[targetLocale.value]?.button ?? 'EN')
const ariaLabel = computed(() => localeLabels[targetLocale.value]?.aria ?? 'Switch language')

function handleToggle() {
  if (!hasMapping.value) return
  goToTarget()
}
</script>

<template>
  <button
    v-if="hasMapping"
    class="la-locale-toggle"
    type="button"
    :aria-label="ariaLabel"
    :data-target="destination"
    @click="handleToggle"
  >
    <span class="la-locale-toggle__label">{{ buttonText }}</span>
  </button>
</template>
