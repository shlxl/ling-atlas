---
title: Ling Atlas
layout: page
head:
  - - script
    - { id: 'ling-atlas-locale-redirect', type: 'application/javascript' }
    - |
        (() => {
          if (typeof window === 'undefined' || typeof document === 'undefined') return

          const ACTIVE_BASE_GLOBAL = '__LING_ATLAS_ACTIVE_BASE__'
          const REDIRECT_FLAG = '__LING_ATLAS_REDIRECT_DONE__'
          const globalWindow = window

          if (globalWindow[REDIRECT_FLAG]) return

          const markRedirectHandled = () => {
            globalWindow[REDIRECT_FLAG] = true
          }

          try {
            const storageKey = 'ling-atlas:preferred-locale'
            const baseMeta = document.querySelector('meta[name="ling-atlas:base"]')
            const vpBase = window.__VP_SITE_DATA__ && window.__VP_SITE_DATA__.site ? window.__VP_SITE_DATA__.site.base : null
            const declaredBase = (baseMeta && baseMeta.getAttribute('content')) || vpBase || '/'
            const normalizedDeclaredBase = declaredBase.endsWith('/') ? declaredBase : `${declaredBase}/`
            const currentPath = typeof window.location?.pathname === 'string' ? window.location.pathname : '/'
            const activeBase =
              normalizedDeclaredBase !== '/' && currentPath && !currentPath.startsWith(normalizedDeclaredBase)
                ? '/'
                : normalizedDeclaredBase
            globalWindow[ACTIVE_BASE_GLOBAL] = activeBase
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
              return activeBase === '/' ? `/${trimmed}` : `${activeBase}${trimmed}`
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
import { usePreferredLocale } from './.vitepress/composables/usePreferredLocale'
import { SUPPORTED_LOCALES, type LocaleCode } from './.vitepress/theme/locales.mjs'
import { ACTIVE_BASE_GLOBAL, getActiveBase, withActiveBase } from './.vitepress/theme/base'

const GLOBAL_REDIRECT_FLAG = '__LING_ATLAS_REDIRECT_DONE__'

type GlobalWindow = Window & {
  __LING_ATLAS_REDIRECT_DONE__?: boolean
}

type MutableGlobal = GlobalWindow & Record<string, unknown>

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}

const activeBase = getActiveBase()

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

function withBase(path: string, base: string = activeBase) {
  const sanitized = path.startsWith('/') ? path.slice(1) : path
  return withActiveBase(sanitized, base)
}

type LocaleCard = {
  code: LocaleCode
  label: string
  description: string
  href: string
}

const localeEntries: LocaleCard[] = SUPPORTED_LOCALES.map(locale => {
  const copy = CARD_COPY[locale.code] || { label: locale.code, description: '' }
  return {
    code: locale.code as LocaleCode,
    label: copy.label,
    description: copy.description,
    href: withBase(`${locale.code}/`)
  }
})

const { preferredLocale, rememberLocale, refreshPreferredLocale } = usePreferredLocale()

onMounted(() => {
  if (typeof window === 'undefined') return

  const globalWindow = window as GlobalWindow
  const mutableWindow = globalWindow as MutableGlobal

  refreshPreferredLocale()

  const currentBase = Reflect.get(mutableWindow, ACTIVE_BASE_GLOBAL)
  if (typeof currentBase !== 'string' || !currentBase.length) {
    Reflect.set(mutableWindow, ACTIVE_BASE_GLOBAL, activeBase)
  }
  if (globalWindow.__LING_ATLAS_REDIRECT_DONE__) return

  const preferred = preferredLocale.value
  if (!preferred) return
  const targetPath = ensureTrailingSlash(withBase(`${preferred}/`))
  const currentPath = ensureTrailingSlash(window.location.pathname)

  globalWindow.__LING_ATLAS_REDIRECT_DONE__ = true
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
