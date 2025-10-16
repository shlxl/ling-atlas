<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleToggle } from '../composables/localeMap'

const { currentLocale, destination, goToTarget, hasMapping, canNavigate } = useLocaleToggle()

const buttonText = computed(() => (currentLocale.value === 'en' ? '中文' : 'EN'))
const ariaLabel = computed(() => (currentLocale.value === 'en' ? '切换到中文内容' : 'Switch to English content'))

function handleToggle() {
  if (!canNavigate.value) return
  goToTarget()
}
</script>

<template>
  <button
    v-if="canNavigate"
    class="la-locale-toggle"
    type="button"
    :aria-label="ariaLabel"
    :data-target="destination"
    :data-has-mapping="hasMapping"
    @click="handleToggle"
  >
    <span class="la-locale-toggle__label">{{ buttonText }}</span>
  </button>
</template>
