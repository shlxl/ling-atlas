import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMinimalSiteFixture, runPagegenCLI } from './fixtures/minimal-site.mjs'

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then(JSON.parse)
}

test(
  'pagegen generates nav manifest and aggregates in fixture project',
  { concurrency: false },
  async t => {
    const { root: fixture, cleanup } = await createMinimalSiteFixture()
    t.after(cleanup)

    try {
      const result = await runPagegenCLI(fixture)
      if (result.code !== 0) {
        console.error('[nav-manifest.test] stdout:', result.stdout)
        console.error('[nav-manifest.test] stderr:', result.stderr)
      }
      assert.equal(result.code, 0, `pagegen exited with ${result.code}`)

      const zhManifest = await readJson(path.join(fixture, 'docs/zh/_generated/nav.manifest.zh.json'))
      assert.equal(zhManifest.locale, 'zh')
      assert.ok(zhManifest.categories['工程'], 'zh nav manifest should include 工程 category')

      const zhCategoryMd = await fs.readFile(
        path.join(fixture, 'docs/zh/_generated/categories/工程/index.md'),
        'utf8'
      )
      assert.match(zhCategoryMd, /测试文章/)

      const enManifest = await readJson(path.join(fixture, 'docs/en/_generated/nav.manifest.en.json'))
      assert.equal(enManifest.locale, 'en')
      assert.ok(enManifest.categories.engineering, 'en nav manifest should include engineering category')

      const i18nMap = await readJson(path.join(fixture, 'docs/public/i18n-map.json'))
      assert.ok(i18nMap['post-a'], 'i18n map should contain post-a key')
      assert.equal(i18nMap['post-a'].zh, '/zh/content/post-a/')
      assert.equal(i18nMap['post-a'].en, '/en/content/post-a/')

      const metricsLog = await readJson(path.join(fixture, 'data/pagegen-metrics.json'))
      const latest = metricsLog.at(-1)
      const zhNavSummary = latest.nav.locales.find(item => item.locale === 'zh')
      assert(zhNavSummary, 'nav metrics should include zh locale')
      assert.ok(zhNavSummary.categories >= 1, 'zh nav metrics should report category count')
      assert.ok(latest.collect?.summary?.cacheHitRate !== undefined, 'collect summary should include cache hit rate')
      assert.ok(
        Object.prototype.hasOwnProperty.call(latest.write?.summary || {}, 'hashMatches'),
        'write summary should include hashMatches'
      )
    } catch (error) {
      process.stderr.write(
        `[nav-manifest.test] failure diagnostics: ${error?.stack || error?.message || String(error)}\n`
      )
      throw error
    }
  }
)
