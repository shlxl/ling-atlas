import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeCollections } from '../../scripts/pagegen/collections.mjs'

const TMP_PREFIX = 'pagegen-collections-test-'

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
}

test('writeCollections writes markdown aggregates and nav entries', async t => {
  const root = await createTempDir()
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const lang = {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    generatedDir: root,
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

  const navEntries = await writeCollections(lang, meta)

  const categoryFile = await fs.readFile(path.join(root, 'categories', 'guides', 'index.md'), 'utf8')
  assert.ok(categoryFile.includes('分类 · Guides'), 'category markdown should contain localized title')
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
