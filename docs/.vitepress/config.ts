import { defineConfig, type HeadConfig } from 'vitepress'
import cssnano from 'cssnano'
import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'
import { navFromMeta as buildNavFromMeta } from './theme/nav-core.mjs'
import type { NavManifest, NavTranslations } from './theme/nav-core.mjs'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LocaleCode,
  VitepressLocaleKey,
  manifestFileName,
  normalizedRoutePrefix
} from './theme/locales.mjs'

function loadCspTemplate() {
  try {
    const raw = fs.readFileSync('security/csp-base.json', 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[security] failed to read security/csp-base.json:', error)
    return null
  }
}

function serializeCsp(directives: Record<string, string[] | string> | null) {
  if (!directives) return ''
  const unsupported = new Set(['frame-ancestors'])
  const entries = Object.entries(directives)
  const filtered = entries.filter(([name]) => !unsupported.has(name))
  if (filtered.length !== entries.length) {
    const removed = entries
      .filter(([name]) => unsupported.has(name))
      .map(([name]) => name)
    console.warn(
      `[security] dropped CSP directives not supported via <meta>: ${removed.join(', ')}. Configure them via HTTP headers instead.`
    )
  }
  return filtered
    .map(([name, values]) => {
      const parts = Array.isArray(values) ? values : [values]
      return `${name} ${parts.join(' ')}`
    })
    .join('; ')
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\$&')
}
const baseFromEnv = (process.env.BASE as string) || '/'
const normalizedBase = baseFromEnv.endsWith('/') ? baseFromEnv : `${baseFromEnv}/`
const escapedBase = escapeRegex(normalizedBase)

const i18nMap = loadI18nTranslations()

const localeMeta = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.code, loadLocaleMeta(locale.code)])
) as Record<LocaleCode, any>

const localeManifest = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.code, loadNavManifest(locale.code)])
) as Record<LocaleCode, NavManifest | null>

type LocaleCopy = {
  label: string
  lang: string
  title: string
  description: string
  lightModeSwitchTitle: string
  darkModeSwitchTitle: string
}

const localeCopy: Record<LocaleCode, LocaleCopy> = {
  zh: {
    label: '简体中文',
    lang: 'zh-CN',
    title: 'Ling Atlas · 知识库',
    description: '现代化、可演进、可检索的知识库工程',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  },
  en: {
    label: 'English',
    lang: 'en-US',
    title: 'Ling Atlas · Knowledge',
    description: 'A modern, evolvable, and searchable knowledge base project',
    lightModeSwitchTitle: 'Switch to light mode',
    darkModeSwitchTitle: 'Switch to dark mode'
  }
}

const localizedLocaleConfigs = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => {
    const code = locale.code
    const strings = localeCopy[code]
    const manifest = localeManifest[code] ?? null
    const meta = localeMeta[code]
    const translations = (i18nMap.nav?.[code] || i18nMap.nav?.[DEFAULT_LOCALE] || {}) as NavTranslations
    const routeRoot = normalizedRoutePrefix(code).replace(/\/$/, '')
    return [
      locale.vitepressKey,
      {
        label: strings.label,
        lang: strings.lang,
        title: strings.title,
        description: strings.description,
        themeConfig: {
          nav: buildNavFromMeta(meta, manifest, {
            locale: code,
            translations,
            routeRoot,
            collator: new Intl.Collator(code === 'en' ? 'en' : 'zh-CN')
          }),
          sidebar: 'auto',
          lightModeSwitchTitle: strings.lightModeSwitchTitle,
          darkModeSwitchTitle: strings.darkModeSwitchTitle
        }
      }
    ]
  })
) as Record<VitepressLocaleKey, {
  label: string
  lang: string
  title: string
  description: string
  themeConfig: Record<string, any>
}>

const cspTemplate = loadCspTemplate()
const cspContent = cspTemplate ? serializeCsp(cspTemplate) : null
const head: HeadConfig[] = [
  ['meta', { name: 'referrer', content: 'no-referrer' }]
]

const supportedLocalesMeta = SUPPORTED_LOCALES.map(locale => locale.code).join(',')
if (supportedLocalesMeta) {
  head.push(['meta', { name: 'ling-atlas:supported-locales', content: supportedLocalesMeta }])
}

head.push(['meta', { name: 'ling-atlas:base', content: normalizedBase }])

if (cspContent) {
  head.unshift(['meta', { 'http-equiv': 'Content-Security-Policy', content: cspContent }])
}
const navigationFallbackAllowlist = [
  new RegExp(`^${escapedBase}$`),
  new RegExp('^' + escapedBase + 'index\\.html$')
]
const pagefindPattern = new RegExp(`^${escapedBase}pagefind/`)
const embeddingsJsonPattern = /embeddings-texts\.json$/
const embeddingsWorkerPattern = /worker\/embeddings\.worker\.js$/

