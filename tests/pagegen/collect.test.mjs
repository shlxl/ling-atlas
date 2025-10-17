import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectPosts } from '../../scripts/pagegen/collect.mjs'

const TMP_PREFIX = 'pagegen-collect-test-'

async function setupFixture(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dir, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, contents, 'utf8')
  }
  return dir
}

test('collectPosts parses markdown and builds taxonomy indexes', async t => {
  const content = {
    'content/post-a/index.md': `---
title: Published Post
date: 2025-01-02
updated: 2025-01-05
status: published
category: Guides
tags:
  - search
  - workflow
series: Getting Started
series_slug: getting-started
slug: post-a
---

正文摘要内容
`,
    'content/post-b/index.md': `---
title: Draft Post
date: 2025-01-03
status: draft
category: Guides
tags:
  - search
slug: post-b
---

不会被收录
`
  }

  const root = await setupFixture(content)
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const lang = {
    contentDir: path.join(root, 'content'),
    basePath: '/zh/content/',
    contentFields: {
      category: ['category'],
      tags: ['tags'],
      series: ['series'],
      seriesSlug: ['series_slug'],
      status: ['status']
    }
  }

  const { list, meta } = await collectPosts(lang, { cacheDir: path.join(root, 'cache') })

  assert.equal(list.length, 1, 'only published posts are included')
  const post = list[0]
  assert.equal(post.title, 'Published Post')
  assert.equal(post.path, '/zh/content/post-a/')
  assert.equal(post.series_slug, 'getting-started')
  assert.deepEqual(post.tags, ['search', 'workflow'])
  assert.equal(post.excerpt.includes('正文摘要内容'), true)

  assert.deepEqual(Object.keys(meta.byCategory), ['Guides'])
  assert.deepEqual(meta.byCategory.Guides.map(p => p.slug), ['post-a'])

  assert.deepEqual(Object.keys(meta.bySeries), ['getting-started'])
  assert.equal(meta.bySeries['getting-started'][0].slug, 'post-a')

  assert.deepEqual(Object.keys(meta.byTag), ['search', 'workflow'])
  assert.equal(meta.byTag.search[0].slug, 'post-a')

  assert.deepEqual(Object.keys(meta.byYear), ['2025'])
})

test('collectPosts caches results across runs', async t => {
  const root = await setupFixture({
    'content/post/index.md': `---
title: Cached Post
date: 2025-03-04
status: published
category: Notes
tags:
  - cache
slug: cached-post
---

Content`,
  })

  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const cacheDir = path.join(root, 'cache')
  const lang = {
    code: 'zh',
    contentDir: path.join(root, 'content'),
    basePath: '/zh/content/',
    contentFields: {
      category: ['category'],
      tags: ['tags'],
      status: ['status']
    }
  }

  const first = await collectPosts(lang, { cacheDir })
  assert.equal(first.stats.cacheHits, 0)
  assert.equal(first.stats.cacheMisses, 1)
  assert.equal(first.stats.parsedFiles, 1)

  const second = await collectPosts(lang, { cacheDir })
  assert.equal(second.stats.cacheHits, 1)
  assert.equal(second.stats.cacheMisses, 0)
  assert.equal(second.stats.parsedFiles, 0)
})
