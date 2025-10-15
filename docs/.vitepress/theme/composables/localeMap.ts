import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vitepress'
import { resolveAsset } from '../telemetry'

export type LocaleId = 'zh' | 'en'
type RawLocaleEntry = Partial<Record<string, string>>
type LocaleEntry = Partial<Record<LocaleId, string>>
type Lookup = Record<string, LocaleEntry>
type AggregateType = 'categories' | 'series' | 'tags' | 'archive'

type NavManifest = {
  locale: LocaleId
  categories: Record<string, string>
  series: Record<string, string>
  tags: Record<string, string>
  archive: Record<string, string>
}

type LocaleMapState = {
  lookup: Lookup
  manifests: Partial<Record<LocaleId, NavManifest>>
}

type TargetResolution = {
  path: string
  hasMapping: boolean
  reason: 'exact' | 'manifest-match' | 'manifest-fallback' | 'home'
}

const localeMapState = ref<LocaleMapState>({ lookup: {}, manifests: {} })
let loadPromise: Promise<void> | null = null

const fallbackCache: Partial<Record<LocaleId, string>> = {}

function ensureTrailingSlash(path: string) {
  if (!path) return '/'
  if (path.endsWith('/')) return path
  if (path.endsWith('.html')) return path
  return `${path}/`
}

export function normalizeRoutePath(path: string) {
  if (!path) return getFallbackPath('zh')
  const [pathname] = path.split(/[?#]/)
  if (!pathname) return getFallbackPath('zh')
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
  return normalized.startsWith(enPrefix) ? 'en' : 'zh'
}

async function loadLocaleMap() {
  if (typeof window === 'undefined') return
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const next: Lookup = {}
    try {
      const url = resolveAsset('i18n-map.json').href
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load i18n map: ${res.status}`)
      const payload = (await res.json()) as Record<string, RawLocaleEntry>

      for (const entry of Object.values(payload || {})) {
        if (!entry) continue
        const normalizedEntry: LocaleEntry = {}
        for (const [localeKey, rawPath] of Object.entries(entry)) {
          if (typeof rawPath !== 'string' || !rawPath) continue
          const normalizedLocale =
            localeKey === 'en' ? 'en' : localeKey === 'zh' || localeKey === 'root' ? 'zh' : null
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

    } catch (err) {
      console.warn('[locale-map] failed to load i18n map', err)
    }
    const manifests = await loadNavManifests()
    localeMapState.value = { lookup: next, manifests }
  })()

  try {
    await loadPromise
  } finally {
    loadPromise = null
  }
}

function resolveTargetPath(path: string, currentLocale: LocaleId, targetLocale: LocaleId): TargetResolution {
  const normalized = normalizeRoutePath(path)
  const entry = localeMapState.value.lookup[normalized]
  const mapped = entry?.[targetLocale]
  if (mapped) {
    return { path: mapped, hasMapping: true, reason: 'exact' }
  }

  const manifest = localeMapState.value.manifests[targetLocale]
  const aggregateInfo = parseAggregatePath(normalized)
  if (manifest && aggregateInfo) {
    const direct = manifest[aggregateInfo.type]?.[aggregateInfo.slug]
    if (direct) {
      return { path: normalizeRoutePath(resolveAsset(direct).pathname), hasMapping: true, reason: 'manifest-match' }
    }
    const fallback = getFirstManifestPath(manifest, aggregateInfo.type)
    if (fallback) {
      return { path: fallback, hasMapping: false, reason: 'manifest-fallback' }
    }
  }

  if (normalized === getFallbackPath(currentLocale)) {
    return { path: getFallbackPath(targetLocale), hasMapping: true, reason: 'home' }
  }

  return { path: getFallbackPath(targetLocale), hasMapping: false, reason: 'home' }
}

export function useLocaleToggle() {
  const router = useRouter()
  const currentPath = computed(() => normalizeRoutePath(router.route.path))
  const currentLocale = computed<LocaleId>(() => detectLocaleFromPath(currentPath.value))
  const targetLocale = computed<LocaleId>(() => (currentLocale.value === 'en' ? 'zh' : 'en'))
  const resolution = ref<TargetResolution>({
    path: getFallbackPath(targetLocale.value),
    hasMapping: currentPath.value === getFallbackPath(currentLocale.value),
    reason: 'home'
  })

  onMounted(() => {
    void loadLocaleMap()
  })

  watchEffect(() => {
    resolution.value = resolveTargetPath(currentPath.value, currentLocale.value, targetLocale.value)
  })

  async function goToTarget() {
    if (typeof window !== 'undefined') {
      await loadLocaleMap()
    }
    const next = resolveTargetPath(currentPath.value, currentLocale.value, targetLocale.value)
    resolution.value = next
    const target = normalizeRoutePath(next.path)
    if (!target || target === currentPath.value) return
    router.go(target)
  }

  return {
    currentLocale,
    targetLocale,
    destination: computed(() => resolution.value.path),
    goToTarget,
    hasMapping: computed(() => resolution.value.hasMapping)
  }
}

async function loadNavManifests() {
  const locales: LocaleId[] = ['zh', 'en']
  const manifests: Partial<Record<LocaleId, NavManifest>> = {}
  const manifestCandidates: Record<LocaleId, string[]> = {
    zh: ['nav.manifest.zh.json', 'nav.manifest.root.json'],
    en: ['nav.manifest.en.json']
  }

  await Promise.all(
    locales.map(async locale => {
      const candidates = manifestCandidates[locale] || []
      let lastError: unknown = null

      for (const candidate of candidates) {
        try {
          const url = resolveAsset(candidate).href
          const res = await fetch(url, { cache: 'no-store' })
          if (!res.ok) {
            lastError = new Error(`HTTP ${res.status}`)
            continue
          }
          const payload = (await res.json()) as Partial<NavManifest>
          manifests[locale] = normalizeManifest(payload, locale)
          return
        } catch (error) {
          lastError = error
        }
      }

      if (lastError) {
        console.warn(`[locale-map] failed to load nav manifest for ${locale}`, lastError)
      }
    })
  )

  return manifests
}

function normalizeManifest(payload: Partial<NavManifest> | null | undefined, fallbackLocale: LocaleId): NavManifest {
  const localeKey = payload?.locale
  const locale =
    localeKey === 'en'
      ? 'en'
      : localeKey === 'zh' || localeKey === 'root'
        ? 'zh'
        : fallbackLocale
  return {
    locale,
    categories: payload?.categories ?? {},
    series: payload?.series ?? {},
    tags: payload?.tags ?? {},
    archive: payload?.archive ?? {}
  }
}

function parseAggregatePath(path: string): { type: AggregateType; slug: string } | null {
  const normalized = normalizeRoutePath(path)
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length) return null
  const hasLocale = segments[0] === 'en'
  const offset = hasLocale ? 1 : 0
  if (segments[offset] !== '_generated') return null
  const type = segments[offset + 1] as AggregateType | undefined
  const slug = segments[offset + 2]
  if (!type || !slug) return null
  if (!['categories', 'series', 'tags', 'archive'].includes(type)) return null
  return { type, slug }
}

function getFirstManifestPath(manifest: NavManifest, type: AggregateType) {
  const entries = manifest[type]
  if (!entries) return null
  const first = Object.values(entries)[0]
  if (!first) return null
  return normalizeRoutePath(resolveAsset(first).pathname)
}
