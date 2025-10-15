<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleToggle } from '../composables/localeMap'

const { currentLocale, goToTarget } = useLocaleToggle()

const buttonText = computed(() => (currentLocale.value === 'en' ? '中文' : 'EN'))
const ariaLabel = computed(() => (currentLocale.value === 'en' ? '切换到中文内容' : 'Switch to English content'))

function onClick() {
  void goToTarget()
}
</script>

<template>
  <button class="la-locale-toggle" type="button" :aria-label="ariaLabel" @click="onClick">
    <span class="la-locale-toggle__label">{{ buttonText }}</span>
  </button>
</template>
