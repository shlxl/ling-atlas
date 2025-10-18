import localeConfig from '../../../schema/locales.json' with { type: 'json' }
import { getActiveBase } from './base.mjs'

/**
 * @typedef {Object} LocaleUiCopy
 * @property {string} label
 * @property {string} lang
 * @property {string} title
 * @property {string} description
 * @property {string} lightModeSwitchTitle
 * @property {string} darkModeSwitchTitle
 * @property {string} cardLabel
 * @property {string} cardDescription
 */

const localeEntries = Array.isArray(localeConfig?.locales) ? localeConfig.locales : []

const RAW_SUPPORTED_LOCALES = localeEntries.map(entry => ({
  code: entry.code,
  vitepressKey: entry.vitepressLocaleKey || entry.code,
  ui: entry.ui || {}
}))

export const SUPPORTED_LOCALES = RAW_SUPPORTED_LOCALES.map(({ code, vitepressKey }) => ({
  code,
  vitepressKey
}))

/** @type {Record<string, LocaleUiCopy>} */
export const LOCALE_UI = Object.fromEntries(
  RAW_SUPPORTED_LOCALES.map(entry => [
    entry.code,
    {
      ...(entry.ui || {}),
      label: entry.ui?.label || entry.code,
      lang: entry.ui?.lang || entry.code,
      title: entry.ui?.title || entry.code,
      description: entry.ui?.description || '',
      lightModeSwitchTitle: entry.ui?.lightModeSwitchTitle || '',
      darkModeSwitchTitle: entry.ui?.darkModeSwitchTitle || '',
      cardLabel: entry.ui?.cardLabel || entry.ui?.label || entry.code,
      cardDescription: entry.ui?.cardDescription || ''
    }
  ])
)

let cachedSiteBasePath = null

function ensureLeadingSlash(path) {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}

function ensureTrailingSlash(path) {
  if (!path) return '/'
  if (path.endsWith('/') || path.endsWith('.html')) return path
  return `${path}/`
}

export function getSiteBasePath() {
  const resolved = getActiveBase()
  const normalized = ensureTrailingSlash(ensureLeadingSlash(resolved || '/'))
  if (cachedSiteBasePath !== normalized) {
    cachedSiteBasePath = normalized
  }
  return cachedSiteBasePath
}

export function withSiteBase(path) {
  const base = getSiteBasePath()
  if (!path) return base
  let normalized = ensureLeadingSlash(path)
  if (normalized === '/' || normalized === base) return base
  if (base !== '/' && normalized.startsWith(base)) return normalized
  if (base === '/') return normalized
  const trimmed = normalized.replace(/^\/+/, '')
  return trimmed ? `${base}${trimmed}` : base
}

export function normalizeLocalePath(path) {
  const combined = withSiteBase(path)
  return ensureTrailingSlash(combined)
}

export const DEFAULT_LOCALE = SUPPORTED_LOCALES[0].code

const LOCALE_BY_CODE = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale.code, locale]))
const LOCALE_BY_VITEPRESS = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale.vitepressKey, locale]))

export const LOCALE_CODES = SUPPORTED_LOCALES.map(locale => locale.code)

export function isLocaleCode(value) {
  return value != null && Object.prototype.hasOwnProperty.call(LOCALE_BY_CODE, value)
}

export function isVitepressLocaleKey(value) {
  return value != null && Object.prototype.hasOwnProperty.call(LOCALE_BY_VITEPRESS, value)
}

function readFallbackLocale() {
  const envKeys = ['LING_ATLAS_FALLBACK_LOCALE', 'FALLBACK_LOCALE', 'DEFAULT_LOCALE']
  for (const key of envKeys) {
    const raw = typeof process !== 'undefined' ? process.env?.[key] : undefined
    if (raw && isLocaleCode(raw)) return raw
  }

  const siteLocale = globalThis?.__VP_SITE_DATA__?.lang
  if (siteLocale && typeof siteLocale === 'string') {
    const normalized = siteLocale.split('-')[0]
    if (isLocaleCode(normalized)) return normalized
  }

  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement?.lang
    if (htmlLang) {
      const normalized = htmlLang.split('-')[0]
      if (isLocaleCode(normalized)) return normalized
    }
  }

  return null
}

let fallbackLocale = null

export function getFallbackLocale() {
  if (fallbackLocale) return fallbackLocale
  const detected = readFallbackLocale()
  fallbackLocale = detected && isLocaleCode(detected) ? detected : SUPPORTED_LOCALES[0].code
  return fallbackLocale
}

export function normalizedRoutePrefix(locale) {
  return `/${locale}/`
}

export function routePrefix(locale) {
  return normalizeLocalePath(normalizedRoutePrefix(locale))
}

export function manifestFileName(locale) {
  return `nav.manifest.${locale}.json`
}

export function localeFromVitepressKey(key) {
  if (!key || !isVitepressLocaleKey(key)) return null
  return LOCALE_BY_VITEPRESS[key].code
}

export function vitepressKeyFromLocale(locale) {
  return LOCALE_BY_CODE[locale].vitepressKey
}

export { LOCALE_BY_CODE, LOCALE_BY_VITEPRESS }
