import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeCollections, __test__ } from '../../scripts/pagegen/collections.mjs'

const TMP_PREFIX = 'pagegen-collections-test-'

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
}

test('writeCollections writes markdown aggregates using configured template', async t => {
  const root = await createTempDir()
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const lang = {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    generatedDir: root,
    collectionsTemplate: 'zh-default',
    labels: {
      category: value => `分类 · ${value}`,
      series: value => `连载 · ${value}`,
      tag: value => `标签 · ${value}`,
      archive: value => `归档 · ${value}`
    }
  }

  const meta = {
    byCategory: {
      Guides: [
        { title: 'Alpha', path: '/zh/content/alpha/', updated: '2025-02-10', date: '2025-02-01', excerpt: '第一篇' },
        { title: 'Beta', path: '/zh/content/beta/', updated: '', date: '2024-12-31', excerpt: '第二篇' }
      ]
    },
    bySeries: { seriesA: [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] },
    byTag: { workflow: [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] },
    byYear: { '2025': [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] }
  }

  const navEntries = await writeCollections(lang, meta)

  const categoryFile = await fs.readFile(path.join(root, 'categories', 'guides', 'index.md'), 'utf8')
  assert.ok(categoryFile.includes('分类 · Guides'), 'category markdown should contain localized title')
  const alphaIndex = categoryFile.indexOf('- [Alpha]')
  const betaIndex = categoryFile.indexOf('- [Beta]')
  assert(alphaIndex >= 0 && betaIndex >= 0, 'category markdown should list items')
  assert(alphaIndex < betaIndex, 'template sort order should place newest entry first')
  assert.match(categoryFile, /（更:2025-02-10）/, 'template should render updated suffix in Chinese')
  assert.match(categoryFile, /> 第一篇/, 'template should render excerpt block')
  assert.ok(navEntries.categories.has('guides'))
  assert.equal(navEntries.categories.get('guides'), '/zh/_generated/categories/guides/')

  const seriesFile = await fs.readFile(path.join(root, 'series', 'seriesA', 'index.md'), 'utf8')
  assert.ok(seriesFile.includes('连载 · seriesA'))
  assert.ok(navEntries.series.has('seriesA'))

  const tagFile = await fs.readFile(path.join(root, 'tags', 'workflow', 'index.md'), 'utf8')
  assert.ok(tagFile.includes('标签 · workflow'))
  assert.ok(navEntries.tags.has('workflow'))

  const archiveFile = await fs.readFile(path.join(root, 'archive', '2025', 'index.md'), 'utf8')
  assert.ok(archiveFile.includes('归档 · 2025'))
  assert.ok(navEntries.archive.has('2025'))
})

test('writeCollections supports dry run without touching filesystem', async t => {
  const root = await createTempDir()
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const lang = {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    generatedDir: root,
    collectionsTemplate: 'zh-default',
    labels: {
      category: value => `分类 · ${value}`,
      series: value => `连载 · ${value}`,
      tag: value => `标签 · ${value}`,
      archive: value => `归档 · ${value}`
    }
  }

  const meta = {
    byCategory: { Guides: [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] },
    bySeries: { seriesA: [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] },
    byTag: { workflow: [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] },
    byYear: { '2025': [{ title: 'Post', path: '/zh/content/post/', updated: '', date: '2025-01-01', excerpt: '' }] }
  }

  const navEntries = await writeCollections(lang, meta, null, { dryRun: true })

  assert.ok(navEntries.categories.has('guides'))
  assert.equal(navEntries.categories.get('guides'), '/zh/_generated/categories/guides/')

  await assert.rejects(() => fs.access(path.join(root, 'categories')), /ENOENT/)
})

