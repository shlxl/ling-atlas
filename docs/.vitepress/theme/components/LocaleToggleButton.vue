<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vitepress'
import { resolveAsset } from '../telemetry'

type LocaleId = 'root' | 'en'
type RawLocaleEntry = Partial<Record<string, string>>
type LocaleEntry = Partial<Record<LocaleId, string>>

type Lookup = Record<string, LocaleEntry>

const router = useRouter()
const lookup = ref<Lookup>({})
let loadPromise: Promise<void> | null = null

const fallbackPaths: Record<LocaleId, string> = {
  root: normalizePath(resolveAsset('/').pathname),
  en: normalizePath(resolveAsset('/en/').pathname)
}

const enPrefix = fallbackPaths.en

const currentPath = computed(() => normalizePath(router.route.path))
const currentLocale = computed<LocaleId>(() => (currentPath.value.startsWith(enPrefix) ? 'en' : 'root'))
const targetLocale = computed<LocaleId>(() => (currentLocale.value === 'en' ? 'root' : 'en'))

const buttonText = computed(() => (currentLocale.value === 'en' ? '中文' : 'EN'))
const ariaLabel = computed(() => (currentLocale.value === 'en' ? '切换到中文内容' : 'Switch to English content'))

onMounted(() => {
  void loadLocaleMap()
})

function normalizePath(input: string) {
  if (!input) return '/'
  const [path] = input.split(/[?#]/)
  let normalized = path || '/'
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  if (!normalized.endsWith('/') && !normalized.includes('.', normalized.lastIndexOf('/'))) {
    normalized = `${normalized}/`
  }
  return normalized
}

async function loadLocaleMap() {
  if (typeof window === 'undefined') return
  if (Object.keys(lookup.value).length) return
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      const url = resolveAsset('i18n-map.json').href
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Failed to load i18n map: ${response.status}`)
      const raw = (await response.json()) as Record<string, RawLocaleEntry>
      const next: Lookup = {}

      for (const entry of Object.values(raw || {})) {
        if (!entry || typeof entry !== 'object') continue
        const normalizedEntry: LocaleEntry = {}

        for (const [localeId, rawPath] of Object.entries(entry)) {
          if (typeof rawPath !== 'string' || !rawPath) continue
          const normalizedLocale = localeId === 'en' ? 'en' : localeId === 'root' ? 'root' : null
          if (!normalizedLocale) continue
          const resolved = normalizePath(resolveAsset(rawPath).pathname)
          normalizedEntry[normalizedLocale] = resolved
        }

        const values = Object.values(normalizedEntry)
        if (!values.length) continue

        for (const pathValue of values) {
          if (!pathValue) continue
          next[pathValue] = normalizedEntry
        }
      }

      lookup.value = next
    } catch (err) {
      console.warn('[locale-toggle] failed to load locale map', err)
    }
  })()

  try {
    await loadPromise
  } finally {
    loadPromise = null
  }
}

function resolveTargetPath(): string {
  const entry = lookup.value[currentPath.value]
  const mapped = entry?.[targetLocale.value]
  if (mapped) return mapped
  return fallbackPaths[targetLocale.value]
}

function toggleLocale() {
  const destination = resolveTargetPath()
  if (!destination) return
  const normalizedDestination = normalizePath(destination)
  if (normalizedDestination === currentPath.value) return
  router.go(normalizedDestination)
}
</script>

<template>
  <button class="la-locale-toggle" type="button" :aria-label="ariaLabel" @click="toggleLocale">
    <span class="la-locale-toggle__label">{{ buttonText }}</span>
  </button>
</template>
