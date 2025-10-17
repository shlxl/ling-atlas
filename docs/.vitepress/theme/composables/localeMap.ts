import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vitepress'
import { resolveAsset } from '../telemetry'
import {
  SUPPORTED_LOCALES,
  getFallbackLocale,
  isLocaleCode,
  localeFromVitepressKey,
  manifestFileName,
  normalizeLocalePath,
  routePrefix,
  type LocaleCode
} from '../locales.mjs'
import { createLocaleMapCore } from './locale-map-core.mjs'
import type { LocaleMapState, ResolveTargetPathResult, NavManifest } from './locale-map-core.mjs'

type RawLocaleEntry = Partial<Record<string, string>>
type LocaleEntry = Partial<Record<LocaleCode, string>>
type Lookup = Record<string, LocaleEntry>

type TargetResolution = ResolveTargetPathResult

const localeMapCore = createLocaleMapCore({
  supportedLocales: SUPPORTED_LOCALES.map(locale => ({ code: locale.code as LocaleCode })),
  getFallbackLocale,
  normalizeLocalePath,
  routePrefix
})

const localeMapState = ref<LocaleMapState>({ lookup: {}, manifests: {} })
let loadPromise: Promise<void> | null = null

function decodePathname(path: string): string {
  try {
    return decodeURI(path)
  } catch (error) {
    console.warn('[locale-map] failed to decode path', path, error)
    return path
  }
}

export const normalizeRoutePath = (path: string) => localeMapCore.normalizeRoutePath(path)

export const getFallbackPath = (locale: LocaleCode) => localeMapCore.getFallbackPath(locale)

export const hasLocalePrefix = (path: string) => localeMapCore.hasLocalePrefix(path)

export function detectLocaleFromPath(path: string): LocaleCode {
  const detected = localeMapCore.detectLocaleFromPath(path)
  return isLocaleCode(detected) ? detected : getFallbackLocale()
}

export function classifyLocaleForPath(path: string, currentLocale: LocaleCode) {
  const result = localeMapCore.compareLocale(path, currentLocale)
  const detected = isLocaleCode(result.locale) ? (result.locale as LocaleCode) : getFallbackLocale()
  return {
    locale: detected,
    matches: detected === currentLocale
  }
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
            isLocaleCode(localeKey) ? (localeKey as LocaleCode) : localeFromVitepressKey(localeKey)
          if (!normalizedLocale) continue
          const decodedPath = decodePathname(rawPath)
          const resolved = normalizeLocalePath(decodedPath)
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

function resolveTargetPath(path: string, currentLocale: LocaleCode, targetLocale: LocaleCode): TargetResolution {
  return localeMapCore.resolveTargetPath(localeMapState.value, path, currentLocale, targetLocale)
}

type LocaleDestination = TargetResolution & { normalized: string }

type DestinationIndex = Partial<Record<LocaleCode, LocaleDestination>>

export function useLocaleToggle() {
  const router = useRouter()
  const availableLocales = computed(() => SUPPORTED_LOCALES.map(locale => locale.code as LocaleCode))
  const currentPath = computed(() => normalizeRoutePath(router.route.path))
  const currentLocale = computed<LocaleCode>(() => detectLocaleFromPath(currentPath.value))
  const destinations = ref<DestinationIndex>({})

  onMounted(() => {
    void loadLocaleMap()
  })

  watchEffect(() => {
    const next: DestinationIndex = {}
    for (const locale of availableLocales.value) {
      const resolution = resolveTargetPath(currentPath.value, currentLocale.value, locale)
      next[locale] = {
        ...resolution,
        normalized: normalizeRoutePath(resolution.path)
      }
    }
    destinations.value = next
  })

  async function goToLocale(locale: LocaleCode) {
    if (!locale) return
    if (typeof window !== 'undefined') {
      await loadLocaleMap()
    }
    const next = resolveTargetPath(currentPath.value, currentLocale.value, locale)
    const target = normalizeRoutePath(next.path)
    if (!target || target === currentPath.value) return
    router.go(target)
  }

  return {
    currentLocale,
    currentPath,
    availableLocales,
    destinations: computed(() => destinations.value),
    goToLocale
  }
}

async function loadNavManifests() {
  const manifests: Partial<Record<LocaleCode, NavManifest>> = {}
  const candidateMap = new Map<LocaleCode, string[]>()

  for (const locale of SUPPORTED_LOCALES) {
    const code = locale.code as LocaleCode
    const candidates = new Set<string>([manifestFileName(code)])
    if (locale.vitepressKey !== code) {
      candidates.add(`nav.manifest.${locale.vitepressKey}.json`)
    }
    candidateMap.set(code, Array.from(candidates))
  }

  await Promise.all(
    Array.from(candidateMap.entries()).map(async ([locale, candidates]) => {
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

function normalizeManifest(payload: Partial<NavManifest> | null | undefined, fallbackLocale: LocaleCode): NavManifest {
  const localeKey = payload?.locale
  const normalized =
    (localeKey && (isLocaleCode(localeKey) ? (localeKey as LocaleCode) : localeFromVitepressKey(localeKey))) || null
  const locale = normalized ?? fallbackLocale
  return {
    locale,
    categories: normalizeManifestSection(payload?.categories),
    series: normalizeManifestSection(payload?.series),
    tags: normalizeManifestSection(payload?.tags),
    archive: normalizeManifestSection(payload?.archive)
  }
}

function normalizeManifestSection(section: Record<string, string> | undefined): Record<string, string> {
  if (!section) return {}
  return Object.fromEntries(
    Object.entries(section).map(([key, value]) => [key, normalizeLocalePath(decodePathname(value))])
  )
}
