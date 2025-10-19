import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

async function copySchemaFile(name, targetDir) {
  const source = path.join(PROJECT_ROOT, 'schema', name)
  const target = path.join(targetDir, name)
  await fs.copyFile(source, target)
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pagegen-e2e-'))
  const schemaDir = path.join(root, 'schema')
  await fs.mkdir(schemaDir, { recursive: true })
  await copySchemaFile('locales.schema.json', schemaDir)
  await copySchemaFile('nav.schema.json', schemaDir)
  await copySchemaFile('tag-alias.schema.json', schemaDir)

  const localesConfig = {
    $schema: './locales.schema.json',
    locales: [
      {
        code: 'zh',
        preferred: true,
        manifestLocale: 'zh',
        vitepressLocaleKey: 'zh',
        labels: {
          category: '分类 · {value}',
          series: '连载 · {value}',
        tag: '标签 · {value}',
        archive: '归档 · {value}',
        rssTitle: 'Ling Atlas',
        rssDesc: '最新更新'
      },
      rssFile: 'rss.xml',
      sitemapFile: 'sitemap.xml',
        contentFields: {
          category: ['category_zh', 'category'],
          tags: ['tags_zh', 'tags'],
          series: ['series'],
          seriesSlug: ['series_slug'],
          status: ['status']
        }
      },
      {
        code: 'en',
        manifestLocale: 'en',
        vitepressLocaleKey: 'en',
        labels: {
          category: 'Category · {value}',
          series: 'Series · {value}',
        tag: 'Tag · {value}',
        archive: 'Archive · {value}',
        rssTitle: 'Ling Atlas (EN)',
        rssDesc: 'Latest updates'
      },
      rssFile: 'rss-en.xml',
      sitemapFile: 'sitemap-en.xml',
        contentFields: {
          category: ['category_en', 'category'],
          tags: ['tags_en', 'tags'],
          series: ['series_en', 'series'],
          seriesSlug: ['series_slug_en', 'series_slug'],
          status: ['status']
        }
      }
    ]
  }

  const navConfig = {
    $schema: './nav.schema.json',
    aggregates: {
      latest: { type: 'archive', labelKey: 'nav.latest', manifestKey: 'archive' },
      categories: { type: 'category', labelKey: 'nav.categories', manifestKey: 'categories' },
      series: { type: 'series', labelKey: 'nav.series', manifestKey: 'series' },
      tags: { type: 'tag', labelKey: 'nav.tags', manifestKey: 'tags' }
    },
    sections: [
      { key: 'latest', titleKey: 'nav.latest', kind: 'aggregate', aggregateKey: 'latest' },
      { key: 'categories', titleKey: 'nav.categories', kind: 'aggregate', aggregateKey: 'categories' }
    ],
    links: {}
  }

  await fs.writeFile(path.join(schemaDir, 'locales.json'), JSON.stringify(localesConfig, null, 2))
  await fs.writeFile(path.join(schemaDir, 'nav.json'), JSON.stringify(navConfig, null, 2))
  await fs.writeFile(path.join(schemaDir, 'tag-alias.json'), JSON.stringify({ $schema: './tag-alias.schema.json', aliases: {} }, null, 2))

  const docsZh = path.join(root, 'docs', 'zh', 'content', 'post-a')
  const docsEn = path.join(root, 'docs', 'en', 'content', 'post-a')
  await fs.mkdir(docsZh, { recursive: true })
  await fs.mkdir(docsEn, { recursive: true })

  const zhPost = `---\ntitle: 测试文章\ncategory_zh: 工程\ntags_zh: [自动化]\nseries: 系列一\ndate: 2025-01-01\nupdated: 2025-01-02\nstatus: published\n---\n\n这是中文内容。`
  const enPost = `---\ntitle: Test Article\ncategory_en: Engineering\ntags_en: [automation]\nseries_en: Series One\ndate: 2025-01-03\nupdated: 2025-01-04\nstatus: published\n---\n\nEnglish content.`

  await fs.writeFile(path.join(docsZh, 'index.md'), zhPost)
  await fs.writeFile(path.join(docsEn, 'index.md'), enPost)

  // copy scripts目录（包含 pagegen 所需模块）
  const scriptsSrc = path.join(PROJECT_ROOT, 'scripts')
  const scriptsDest = path.join(root, 'scripts')
  await fs.cp(scriptsSrc, scriptsDest, { recursive: true })

  // 复用仓库依赖
  try {
    await fs.symlink(path.join(PROJECT_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }

  return root
}

function runPagegen(root, args = []) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [path.join(root, 'scripts', 'pagegen.mjs'), ...args],
      {
        cwd: root,
        env: { ...process.env },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr })
      }
    )
  })
}

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then(JSON.parse)
}

test(
  'pagegen generates nav manifest and aggregates in fixture project',
  { concurrency: false },
  async t => {
    let fixture
    try {
      fixture = await createFixture()
    } catch (error) {
      console.error('[nav-manifest.test] fixture creation failed:', error)
      throw error
    }
    t.after(async () => {
      await fs.rm(fixture, { recursive: true, force: true })
    })

    try {
      const result = await runPagegen(fixture)
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
    } catch (error) {
      process.stderr.write(
        `[nav-manifest.test] failure diagnostics: ${error?.stack || error?.message || String(error)}\n`
      )
      throw error
    }
  }
)
