import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createLocaleMapCore } from '../../docs/.vitepress/theme/composables/locale-map-core.mjs'

const supportedLocales = [
  { code: 'zh' },
  { code: 'en' }
]

const baseDeps = {
  supportedLocales,
  getFallbackLocale: () => 'zh',
  normalizeLocalePath: input => {
    if (!input) return '/'
    let value = String(input)
    if (!value.startsWith('/')) value = `/${value}`
    if (!value.endsWith('/')) value = `${value}/`
    return value.replace(/\/+/g, '/')
  },
  routePrefix: locale => `/${locale}/`
}

const localeMapCore = createLocaleMapCore(baseDeps)

beforeEach(() => {
  localeMapCore.resetFallbackCache()
})

function createState(overrides = {}) {
  return {
    lookup: {},
    manifests: {},
    ...overrides
  }
}

test('resolveTargetPath uses direct i18n map when available', () => {
  const state = createState({
    lookup: {
      '/zh/_generated/categories/guides/': {
        zh: '/zh/_generated/categories/guides/',
        en: '/en/_generated/categories/guides/'
      }
    }
  })

  const result = localeMapCore.resolveTargetPath(state, '/zh/_generated/categories/guides/', 'zh', 'en')
  assert.equal(result.reason, 'exact')
  assert.equal(result.hasMapping, true)
  assert.equal(result.path, '/en/_generated/categories/guides/')
})

test('resolveTargetPath falls back to manifest entry when slug exists in target locale', () => {
  const state = createState({
    manifests: {
      en: {
        locale: 'en',
        categories: { guides: '/en/_generated/categories/guides/' },
        series: {},
        tags: {},
        archive: {}
      }
    }
  })

  const result = localeMapCore.resolveTargetPath(state, '/zh/_generated/categories/guides/', 'zh', 'en')
  assert.equal(result.reason, 'manifest-match')
  assert.equal(result.hasMapping, true)
  assert.equal(result.path, '/en/_generated/categories/guides/')
})

test('resolveTargetPath returns first manifest entry of same type when slug missing', () => {
  const state = createState({
    manifests: {
      en: {
        locale: 'en',
        categories: { guides: '/en/_generated/categories/guides/' },
        series: {},
        tags: {},
        archive: {}
      }
    }
  })

  const result = localeMapCore.resolveTargetPath(state, '/zh/_generated/categories/cases/', 'zh', 'en')
  assert.equal(result.reason, 'manifest-fallback')
  assert.equal(result.hasMapping, false)
  assert.equal(result.path, '/en/_generated/categories/guides/')
})

test('resolveTargetPath falls back to locale home when aggregate type missing', () => {
  const state = createState({
    manifests: {
      en: {
        locale: 'en',
        categories: {},
        series: {},
        tags: {},
        archive: {}
      }
    }
  })

  const result = localeMapCore.resolveTargetPath(state, '/zh/_generated/series/deep-dive/', 'zh', 'en')
  assert.equal(result.reason, 'home')
  assert.equal(result.hasMapping, false)
  assert.equal(result.path, '/en/')
})

test('detectLocaleFromPath identifies locale by longest prefix', () => {
  const zhPath = localeMapCore.normalizeRoutePath('/zh/_generated/archive/2024/')
  const enPath = localeMapCore.normalizeRoutePath('/en/content/guide/')
  assert.equal(localeMapCore.detectLocaleFromPath(zhPath), 'zh')
  assert.equal(localeMapCore.detectLocaleFromPath(enPath), 'en')
})

test('detectLocaleFromPath falls back to default locale when prefix missing', () => {
  const rootPath = localeMapCore.normalizeRoutePath('/')
  const unknownPath = localeMapCore.normalizeRoutePath('/guides/getting-started/')
  assert.equal(localeMapCore.detectLocaleFromPath(rootPath), 'zh')
  assert.equal(localeMapCore.detectLocaleFromPath(unknownPath), 'zh')
})

test('getFallbackPath returns normalized locale roots', () => {
  assert.equal(localeMapCore.getFallbackPath('zh'), '/zh/')
  assert.equal(localeMapCore.getFallbackPath('en'), '/en/')
})

test('hasLocalePrefix flags supported locale segments', () => {
  assert.equal(localeMapCore.hasLocalePrefix('/zh/_generated/archive/2024/'), true)
  assert.equal(localeMapCore.hasLocalePrefix('/en/content/example/'), true)
  assert.equal(localeMapCore.hasLocalePrefix('/unknown/path/'), false)
  assert.equal(localeMapCore.hasLocalePrefix('/'), false)
})

test('compareLocale reports detected locale and match status', () => {
  const zhResult = localeMapCore.compareLocale('/zh/_generated/archive/2024/', 'zh')
  assert.deepEqual(zhResult, { locale: 'zh', matches: true })

  const enResult = localeMapCore.compareLocale('/en/content/example/', 'zh')
  assert.deepEqual(enResult, { locale: 'en', matches: false })

  const fallbackResult = localeMapCore.compareLocale('/non-localized/path/', 'en')
  assert.deepEqual(fallbackResult, { locale: 'zh', matches: false })
})
