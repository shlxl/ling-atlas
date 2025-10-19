import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ as statsDiff } from '../../scripts/stats-diff.mjs'

const baseline = {
  generatedAt: '2024-01-01T00:00:00.000Z',
  locales: [
    {
      locale: 'zh',
      categories: { engineering: 10, ops: 5 },
      tags: { redis: 2, cache: 3 }
    },
    {
      locale: 'en',
      categories: { engineering: 4 },
      tags: { redis: 1 }
    }
  ]
}

const current = {
  generatedAt: '2024-02-01T00:00:00.000Z',
  locales: [
    {
      locale: 'zh',
      categories: { engineering: 5, ops: 15 },
      tags: { redis: 6, cache: 1, newtag: 2 }
    },
    {
      locale: 'en',
      categories: { engineering: 4, data: 3 },
      tags: { redis: 3 }
    }
  ]
}

test('classifyDiffs flags large deltas and sorts by impact', () => {
  const entries = statsDiff.toDiffEntries(baseline, current)
  const summary = statsDiff.classifyDiffs(entries, { warnThreshold: 0.3, failThreshold: 0.6, limit: 5 })
  assert.ok(summary.failures.some(item => item.locale === 'zh' && item.type === 'categories' && item.key === 'ops'), 'zh ops should trigger failure')
  assert.ok(summary.failures.some(item => item.locale === 'zh' && item.type === 'tags' && item.key === 'redis'), 'zh redis tag should trigger failure due to large growth')
  assert.ok(
    summary.failures.some(item => item.locale === 'en' && item.type === 'categories' && item.key === 'data'),
    'en data category should trigger failure when appearing from zero baseline'
  )
})

test('formatDiff renders readable output', () => {
  const entry = statsDiff.makeDiff('zh', 'tags', 'redis', 2, 4)
  const text = statsDiff.formatDiff(entry)
  assert.match(text, /locale=zh/)
  assert.match(text, /delta=\+2/)
  assert.match(text, /100\.0%/)
})

test('gitObjectExists returns true for tracked files', async () => {
  assert.equal(await statsDiff.gitObjectExists('HEAD:package.json'), true)
})

test('detectDefaultBaseline returns snapshot reference when discoverable', async () => {
  const detected = await statsDiff.detectDefaultBaseline()
  if (detected) {
    assert.match(detected, /data\/stats\.snapshot\.json$/)
  } else {
    assert.equal(detected, undefined)
  }
})
