<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleToggle } from '../composables/localeMap'

const { currentLocale, destination, goToTarget, hasMapping } = useLocaleToggle()

const buttonText = computed(() => (currentLocale.value === 'en' ? '中文' : 'EN'))
const ariaLabel = computed(() => (currentLocale.value === 'en' ? '切换到中文内容' : 'Switch to English content'))

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