function loadNavManifest(localeId: LocaleCode): NavManifest | null {
  const baseFile = manifestFileName(localeId)
  const candidates = [
    `docs/${localeId}/_generated/${baseFile}`,
    `docs/_generated/${baseFile}`
  ]
  if (localeId === 'zh') {
    candidates.push('docs/zh/_generated/nav.manifest.root.json', 'docs/_generated/nav.manifest.root.json')
  }

  let lastError: unknown = null

  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<NavManifest> & { locale?: string }
      const detectedLocale = parsed.locale === 'en' ? 'en' : 'zh'
      return {
        locale: detectedLocale,
        categories: parsed.categories ?? {},
        series: parsed.series ?? {},
        tags: parsed.tags ?? {},
        archive: parsed.archive ?? {}
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[config] failed to load nav manifest for ${localeId} (candidates: ${candidates.join(', ')}):`,
      lastError
    )
  }

  return null
}

function loadLocaleMeta(localeId: LocaleCode) {
  const candidates = [
    `docs/${localeId}/_generated/meta.json`,
    `docs/_generated/meta.${localeId}.json`
  ]

  if (localeId === DEFAULT_LOCALE) {
    candidates.push('docs/_generated/meta.json')
  }

  for (const file of candidates) {
    if (!file) continue
    if (!fs.existsSync(file)) continue
    return loadMeta(file)
  }

  return loadMeta(candidates[0]!)
}

export default defineConfig({
  // Inject base from env to support GitHub Pages subpath deployment
  base: baseFromEnv,
  rewrites: {},
  head,
  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/shlxl/ling-atlas' }],
    // Disable the built-in locale dropdown to avoid linking to untranslated
    // aggregate pages (404). The inline LocaleToggleButton handles switching
    // with fallbacks to each locale's homepage instead.
    localeLinks: false
  },
  locales: {
    root: {
      label: 'Ling Atlas',
      lang: 'en-US',
      title: 'Ling Atlas',
      description: 'Select your preferred language to continue.',
      themeConfig: {
        nav: [],
        sidebar: false
      }
    },
    ...localizedLocaleConfigs
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        base: normalizedBase,
        filename: 'service-worker.js',
        clientsClaim: true,
        skipWaiting: true,
        workbox: {
          globPatterns: [
            '**/*.{js,css,html,svg,png,ico,json,txt,xml}',
            'pagefind/**/*',
            'worker/**/*'
          ],
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: navigationFallbackAllowlist,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ request }: { request: { mode?: string } }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-cache',
                networkTimeoutSeconds: 5,
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }
              }
            },
            {
              urlPattern: pagefindPattern,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'pagefind-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 }
              }
            },
            {
              urlPattern: embeddingsJsonPattern,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'embeddings-cache',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 3 }
              }
            },
            {
              urlPattern: embeddingsWorkerPattern,
              handler: 'CacheFirst',
              options: {
                cacheName: 'embeddings-worker-cache',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        },
        manifest: {
          name: 'Ling Atlas',
          short_name: 'Ling Atlas',
          start_url: normalizedBase,
          scope: normalizedBase,
          display: 'standalone',
          background_color: '#1f1f24',
          theme_color: '#1f1f24',
          icons: [
            {
              src: `${normalizedBase}icons/icon-192.png`,
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: `${normalizedBase}icons/icon-512.png`,
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    server: { fs: { allow: ['..'] } },
    build: { cssMinify: 'lightningcss' },
    css: {
      postcss: {
        plugins: [cssnano({ preset: 'default' })]
      }
    }
  }
})

function loadMeta(file: string) {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      console.warn(`[meta] failed to parse ${file}`, err)
    }
  }
  return { byCategory: {}, bySeries: {}, byTag: {}, byYear: {}, all: [] }
}

function loadI18nTranslations() {
  try {
    const raw = fs.readFileSync('docs/.vitepress/i18n.json', 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[i18n] failed to read docs/.vitepress/i18n.json', err)
    return {
      nav: {
        zh: {
          latest: '最新',
          categories: '分类',
          series: '系列',
          tags: '标签',
          about: 'About',
          metrics: '观测指标',
          qa: '常见问答',
          guides: '指南',
          deploy: '部署指南',
          migration: '迁移与重写',
          chat: '知识问答'
        },
        en: {
          latest: 'Latest',
          categories: 'Categories',
          series: 'Series',
          tags: 'Tags',
          about: 'About',
          metrics: 'Metrics',
          qa: 'FAQ',
          guides: 'Guides',
          deploy: 'Deployment',
          migration: 'Migration',
          chat: 'Chat'
        }
      }
    }
  }
}
