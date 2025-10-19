import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')

async function copySchemaFile(name, targetDir) {
  const source = path.join(PROJECT_ROOT, 'schema', name)
  const target = path.join(targetDir, name)
  await fs.copyFile(source, target)
}

export async function createMinimalSiteFixture(options = {}) {
  const emptyNavLocales = new Set(options.emptyNavLocales || [])
  const parseErrorLocales = new Set(options.parseErrorLocales || [])
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pagegen-fixture-'))
  const schemaDir = path.join(root, 'schema')
  await fs.mkdir(schemaDir, { recursive: true })
  await copySchemaFile('locales.schema.json', schemaDir)
  await copySchemaFile('nav.schema.json', schemaDir)
  await copySchemaFile('tag-alias.schema.json', schemaDir)
  await copySchemaFile('collections.templates.schema.json', schemaDir)
  await copySchemaFile('collections.templates.json', schemaDir)

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
        collectionsTemplate: 'zh-default',
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
        collectionsTemplate: 'en-default',
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
  await fs.writeFile(
    path.join(schemaDir, 'tag-alias.json'),
    JSON.stringify({ $schema: './tag-alias.schema.json', aliases: {} }, null, 2)
  )

  const docsZh = path.join(root, 'docs', 'zh', 'content', 'post-a')
  const docsEn = path.join(root, 'docs', 'en', 'content', 'post-a')
  await fs.mkdir(docsZh, { recursive: true })
  await fs.mkdir(docsEn, { recursive: true })

  const zhPost = parseErrorLocales.has('zh')
    ? `---\n` +
      `title: [\n` +
      `status: published\n`
    : `---\n` +
      `title: 测试文章\n` +
      `category_zh: 工程\n` +
      `tags_zh: [自动化]\n` +
      `series: 系列一\n` +
      `date: 2025-01-01\n` +
      `updated: 2025-01-02\n` +
      `status: ${emptyNavLocales.has('zh') ? 'draft' : 'published'}\n` +
      `---\n\n这是中文内容。`

  const enPost = parseErrorLocales.has('en')
    ? `---\n` +
      `title: [\n` +
      `status: published\n`
    : `---\n` +
      `title: Test Article\n` +
      `category_en: Engineering\n` +
      `tags_en: [automation]\n` +
      `series_en: Series One\n` +
      `date: 2025-01-03\n` +
      `updated: 2025-01-04\n` +
      `status: ${emptyNavLocales.has('en') ? 'draft' : 'published'}\n` +
      `---\n\nEnglish content.`

  await fs.writeFile(path.join(docsZh, 'index.md'), zhPost)
  await fs.writeFile(path.join(docsEn, 'index.md'), enPost)

  const scriptsSrc = path.join(PROJECT_ROOT, 'scripts')
  const scriptsDest = path.join(root, 'scripts')
  await fs.cp(scriptsSrc, scriptsDest, { recursive: true })

  try {
    await fs.symlink(path.join(PROJECT_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }

  const metaPaths = {
    zh: path.join(root, 'docs', 'zh', '_generated', 'meta.zh.json'),
    en: path.join(root, 'docs', 'en', '_generated', 'meta.en.json')
  }

  if (options.readOnlyMeta) {
    await fs.mkdir(path.dirname(metaPaths.zh), { recursive: true })
    await fs.mkdir(metaPaths.zh, { recursive: true })
  }

  const metricsLog = path.join(root, 'data', 'pagegen-metrics.json')

  return {
    root,
    paths: { meta: metaPaths, metricsLog },
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true })
    }
  }
}

export function runPagegenCLI(root, args = [], env = {}) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [path.join(root, 'scripts', 'pagegen.mjs'), ...args],
      {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr })
      }
    )
  })
}

export async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
