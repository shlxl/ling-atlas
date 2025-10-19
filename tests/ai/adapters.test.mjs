import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  loadEmbeddingAdapter,
  loadSummaryAdapter,
  loadQAAdapter,
  placeholder
} from '../../scripts/ai/adapters/index.mjs'

const silentLogger = {
  warn: () => {},
  info: () => {},
  error: () => {}
}

test('loadEmbeddingAdapter returns placeholder when spec missing', async () => {
  const info = await loadEmbeddingAdapter(undefined, silentLogger)
  assert.equal(info.adapterName, 'placeholder')
  assert.equal(info.isFallback, false)
  const result = await info.adapter.generateEmbeddings({
    items: [{ url: '/demo/', title: 'Demo', text: 'hello world', lang: 'zh' }]
  })
  assert.deepEqual(result.items[0], {
    url: '/demo/',
    title: 'Demo',
    text: 'hello world',
    lang: 'zh'
  })
})

test('unknown adapter falls back to placeholder with warning metadata', async () => {
  const info = await loadSummaryAdapter('unknown:model', silentLogger)
  assert.equal(info.adapterName, 'placeholder')
  assert.equal(info.requested, 'unknown')
  assert.equal(info.isFallback, true)
})

test('transformers adapter falls back when dependency missing', async () => {
  const info = await loadEmbeddingAdapter('transformers-node:foo', silentLogger)
  assert.equal(info.adapterName, 'placeholder')
  assert.equal(info.requested, 'transformers-node')
  assert.equal(info.isFallback, true)
})

test('placeholder summarize and QA mirror legacy behaviour', async () => {
  const documents = [
    {
      url: '/demo/',
      title: 'Demo',
      content: '第一段。\n\n第二段',
      frontmatter: {
        title: 'Demo',
        tags_zh: ['AI', '测试'],
        date: '2024-01-01'
      }
    }
  ]

  const { items: summaries } = await placeholder.summarize({ documents })
  assert.equal(summaries.length, 1)
  assert.ok(summaries[0].summary.includes('第一段'))

  const { items: qaItems } = await placeholder.buildQA({ documents })
  assert.equal(qaItems.length, 1)
  assert.equal(qaItems[0].qa[0].q, 'Demo 主要讲述了什么内容？')
  assert.ok(qaItems[0].qa.find(entry => entry.q.includes('发布日期')))
})

test('QA adapter falls back to summary spec when missing explicit value', async () => {
  const info = await loadQAAdapter(undefined, silentLogger)
  assert.equal(info.adapterName, 'placeholder')
})
