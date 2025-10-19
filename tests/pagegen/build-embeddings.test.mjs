import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __test__ } from '../../scripts/build-embeddings.mjs'

const { toUrl } = __test__

const mockSource = {
  basePath: '/zh/content/'
}

test('toUrl handles root-level index correctly', () => {
  const url = toUrl('index.md', mockSource)
  assert.equal(url, '/zh/content/')
})

test('toUrl handles nested index correctly', () => {
  const url = toUrl('guides/index.md', mockSource)
  assert.equal(url, '/zh/content/guides/')
})
