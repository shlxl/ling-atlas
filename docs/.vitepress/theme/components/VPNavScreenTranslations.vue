<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useData } from 'vitepress'
import VPLink from 'vitepress/dist/client/theme-default/components/VPLink.vue'
import { useI18nRouting } from '../i18nRouting'

const router = useRouter()
const data = useData()
const { availableLocales, resolveLocaleLink, detectLocaleFromPath, ensureLocaleMap } = useI18nRouting()

const isOpen = ref(false)

onMounted(() => {
  void ensureLocaleMap()
})

const currentLocale = computed(() => detectLocaleFromPath(router.route.path))
const currentLabel = computed(() => data.site.value?.locales?.[currentLocale.value]?.label || '')

const localeLinks = computed(() =>
  availableLocales.value
    .filter(id => id !== currentLocale.value)
    .map(id => ({
      id,
      text: data.site.value?.locales?.[id]?.label || id,
      link: resolveLocaleLink(router.route.path, id, currentLocale.value)
    }))
)

function toggle() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div
    v-if="localeLinks.length && currentLabel"
    class="VPNavScreenTranslations"
    :class="{ open: isOpen }"
  >
    <button class="title" @click="toggle">
      <span class="vpi-languages icon lang" />
      {{ currentLabel }}
      <span class="vpi-chevron-down icon chevron" />
    </button>

    <ul class="list">
      <li v-for="locale in localeLinks" :key="locale.id" class="item">
        <VPLink class="link" :href="locale.link">{{ locale.text }}</VPLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.VPNavScreenTranslations {
  display: none !important;
}
</style>
