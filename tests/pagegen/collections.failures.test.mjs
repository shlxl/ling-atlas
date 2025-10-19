import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeCollections } from '../../scripts/pagegen/collections.mjs'

const TMP_PREFIX = 'pagegen-collections-fail-'

function createLangConfig(rootDir) {
  const identity = value => value
  return {
    code: 'zh',
    manifestLocale: 'zh',
    generatedDir: rootDir,
    labels: {
      category: identity,
      series: identity,
      tag: identity,
      archive: identity
    }
  }
}

test('writeCollections propagates fs write failures', async t => {
  const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(generatedDir, { recursive: true, force: true })
  })

  const lang = createLangConfig(generatedDir)
  const post = {
    title: '测试文章',
    path: '/zh/content/test/',
    date: '2025-01-01',
    updated: '2025-01-02',
    excerpt: '摘要',
    tags: ['tag-1']
  }
  const meta = {
    byCategory: { 分类: [post] },
    bySeries: {},
    byTag: { 'tag-1': [post] },
    byYear: { '2025': [post] },
    all: [post]
  }

  const writeSpy = t.mock.method(fs, 'writeFile', async () => {
    throw new Error('mock collection failure')
  })

  await assert.rejects(() => writeCollections(lang, meta, null, { dryRun: false }), /mock collection failure/)
  assert.ok(writeSpy.mock.callCount() >= 1)
})
