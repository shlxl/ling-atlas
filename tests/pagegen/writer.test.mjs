import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWriter } from '../../scripts/pagegen/writer.mjs'

const TMP_PREFIX = 'pagegen-writer-test-'

test('writer writes new content and skips identical content', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const target = path.join(root, 'file.txt')
  const writer = createWriter()

  writer.addFileTask({
    stage: 'test',
    locale: 'zh',
    target,
    content: 'first'
  })

  let result = await writer.flush()
  assert.equal(result.written, 1)
  assert.equal(result.skipped, 0)
  assert.equal(result.failed, 0)

  const writer2 = createWriter()
  writer2.addFileTask({
    stage: 'test',
    locale: 'zh',
    target,
    content: 'first'
  })

  result = await writer2.flush()
  assert.equal(result.written, 0)
  assert.equal(result.skipped, 1)
  assert.equal(result.failed, 0)
})

test('writer reports failures from task generators', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const target = path.join(root, 'error.txt')
  const writer = createWriter()

  writer.addFileTask({
    stage: 'test',
    locale: 'zh',
    target,
    content: () => {
      throw new Error('boom')
    }
  })

  const result = await writer.flush()
  assert.equal(result.failed, 1)
  assert.equal(result.written, 0)
  assert.equal(result.skipped, 0)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0].message, /boom/)
})
