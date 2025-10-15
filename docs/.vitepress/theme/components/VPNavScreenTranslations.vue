<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useData } from 'vitepress'
import VPLink from 'vitepress/dist/client/theme-default/components/VPLink.vue'
import { useI18nRouting } from '../i18nRouting'

const router = useRouter()
const { site } = useData()
const { availableLocales, resolveLocaleLink, detectLocaleFromPath, ensureLocaleMap } = useI18nRouting()

const isOpen = ref(false)

onMounted(() => {
  void ensureLocaleMap()
})

const currentLocale = computed(() => detectLocaleFromPath(router.route.path))
const currentLabel = computed(() => site.value?.locales?.[currentLocale.value]?.label || '')

const localeLinks = computed(() =>
  availableLocales.value
    .filter(id => id !== currentLocale.value)
    .map(id => ({
      id,
      text: site.value?.locales?.[id]?.label || id,
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
  height: 24px;
  overflow: hidden;
}

.VPNavScreenTranslations.open {
  height: auto;
}

.title {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.icon {
  font-size: 16px;
}

.icon.lang {
  margin-right: 8px;
}

.icon.chevron {
  margin-left: 4px;
}

.list {
  padding: 4px 0 0 24px;
}

.link {
  line-height: 32px;
  font-size: 13px;
  color: var(--vp-c-text-1);
}
</style>
