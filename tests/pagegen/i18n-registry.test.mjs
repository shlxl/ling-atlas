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

test('i18n registry merges posts, tags, and nav entries', async t => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })
  const locales = createLocales(tmpDir)
  const registry = createI18nRegistry(locales, { tagAlias: { Workflow: 'workflow' } })

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
