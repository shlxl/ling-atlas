import { defineConfig, type HeadConfig } from 'vitepress'
import cssnano from 'cssnano'
import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LocaleCode,
  VitepressLocaleKey,
  manifestFileName,
  normalizedRoutePrefix
} from './theme/locales'

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

function slug(input: string) {
  return input.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
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
    return [
      locale.vitepressKey,
      {
        label: strings.label,
        lang: strings.lang,
        title: strings.title,
        description: strings.description,
        themeConfig: {
          nav: navFromMeta(meta, manifest, code),
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
const navigationAllowlist = [new RegExp(`^${escapedBase}`)]
const pagefindPattern = new RegExp(`^${escapedBase}pagefind/`)
const embeddingsJsonPattern = /embeddings-texts\.json$/
const embeddingsWorkerPattern = /worker\/embeddings\.worker\.js$/

type NavManifest = {
  locale: LocaleCode
  categories: Record<string, string>
  series: Record<string, string>
  tags: Record<string, string>
  archive: Record<string, string>
}

function navFromMeta(meta: any, manifest: NavManifest | null, locale: LocaleCode) {
  if (!manifest) return legacyNavFromMeta(meta, locale)

  const t = i18nMap.nav[locale]
  const routeRoot = normalizedRoutePrefix(locale).replace(/\/$/, '')
  const collator = new Intl.Collator(locale === 'en' ? 'en' : 'zh-CN')

  const archiveYears = Object.keys(meta.byYear || {}).sort((a, b) => b.localeCompare(a))
  const availableArchive = archiveYears.find(year => manifest.archive?.[year])
  const archiveFallback = Object.values(manifest.archive || {})[0]

  const categories = (Object.keys(meta.byCategory || {}) as string[])
    .map(name => {
      const slugValue = slug(name)
      const link = manifest.categories?.[slugValue]
      if (!link) return null
      return { text: name, link }
    })
    .filter(Boolean)
    .sort((a, b) => a!.text.localeCompare(b!.text, locale === 'en' ? 'en' : 'zh-CN')) as { text: string; link: string }[]

  const series = Object.entries(meta.bySeries || {})
    .map(([slugValue, items]) => {
      const link = manifest.series?.[slugValue]
      if (!link) return null
      const label = Array.isArray(items) && items[0]?.series ? items[0].series : slugValue
      return { text: label, link }
    })
    .filter(Boolean)
    .sort((a, b) => a!.text.localeCompare(b!.text, locale === 'en' ? 'en' : 'zh-CN')) as { text: string; link: string }[]

  const tags = Object.keys(meta.byTag || {})
    .map(tag => {
      const slugValue = slug(tag)
      const link = manifest.tags?.[slugValue]
      if (!link) return null
      return { tag, slugValue, link }
    })
    .filter(Boolean)
    .sort((a, b) => collator.compare(a!.tag, b!.tag)) as { tag: string; slugValue: string; link: string }[]

  const nav = [] as any[]

  if (availableArchive && manifest.archive?.[availableArchive]) {
    nav.push({ text: t.latest, link: manifest.archive[availableArchive] })
  } else if (archiveFallback) {
    nav.push({ text: t.latest, link: archiveFallback })
  }

  if (categories.length) {
    nav.push({ text: t.categories, items: categories })
  }

  if (series.length) {
    nav.push({ text: t.series, items: series })
  }

  if (tags.length) {
    nav.push({ text: t.tags, link: tags[0]!.link })
  }

  nav.push({
    text: t.about,
    items: [
      { text: t.metrics, link: `${routeRoot}/about/metrics.html` },
      { text: t.qa, link: `${routeRoot}/about/qa.html` }
    ]
  })

  nav.push({
    text: t.guides,
    items: [
      { text: t.deploy, link: `${routeRoot}/DEPLOYMENT.html` },
      { text: t.migration, link: `${routeRoot}/MIGRATION.html` }
    ]
  })

  return nav
}

function legacyNavFromMeta(meta: any, locale: LocaleCode) {
  const t = i18nMap.nav[locale]
  const prefix = normalizedRoutePrefix(locale).replace(/\/$/, '')
  const years = Object.keys(meta.byYear || {}).sort().reverse()
  const firstTag = Object.keys(meta.byTag || {})[0] || 'all'
  return [
    { text: t.latest, link: `${prefix}/_generated/archive/${years[0] || ''}/` },
    {
      text: t.categories,
      items: Object.keys(meta.byCategory || {})
        .sort()
        .map(c => ({ text: c, link: `${prefix}/_generated/categories/${slug(c)}/` }))
    },
    {
      text: t.series,
      items: Object.keys(meta.bySeries || {})
        .sort()
        .map(s => ({ text: s, link: `${prefix}/_generated/series/${s}/` }))
    },
    { text: t.tags, link: `${prefix}/_generated/tags/${slug(firstTag)}/` },
    {
      text: t.about,
      items: [
        { text: t.metrics, link: `${prefix}/about/metrics.html` },
        { text: t.qa, link: `${prefix}/about/qa.html` }
      ]
    },
    {
      text: t.guides,
      items: [
        { text: t.deploy, link: `${prefix}/DEPLOYMENT.html` },
        { text: t.migration, link: `${prefix}/MIGRATION.html` }
      ]
    }
  ]
}

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
        workbox: {
          globPatterns: [
            '**/*.{js,css,html,svg,png,ico,json,txt,xml}',
            'pagefind/**/*',
            'worker/**/*'
          ],
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: navigationAllowlist,
          runtimeCaching: [
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