test('writeCollections uses human-readable series label and falls back to updated date', async t => {
  const root = await createTempDir()
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const formatter = value => `系列 · ${value}`
  const lang = {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    generatedDir: root,
    collectionsTemplate: 'zh-default',
    labels: {
      category: formatter,
      series: formatter,
      tag: formatter,
      archive: formatter
    }
  }

  const post = {
    title: '测试系列文章',
    path: '/zh/content/series-post/',
    date: '',
    updated: '2025-01-02',
    excerpt: '摘要',
    series: '本地化系列',
    series_slug: 'series-post',
    tags: [],
    slug: 'series-post'
  }

  const meta = {
    byCategory: {},
    bySeries: { 'series-post': [post] },
    byTag: {},
    byYear: {},
    all: [post]
  }

  const tasks = []
  const writer = {
    addFileTask(task) {
      tasks.push(task)
    }
  }

  const navEntries = await writeCollections(lang, meta, writer, { dryRun: false })

  assert.strictEqual(navEntries.series.get('series-post'), '/zh/_generated/series/series-post/')

  const seriesTask = tasks.find(task => task.target.endsWith('series/series-post/index.md'))
  assert.ok(seriesTask, 'series collection should schedule a write task')
  assert.match(seriesTask.content, /title: 系列 · 本地化系列/)
  assert.match(seriesTask.content, /· 2025-01-02/)
  assert.ok(!seriesTask.content.includes('undefined'), 'date fallback should not emit undefined')
})

test('writeCollections falls back to default markdown when template is missing', async t => {
  const root = await createTempDir()
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const lang = {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    generatedDir: root,
    collectionsTemplate: 'non-existent-template',
    labels: {
      category: value => `分类 · ${value}`,
      series: value => `连载 · ${value}`,
      tag: value => `标签 · ${value}`,
      archive: value => `归档 · ${value}`
    }
  }

  const meta = {
    byCategory: {
      Guides: [
        { title: 'Older', path: '/zh/content/older/', updated: '', date: '2024-01-01', excerpt: '' },
        { title: 'Newer', path: '/zh/content/newer/', updated: '', date: '2025-01-01', excerpt: '' }
      ]
    },
    bySeries: {},
    byTag: {},
    byYear: {}
  }

  await writeCollections(lang, meta)

  const categoryFile = await fs.readFile(path.join(root, 'categories', 'guides', 'index.md'), 'utf8')
  const olderIndex = categoryFile.indexOf('- [Older]')
  const newerIndex = categoryFile.indexOf('- [Newer]')
  assert(olderIndex >= 0 && newerIndex >= 0, 'fallback markdown should list all items')
  assert(olderIndex < newerIndex, 'fallback should preserve original order when template is missing')
})

test('writeCollections supports custom registered templates', async t => {
  const root = await createTempDir()
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    __test__.unregisterTemplate('spec-test-template')
  })

  __test__.registerTemplate('spec-test-template', {
    defaults: {
      markdown: '---\ntitle: {title}\nlayout: aggregate\ncount: {count}\n---\n\n{items}\n',
      item: '* {index}. {title} ({dateSuffix})',
      itemSeparator: '\n',
      placeholders: {
        dateSuffix: { fields: ['date'], format: '{value}', whenEmpty: 'n/a' }
      }
    }
  })

  const lang = {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    generatedDir: root,
    collectionsTemplate: 'spec-test-template',
    labels: {
      category: value => `模板测试 · ${value}`,
      series: value => value,
      tag: value => value,
      archive: value => value
    }
  }

  const meta = {
    byCategory: { Guides: [{ title: '模板文章', path: '/zh/content/post/', date: '2025-01-01' }] },
    bySeries: {},
    byTag: {},
    byYear: {}
  }

  await writeCollections(lang, meta)

  const categoryFile = await fs.readFile(path.join(root, 'categories', 'guides', 'index.md'), 'utf8')
  assert.match(categoryFile, /layout: aggregate/, 'custom template frontmatter should be applied')
  assert.match(categoryFile, /count: 1/, 'custom template should expose aggregate count placeholder')
  assert.match(categoryFile, /\* 1\. 模板文章 \(2025-01-01\)/, 'custom template should use custom item formatting')
})
