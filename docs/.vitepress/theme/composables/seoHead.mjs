import { useData } from 'vitepress'
import { computed } from 'vue'
import { resolveSeoHead, normalizeRoutePath } from '../../seo-head.mjs'
import { detectLocaleFromPath } from './localeMap'

function escapeSelector(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return String(value).replace(/"/g, '\\"')
}

function ensureMetaElement(tagName, keyAttr, keyValue) {
  const head = document.head
  if (!head) return null
  const selector = `${tagName}[${keyAttr}="${escapeSelector(keyValue)}"]`
  let element = head.querySelector(selector)
  if (!element) {
    element = document.createElement(tagName)
    element.setAttribute(keyAttr, keyValue)
    head.appendChild(element)
  }
  return element
}

function applyHeadConfig(headEntries) {
  if (typeof document === 'undefined') return
  const head = document.head
  if (!head) return
  for (const [tag, attrs] of headEntries) {
    if (!tag || typeof attrs !== 'object') continue
    if (tag === 'meta') {
      const keyAttr = attrs.name ? 'name' : attrs.property ? 'property' : null
      const keyValue = keyAttr ? attrs[keyAttr] : null
      if (!keyAttr || !keyValue) continue
      const element = ensureMetaElement('meta', keyAttr, keyValue)
      if (!element) continue
      for (const [attr, value] of Object.entries(attrs)) {
        if (value == null) {
          element.removeAttribute(attr)
        } else {
          element.setAttribute(attr, value)
        }
      }
    } else if (tag === 'link' && attrs.rel === 'canonical') {
      let element = head.querySelector('link[rel="canonical"]')
      if (!element) {
        element = document.createElement('link')
        element.setAttribute('rel', 'canonical')
        head.appendChild(element)
      }
      if (attrs.href) {
        element.setAttribute('href', attrs.href)
      }
    }
  }
}

export function useSeoHead() {
  const { theme } = useData()
  const seoConfig = computed(() => theme.value?.lingAtlasSeo?.config || null)
  const siteOrigin = computed(() => theme.value?.lingAtlasSeo?.siteOrigin || null)

  function applyForPath(path, locale) {
    if (typeof document === 'undefined') return
    const config = seoConfig.value
    if (!config) return
    const normalizedPath = normalizeRoutePath(path)
    const resolvedLocale = locale || detectLocaleFromPath(normalizedPath)
    const origin = siteOrigin.value || (typeof window !== 'undefined' ? window.location.origin : null)
    const { head } = resolveSeoHead({
      seoConfig: config,
      locale: resolvedLocale,
      normalizedPath,
      siteOrigin: origin
    })
    applyHeadConfig(head)
  }

  return { applyForPath }
}
