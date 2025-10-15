import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vitepress'
import { resolveAsset } from '../telemetry'

export type LocaleId = 'root' | 'en'
type RawLocaleEntry = Partial<Record<string, string>>
type LocaleEntry = Partial<Record<LocaleId, string>>
type Lookup = Record<string, LocaleEntry>

type LocaleMap = {
  lookup: Lookup
}

const localeMapState = ref<LocaleMap>({ lookup: {} })
let loadPromise: Promise<void> | null = null

const fallbackCache: Partial<Record<LocaleId, string>> = {}

function ensureTrailingSlash(path: string) {
  if (!path) return '/'
  if (path.endsWith('/')) return path
  if (path.endsWith('.html')) return path
  return `${path}/`
}

export function normalizeRoutePath(path: string) {
  if (!path) return getFallbackPath('root')
  const [pathname] = path.split(/[?#]/)
  if (!pathname) return getFallbackPath('root')
  return ensureTrailingSlash(pathname.startsWith('/') ? pathname : `/${pathname}`)
}

export function getFallbackPath(locale: LocaleId) {
  if (!fallbackCache[locale]) {
    const basePath = locale === 'en' ? '/en/' : '/'
    fallbackCache[locale] = normalizeRoutePath(resolveAsset(basePath).pathname)
  }
  return fallbackCache[locale]!
}

export function detectLocaleFromPath(path: string): LocaleId {
  const normalized = normalizeRoutePath(path)
  const enPrefix = getFallbackPath('en')
  return normalized.startsWith(enPrefix) ? 'en' : 'root'
}

async function loadLocaleMap() {
  if (typeof window === 'undefined') return
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      const url = resolveAsset('i18n-map.json').href
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load i18n map: ${res.status}`)
      const payload = (await res.json()) as Record<string, RawLocaleEntry>
      const next: Lookup = {}

      for (const entry of Object.values(payload || {})) {
        if (!entry) continue
        const normalizedEntry: LocaleEntry = {}
        for (const [localeKey, rawPath] of Object.entries(entry)) {
          if (typeof rawPath !== 'string' || !rawPath) continue
          const normalizedLocale = localeKey === 'en' ? 'en' : localeKey === 'root' ? 'root' : null
          if (!normalizedLocale) continue
          const resolved = normalizeRoutePath(resolveAsset(rawPath).pathname)
          normalizedEntry[normalizedLocale] = resolved
        }

        const values = Object.values(normalizedEntry)
        if (!values.length) continue
        for (const value of values) {
          if (!value) continue
          next[value] = normalizedEntry
        }
      }

      localeMapState.value = { lookup: next }
    } catch (err) {
      console.warn('[locale-map] failed to load i18n map', err)
    }
  })()

  try {
    await loadPromise
  } finally {
    loadPromise = null
  }
}

function resolveTargetPath(path: string, targetLocale: LocaleId) {
  const entry = localeMapState.value.lookup[path]
  return entry?.[targetLocale] ?? getFallbackPath(targetLocale)
}

export function useLocaleToggle() {
  const router = useRouter()
  const currentPath = computed(() => normalizeRoutePath(router.route.path))
  const currentLocale = computed<LocaleId>(() => detectLocaleFromPath(currentPath.value))
  const targetLocale = computed<LocaleId>(() => (currentLocale.value === 'en' ? 'root' : 'en'))
  const destination = ref(resolveTargetPath(currentPath.value, targetLocale.value))

  onMounted(() => {
    void loadLocaleMap()
  })

  watchEffect(() => {
    destination.value = resolveTargetPath(currentPath.value, targetLocale.value)
  })

  async function goToTarget() {
    if (typeof window !== 'undefined') {
      await loadLocaleMap()
    }
    const target = normalizeRoutePath(destination.value)
    if (!target || target === currentPath.value) return
    router.go(target)
  }

  return {
    currentLocale,
    targetLocale,
    destination,
    goToTarget
  }
}
