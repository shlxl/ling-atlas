<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useRouter, useData } from 'vitepress'
import VPFlyout from 'vitepress/dist/client/theme-default/components/VPFlyout.vue'
import VPMenuLink from 'vitepress/dist/client/theme-default/components/VPMenuLink.vue'
import { useI18nRouting } from '../i18nRouting'

const router = useRouter()
const data = useData()
const theme = data.theme
const { availableLocales, resolveLocaleLink, detectLocaleFromPath, ensureLocaleMap } = useI18nRouting()

onMounted(() => {
  void ensureLocaleMap()
})

const currentLocale = computed(() => detectLocaleFromPath(router.route.path))

const currentLabel = computed(() => data.site.value?.locales?.[currentLocale.value]?.label || '')

const localeLinks = computed(() => {
  const list = availableLocales.value.filter(id => id !== currentLocale.value)
  return list.map(id => ({
    text: data.site.value?.locales?.[id]?.label || id,
    link: resolveLocaleLink(router.route.path, id, currentLocale.value)
  }))
})
</script>

<template>
  <VPFlyout
    v-if="localeLinks.length && currentLabel"
    class="VPNavBarTranslations"
    icon="vpi-languages"
    :label="theme.langMenuLabel || 'Change language'"
  >
    <div class="items">
      <p class="title">{{ currentLabel }}</p>
      <template v-for="locale in localeLinks" :key="locale.link">
        <VPMenuLink :item="locale" />
      </template>
    </div>
  </VPFlyout>
</template>

<style scoped>
.VPNavBarTranslations {
  display: none !important;
}
</style>
