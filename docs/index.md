---
title: Ling Atlas
layout: page
head:
  - - script
    - { id: 'ling-atlas-locale-redirect', type: 'application/javascript' }
    - |
        (() => {
          if (typeof window === 'undefined' || typeof document === 'undefined') return
          if (window.__LING_ATLAS_REDIRECT_DONE__) return

          const markRedirectHandled = () => {
            window.__LING_ATLAS_REDIRECT_DONE__ = true
          }

          try {
            const storageKey = 'ling-atlas:preferred-locale'
            const baseMeta = document.querySelector('meta[name="ling-atlas:base"]')
            const vpBase = window.__VP_SITE_DATA__ && window.__VP_SITE_DATA__.site ? window.__VP_SITE_DATA__.site.base : null
            const siteBase = (baseMeta && baseMeta.getAttribute('content')) || vpBase || '/'
            const normalizedBase = siteBase.endsWith('/') ? siteBase : `${siteBase}/`
            const supportedMeta = document.querySelector('meta[name="ling-atlas:supported-locales"]')
            const supportedRaw = (supportedMeta && supportedMeta.getAttribute('content')) || ''
            const supported = supportedRaw
              .split(',')
              .map(value => value.trim())
              .filter(Boolean)

            if (!supported.length) supported.push('zh')

            const fallback = supported[0]
            const withBase = value => {
              const trimmed = value.startsWith('/') ? value.slice(1) : value
              return normalizedBase === '/' ? `/${trimmed}` : `${normalizedBase}${trimmed}`
            }
            const ensureTrailingSlash = value => (value.endsWith('/') ? value : `${value}/`)

            let stored = null
            let preferred = null

            try {
              stored = window.localStorage ? window.localStorage.getItem(storageKey) : null
            } catch (storageError) {
              // ignore storage read failures (e.g. private mode)
            }

            if (stored && supported.includes(stored)) {
              preferred = stored
            }

            if (!preferred && typeof navigator !== 'undefined') {
              const sources = Array.isArray(navigator.languages) && navigator.languages.length
                ? navigator.languages
                : navigator.language
                ? [navigator.language]
                : []

              for (const candidate of sources) {
                if (!candidate) continue
                const normalized = candidate.toLowerCase().split('-')[0]
                if (supported.includes(normalized)) {
                  preferred = normalized
                  break
                }
              }
            }

            if (!preferred) {
              preferred = fallback
            }

            if (!stored || stored !== preferred) {
              try {
                if (window.localStorage) {
                  window.localStorage.setItem(storageKey, preferred)
                }
              } catch (storageError) {
                // ignore storage write failures (e.g. private mode)
              }
            }

            const target = ensureTrailingSlash(withBase(`${preferred}/`))
            const current = ensureTrailingSlash(window.location.pathname)

            markRedirectHandled()

            if (current === target || current.startsWith(target)) {
              return
            }

            window.location.replace(target)
          } catch (error) {
            console.warn('[ling-atlas] locale redirect failed', error)
          }
        })()
---

<script setup lang="ts">
import { onMounted } from 'vue'
import { PREFERRED_LOCALE_STORAGE_KEY, usePreferredLocale } from './.vitepress/composables/usePreferredLocale'
import { SUPPORTED_LOCALES } from './.vitepress/theme/locales'

const GLOBAL_REDIRECT_FLAG = '__LING_ATLAS_REDIRECT_DONE__'

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

function rememberLocale(code: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem(PREFERRED_LOCALE_STORAGE_KEY, code)
  } catch {
    /* ignore storage errors */
  }
}

onMounted(() => {
  if (typeof window === 'undefined') return

  const globalWindow = window as Window & { [GLOBAL_REDIRECT_FLAG]?: boolean }
  if (globalWindow[GLOBAL_REDIRECT_FLAG]) return

  const preferred = locale.value
  if (!preferred) return
  const targetPath = ensureTrailingSlash(withBase(`${preferred}/`))
  const currentPath = ensureTrailingSlash(window.location.pathname)

  globalWindow[GLOBAL_REDIRECT_FLAG] = true
  rememberLocale(preferred)

  if (currentPath === targetPath) return
  if (currentPath.startsWith(targetPath)) return

  window.location.replace(targetPath)
})
</script>

## Choose your language

Select the language you would like to read **Ling Atlas** in. You can also bookmark your favourite locale for quick access next time.

<div class="language-grid">
  <a
    v-for="entry in localeEntries"
    :key="entry.code"
    class="language-card"
    :href="entry.href"
    @click="rememberLocale(entry.code)"
  >
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
