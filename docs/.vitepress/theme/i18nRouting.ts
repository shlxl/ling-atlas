import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import { resolveAsset } from './telemetry'

export type LocaleMap = Record<string, Record<string, string>>

const localeMapState = ref<LocaleMap>({})
let loadPromise: Promise<void> | null = null

function normalizePath(path: string) {
  const cleaned = path.split(/[?#]/)[0]
  return cleaned.replace(/\/index\.html$/, '/')
}

function isExternalLink(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//')
}

function ensureLeadingSlash(value: string) {
  if (!value) return '/'
  if (isExternalLink(value)) return value
  if (!value.startsWith('/')) return `/${value}`
  return value
}

function formatLocaleLink(value: string) {
  if (!value) return value
  if (isExternalLink(value)) return value
  return withBase(ensureLeadingSlash(value))
}

export function useI18nRouting() {
  const { site } = useData()

  async function ensureLocaleMap() {
    if (loadPromise) return loadPromise
    if (typeof window === 'undefined') {
      loadPromise = Promise.resolve()
      return loadPromise
    }
    const url = resolveAsset('/i18n-map.json').href
    loadPromise = fetch(url, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : {}))
      .then((data: LocaleMap) => {
        localeMapState.value = data || {}
      })
      .catch(err => {
        console.warn('[i18n-map] failed to load', err)
        localeMapState.value = {}
      })
    return loadPromise
  }

  const availableLocales = computed(() => Object.keys(site.value?.locales || {}))

  function stripBase(path: string) {
    const base = site.value?.base || '/'
    if (base !== '/' && path.startsWith(base)) {
      const sliced = path.slice(base.length - 1)
      return ensureLeadingSlash(sliced)
    }
    return path
  }

  function detectLocaleFromPath(rawPath: string) {
    const normalized = normalizePath(stripBase(rawPath))
    for (const id of availableLocales.value) {
      if (id === 'root') continue
      if (normalized.startsWith(`/${id}/`)) return id
    }
    return 'root'
  }

  function removeLocalePrefix(path: string, localeId?: string) {
    const normalized = normalizePath(path)
    const target = localeId && localeId !== 'root' ? localeId : detectLocaleFromPath(path)
    if (target && target !== 'root' && normalized.startsWith(`/${target}/`)) {
      return {
        locale: target,
        path: ensureLeadingSlash(normalized.slice(target.length + 1))
      }
    }
    return { locale: 'root', path: normalized }
  }

  function computeMapKey(rawPath: string, localeId?: string) {
    const stripped = stripBase(rawPath)
    const { path } = removeLocalePrefix(stripped, localeId)
    const segments = path.split('/').filter(Boolean)
    if (!segments.length) return ''
    if (segments[0] === 'content') {
      return segments.slice(1).join('/')
    }
    if (segments[0] === '_generated') {
      const type = segments[1]
      const slug = segments.slice(2).join('/')
      if (type && slug) {
        return `${type}/${decodeURIComponent(slug)}`
      }
    }
    return null
  }

  function defaultLocaleLink(localeId: string) {
    const config = site.value?.locales?.[localeId]
    if (config?.link) return config.link
    return localeId === 'root' ? '/' : `/${localeId}/`
  }

  function resolveLocaleLink(currentPath: string, targetLocaleId: string, currentLocaleId?: string) {
    const key = computeMapKey(currentPath, currentLocaleId)
    const mapEntry = key ? localeMapState.value[key] : undefined
    const target = mapEntry?.[targetLocaleId] || defaultLocaleLink(targetLocaleId)
    return formatLocaleLink(target)
  }

  function homeLinkForLocale(localeId: string) {
    return formatLocaleLink(defaultLocaleLink(localeId))
  }

  return {
    localeMap: localeMapState,
    ensureLocaleMap,
    availableLocales,
    detectLocaleFromPath,
    computeMapKey,
    resolveLocaleLink,
    homeLinkForLocale,
    stripBase,
    defaultLocaleLink
  }
}
