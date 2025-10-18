import { defineConfig, type HeadConfig } from 'vitepress'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import cssnano from 'cssnano'
import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'
import { navFromMeta as buildNavFromMeta } from './theme/nav-core.mjs'
import type { NavManifest, NavTranslations } from './theme/nav-core.mjs'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const NAV_CONFIG = loadNavConfig()
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_UI,
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

const themeComponent = (file: string) =>
  fileURLToPath(new URL(`./theme/components/${file}`, import.meta.url))

const navComponentOverrides = new Map(
  [
    'VPNavBar.vue',
    'VPNavBarExtra.vue',
    'VPNavBarTranslations.vue',
    'VPNavScreen.vue',
    'VPNavScreenTranslations.vue'
  ].map(name => [name, themeComponent(name)])
)

const overrideNavComponentPlugin: Plugin = {
  name: 'ling-atlas:override-theme-nav-components',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (!importer) return null
    const normalizedImporter = importer.replace(/\\/g, '/')
    if (!normalizedImporter.includes('vitepress/dist/client/theme-default')) {
      return null
    }
    const normalizedSource = source.replace(/\\/g, '/')
    const [bareSource] = normalizedSource.split('?')
    for (const [name, replacement] of navComponentOverrides) {
      if (
        bareSource === `./${name}` ||
        bareSource.endsWith(`/components/${name}`)
      ) {
        return replacement
      }
    }
    return null
  }
}

type LocaleCopy = {
  label: string
  lang: string
  title: string
  description: string
  lightModeSwitchTitle: string
  darkModeSwitchTitle: string
}

function toLocaleCopy(locale: LocaleCode): LocaleCopy {
  const fallback: LocaleCopy = {
    label: locale.toUpperCase(),
    lang: locale,
    title: 'Ling Atlas',
    description: '',
    lightModeSwitchTitle: 'Switch to light mode',
    darkModeSwitchTitle: 'Switch to dark mode'
  }

  const ui = (LOCALE_UI as Record<string, Partial<LocaleCopy> | undefined>)[locale]
  if (!ui) return fallback
  return {
    label: ui.label ?? fallback.label,
    lang: ui.lang ?? fallback.lang,
    title: ui.title ?? fallback.title,
    description: ui.description ?? fallback.description,
    lightModeSwitchTitle: ui.lightModeSwitchTitle ?? fallback.lightModeSwitchTitle,
    darkModeSwitchTitle: ui.darkModeSwitchTitle ?? fallback.darkModeSwitchTitle
  }
}

const localeCopy: Record<LocaleCode, LocaleCopy> = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [locale.code, toLocaleCopy(locale.code as LocaleCode)])
) as Record<LocaleCode, LocaleCopy>

const localizedLocaleConfigs = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => {
    const code = locale.code
    const strings = localeCopy[code as LocaleCode]
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
            collator: new Intl.Collator(code === 'en' ? 'en' : 'zh-CN'),
            config: NAV_CONFIG
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
const pwaGlobPatterns = [
  '**/*.{js,css,html,svg,png,ico,json,txt,xml}',
  'pagefind/**/*',
  'worker/**/*'
]

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

function loadNavConfig() {
  try {
    const configPath = path.join(ROOT_DIR, 'schema', 'nav.json')
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    console.warn('[config] failed to load schema/nav.json:', error.message)
    return {}
  }
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
      overrideNavComponentPlugin,
      VitePWA({
        registerType: 'autoUpdate',
        base: normalizedBase,
        filename: 'service-worker.ts',
        srcDir: '.vitepress',
        strategies: 'injectManifest',
        injectManifest: {
          globPatterns: pwaGlobPatterns,
          globDirectory: 'docs/.vitepress/dist'
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
    resolve: {
      alias: {
        'vitepress/dist/client/theme-default/components/VPNavBar.vue': themeComponent(
          'VPNavBar.vue'
        ),
        'vitepress/dist/client/theme-default/components/VPNavBarExtra.vue': themeComponent(
          'VPNavBarExtra.vue'
        ),
        'vitepress/dist/client/theme-default/components/VPNavBarTranslations.vue': themeComponent(
          'VPNavBarTranslations.vue'
        ),
        'vitepress/dist/client/theme-default/components/VPNavScreen.vue': themeComponent(
          'VPNavScreen.vue'
        ),
        'vitepress/dist/client/theme-default/components/VPNavScreenTranslations.vue': themeComponent(
          'VPNavScreenTranslations.vue'
        )
      }
    },
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
