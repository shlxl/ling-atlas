---
title: Ling Atlas
layout: page
---

<script setup lang="ts">
import { onMounted } from 'vue'
import { usePreferredLocale } from './.vitepress/composables/usePreferredLocale'
import { SUPPORTED_LOCALES } from './.vitepress/theme/locales'

const base = import.meta.env.BASE_URL || '/'
const normalizedBase = base.endsWith('/') ? base : `${base}/`

const CARD_COPY: Record<string, { label: string; description: string }> = {
  zh: {
    label: '简体中文',
    description: '进入中文知识库，获取完整的原始内容。'
  },
  en: {
    label: 'English',
    description: 'Read the English selection of Ling Atlas articles.'
  }
}

const localeEntries = SUPPORTED_LOCALES.map(locale => {
  const copy = CARD_COPY[locale.code] || { label: locale.code, description: '' }
  return {
    code: locale.code,
    label: copy.label,
    description: copy.description,
    href: withBase(`${locale.code}/`)
  }
})

function withBase(path: string) {
  const sanitized = path.startsWith('/') ? path.slice(1) : path
  return `${normalizedBase}${sanitized}`
}

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}

const locale = usePreferredLocale()

onMounted(() => {
  const preferred = locale.value
  if (!preferred) return
  const targetPath = ensureTrailingSlash(withBase(`${preferred}/`))
  const currentPath = ensureTrailingSlash(window.location.pathname)
  if (currentPath === targetPath) return
  if (currentPath.startsWith(targetPath)) return
  window.location.replace(targetPath)
})
</script>

## Choose your language

Select the language you would like to read **Ling Atlas** in. You can also bookmark your favourite locale for quick access next time.

<div class="language-grid">
  <a v-for="entry in localeEntries" :key="entry.code" class="language-card" :href="entry.href">
    <span class="language-code">{{ entry.code.toUpperCase() }}</span>
    <span class="language-label">{{ entry.label }}</span>
    <span class="language-description">{{ entry.description }}</span>
  </a>
</div>

<style>
.language-grid {
  display: grid;
  gap: 1.5rem;
  margin-top: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.language-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.5rem;
  border-radius: var(--vp-radius);
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.language-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
}

.language-code {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.language-label {
  font-size: 1.25rem;
  font-weight: 700;
}

.language-description {
  color: var(--vp-c-text-2);
}
</style>
