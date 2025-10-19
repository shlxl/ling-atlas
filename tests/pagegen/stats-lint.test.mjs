import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { collectStats } from '../../scripts/stats-lint.mjs'

async function setupFixture(structure) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'stats-lint-test-'))
  for (const [rel, content] of Object.entries(structure)) {
    const fullPath = path.join(tmpRoot, rel)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf8')
  }
  return tmpRoot
}

test('collectStats aggregates categories and tags per locale', async () => {
  const fixture = await setupFixture({
    'docs/zh/content/post/index.md': `---\ntitle: 中文\ncategory_zh: 工程\ntags_zh: [自动化, 工作流]\n---\n正文`,
    'docs/en/content/guide/index.md': `---\ntitle: English\ncategory_en: Engineering\ntags_en: automation, workflow\n---\nBody`
  })

  const locales = [
    {
      code: 'zh',
      contentDir: path.join(fixture, 'docs/zh/content'),
      contentFields: {
        category: ['category_zh', 'category'],
        tags: ['tags_zh', 'tags']
      }
    },
    {
      code: 'en',
      contentDir: path.join(fixture, 'docs/en/content'),
      contentFields: {
        category: ['category_en', 'category'],
        tags: ['tags_en', 'tags']
      }
    }
  ]

  const stats = await collectStats(locales)
  const zhStats = stats.find(item => item.locale === 'zh')
  const enStats = stats.find(item => item.locale === 'en')

  assert.ok(zhStats)
  assert.ok(enStats)
  assert.equal(zhStats.categories.get('工程'), 1)
  assert.equal(enStats.categories.get('Engineering'), 1)
  assert.ok(zhStats.tags.has('自动化'))
  assert.ok(enStats.tags.has('automation'))
});
