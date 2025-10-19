import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createI18nRegistry } from '../../scripts/pagegen/i18n-registry.mjs'

const TMP_PREFIX = 'pagegen-i18n-test-'

function createLocales(tmpDir) {
  return [
    {
      code: 'zh',
      manifestLocale: 'zh',
      aliasLocaleIds: [],
      localeRoot: '/zh/',
      navManifestFile: 'nav.zh.json',
      navManifestPath: path.join(tmpDir, 'nav.zh.json')
    },
    {
      code: 'en',
      manifestLocale: 'en',
      aliasLocaleIds: [],
      localeRoot: '/en/',
      navManifestFile: 'nav.en.json',
      navManifestPath: path.join(tmpDir, 'nav.en.json')
    }
  ]
}

const NAV_CONFIG_FIXTURE = {
  aggregates: {
    archive: { type: 'archive', labelKey: 'nav.archive', manifestKey: 'archive' },
    categories: { type: 'category', labelKey: 'nav.categories', manifestKey: 'categories' },
    series: { type: 'series', labelKey: 'nav.series', manifestKey: 'series' },
    tags: { type: 'tag', labelKey: 'nav.tags', manifestKey: 'tags' }
  },
  sections: [],
  links: {}
}

test('i18n registry merges posts, tags, and nav entries', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })
  const locales = createLocales(tmpDir)
  const registry = createI18nRegistry(locales, {
    tagAlias: { Workflow: 'workflow' },
    navConfig: NAV_CONFIG_FIXTURE
  })

  const zhNav = {
    categories: new Map([['guides', '/zh/_generated/categories/guides/']]),
    series: new Map(),
    tags: new Map(),
    archive: new Map([['2025', '/zh/_generated/archive/2025/']])
  }
  const enNav = {
    categories: new Map([['guides', '/en/_generated/categories/guides/']]),
    series: new Map(),
    tags: new Map(),
    archive: new Map([['2025', '/en/_generated/archive/2025/']])
  }

  registry.addNavEntries(locales[0], zhNav)
  registry.addNavEntries(locales[1], enNav)

  registry.registerPost(
    {
      relative: 'guides/post',
      path: '/zh/content/post/',
      category_slug: 'guides',
      series_slug: '',
      tags: ['Workflow'],
      year: '2025'
    },
    locales[0]
  )

  registry.registerPost(
    {
      relative: 'guides/post',
      path: '/en/content/post/',
      category_slug: 'guides',
      series_slug: '',
      tags: ['workflow'],
      year: '2025'
    },
    locales[1]
  )

  const i18nMap = registry.getI18nMap()
  assert.deepEqual(i18nMap['guides/post'], {
    zh: '/zh/content/post/',
    en: '/en/content/post/'
  })

  const tagKey = 'tags/workflow'
  assert.ok(i18nMap[tagKey], 'tag mapping should exist')
  assert.equal(i18nMap[tagKey].zh, '/zh/_generated/tags/workflow/')
  assert.equal(i18nMap[tagKey].en, '/en/_generated/tags/workflow/')

  const payloads = registry.getNavManifestPayloads()
  const zhPayload = payloads.find(item => item.lang.manifestLocale === 'zh').payload
  const enPayload = payloads.find(item => item.lang.manifestLocale === 'en').payload

  assert.equal(zhPayload.categories.guides, '/zh/_generated/categories/guides/')
  assert.equal(enPayload.archive['2025'], '/en/_generated/archive/2025/')
})

test('i18n registry skips locales without backing aggregates', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const locales = createLocales(tmpDir)
  const registry = createI18nRegistry(locales, { navConfig: NAV_CONFIG_FIXTURE })

  const enNav = {
    categories: new Map([['guides', '/en/_generated/categories/guides/']]),
    series: new Map(),
    tags: new Map([['workflow', '/en/_generated/tags/workflow/']]),
    archive: new Map([['2025', '/en/_generated/archive/2025/']])
  }

  registry.addNavEntries(locales[1], enNav)

  registry.registerPost(
    {
      relative: 'guides/post',
      path: '/en/content/post/',
      category_slug: 'guides',
      series_slug: '',
      tags: ['workflow'],
      year: '2025'
    },
    locales[1]
  )

  const i18nMap = registry.getI18nMap()
  assert.equal(i18nMap['guides/post'], undefined)
  assert.equal(i18nMap['tags/workflow'], undefined)

  const payloads = registry.getNavManifestPayloads()
  const zhPayload = payloads.find(item => item.lang.manifestLocale === 'zh').payload
  const enPayload = payloads.find(item => item.lang.manifestLocale === 'en').payload

  assert.deepEqual(zhPayload.categories, {})
  assert.deepEqual(zhPayload.tags, {})
  assert.deepEqual(zhPayload.archive, {})
  assert.equal(Object.keys(enPayload.categories).length, 1)
  assert.equal(enPayload.categories.guides, '/en/_generated/categories/guides/')
  assert.equal(enPayload.tags.workflow, '/en/_generated/tags/workflow/')
})

test('i18n registry keeps locale-specific aggregates separated', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const locales = createLocales(tmpDir)
  const registry = createI18nRegistry(locales, { navConfig: NAV_CONFIG_FIXTURE })

  const zhNav = {
    categories: new Map([['cases', '/zh/_generated/categories/cases/']]),
    series: new Map([['deep-dive', '/zh/_generated/series/deep-dive/']]),
    tags: new Map(),
    archive: new Map([['2024', '/zh/_generated/archive/2024/']])
  }

  registry.addNavEntries(locales[0], zhNav)

  registry.registerPost(
    {
      relative: 'cases/post',
      path: '/zh/content/cases/post/',
      category_slug: 'cases',
      series_slug: 'deep-dive',
      tags: [],
      year: '2024'
    },
    locales[0]
  )

  const payloads = registry.getNavManifestPayloads()
  const zhPayload = payloads.find(item => item.lang.manifestLocale === 'zh').payload
  const enPayload = payloads.find(item => item.lang.manifestLocale === 'en').payload

  assert.equal(zhPayload.categories.cases, '/zh/_generated/categories/cases/')
  assert.equal(zhPayload.series['deep-dive'], '/zh/_generated/series/deep-dive/')
  assert.equal(zhPayload.archive['2024'], '/zh/_generated/archive/2024/')
  assert.deepEqual(enPayload.categories, {})
  assert.deepEqual(enPayload.series, {})
  assert.deepEqual(enPayload.archive, {})
})

test('i18n registry throws when aggregates definition is missing', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const locales = createLocales(tmpDir)

  assert.throws(
    () =>
      createI18nRegistry(locales, {
        navConfig: { aggregates: {}, sections: [], links: {} }
      }),
    /nav config 缺少 aggregates/,
    'missing aggregates should throw'
  )
})

test('i18n registry throws when nav entries contain empty slug', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const locales = createLocales(tmpDir)
  const registry = createI18nRegistry(locales, { navConfig: NAV_CONFIG_FIXTURE })

  assert.throws(
    () =>
      registry.addNavEntries(locales[0], {
        categories: new Map([['', '/zh/_generated/categories/empty/']])
      }),
    /空白 slug/,
    'empty slug should trigger nav error'
  )
})

test('i18n registry rejects unknown nav manifest buckets', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const locales = createLocales(tmpDir)
  const registry = createI18nRegistry(locales, { navConfig: NAV_CONFIG_FIXTURE })

  assert.throws(
    () =>
      registry.addNavEntries(locales[0], {
        custom: new Map([['foo', '/zh/custom/foo/']])
      }),
    /nav manifest 缺少键 "custom"/, 
    'unknown manifest key should throw'
  )
})
