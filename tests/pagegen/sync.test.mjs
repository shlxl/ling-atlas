import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncLocaleContent } from '../../scripts/pagegen/sync.mjs'

const TMP_PREFIX = 'pagegen-sync-test-'

test('syncLocaleContent supports full and incremental modes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  const source = path.join(root, 'src')
  const target = path.join(root, 'dst')
  const cacheDir = path.join(root, 'cache')

  await fs.mkdir(path.join(source, 'post'), { recursive: true })
  await fs.writeFile(path.join(source, 'post', 'index.md'), '# Hello\n')
  await fs.writeFile(path.join(source, 'post', 'old.md'), '# Legacy\n')

  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const locale = {
    code: 'zh',
    manifestLocale: 'zh',
    contentDir: source,
    localizedContentDir: target
  }

  const [first] = await syncLocaleContent([locale], { fullSync: true, cacheDir })
  assert.equal(first.mode, 'full')
  assert.equal(first.copiedFiles, 2)
  assert.equal(first.removedFiles, 0)
  assert.equal(first.copied, true)

  // 准备增量场景：修改 index，新增 extra，删除 old
  await fs.writeFile(path.join(source, 'post', 'index.md'), '# Hello v2\n')
  await fs.writeFile(path.join(source, 'post', 'extra.md'), '# Extra\n')
  await fs.rm(path.join(source, 'post', 'old.md'))

  const [second] = await syncLocaleContent([locale], { cacheDir })
  assert.equal(second.mode, 'incremental')
  assert.equal(second.copiedFiles, 2, 'should copy changed + new files')
  assert.equal(second.removedFiles, 1, 'should remove deleted files')
  assert.equal(second.unchangedFiles, 0)
  assert.equal(second.copied, true)

  const indexContent = await fs.readFile(path.join(target, 'post', 'index.md'), 'utf8')
  assert.equal(indexContent.trim(), '# Hello v2')
  const extraContent = await fs.readFile(path.join(target, 'post', 'extra.md'), 'utf8')
  assert.equal(extraContent.trim(), '# Extra')
  await assert.rejects(
    () => fs.readFile(path.join(target, 'post', 'old.md')),
    /ENOENT/,
    'old file should be removed from target'
  )
})
