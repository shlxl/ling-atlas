import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMinimalSiteFixture, runPagegenCLI } from './fixtures/minimal-site.mjs'

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then(JSON.parse)
}

test('pagegen fails when tag aggregate is removed from nav config', async t => {
  const { root, cleanup } = await createMinimalSiteFixture()
  t.after(cleanup)

  const navPath = path.join(root, 'schema', 'nav.json')
  const navConfig = await readJson(navPath)
  delete navConfig.aggregates.tags
  await fs.writeFile(navPath, JSON.stringify(navConfig, null, 2))

  const result = await runPagegenCLI(root)
  assert.notEqual(result.code, 0, 'pagegen should exit with failure')
  assert.match(result.stderr, /nav config 缺少 "tag" 类型/, 'stderr should mention missing tag aggregate')
})

test('pagegen fails when collection slug collapses to empty string', async t => {
  const { root, cleanup } = await createMinimalSiteFixture()
  t.after(cleanup)

  const zhPostPath = path.join(root, 'docs/zh/content/post-a/index.md')
  const raw = await fs.readFile(zhPostPath, 'utf8')
  const mutated = raw.replace('category_zh: 工程', 'category_zh: "---"')
  await fs.writeFile(zhPostPath, mutated)

  const result = await runPagegenCLI(root)
  assert.notEqual(result.code, 0, 'pagegen should fail for empty slug')
  assert.match(result.stderr, /空白 slug/, 'stderr should surface empty slug error')
})
