import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  loadEmbeddingAdapter,
  loadSummaryAdapter,
  loadQAAdapter,
  placeholder,
  registerAdapter,
  resetAdapterRegistry
} from '../../scripts/ai/adapters/index.mjs'
import { resolveAdapterSpec } from '../../scripts/ai/utils.mjs'

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

test('registerAdapter injects custom implementation for tests', async t => {
  t.after(() => {
    resetAdapterRegistry()
  })

  const mockAdapter = {
    async generateEmbeddings({ items }) {
      return {
        items: items.map(item => ({ ...item, embedding: [1, 2, 3] }))
      }
    },
    async summarize({ documents }) {
      return {
        items: documents.map(doc => ({ url: doc.url, title: doc.title, summary: 'ok' }))
      }
    },
    async buildQA({ documents }) {
      return {
        items: documents.map(doc => ({ url: doc.url, title: doc.title, qa: [] }))
      }
    }
  }

  registerAdapter('mock-adapter', mockAdapter)

  const embeddingInfo = await loadEmbeddingAdapter('mock-adapter:model', silentLogger)
  assert.equal(embeddingInfo.adapterName, 'mock-adapter')
  assert.equal(embeddingInfo.isFallback, false)
  const embedResult = await embeddingInfo.adapter.generateEmbeddings({ items: [{ text: 'hi' }] })
  assert.deepEqual(embedResult.items[0].embedding, [1, 2, 3])

  const summaryInfo = await loadSummaryAdapter('mock-adapter', silentLogger)
  assert.equal(summaryInfo.adapterName, 'mock-adapter')
  const summaryResult = await summaryInfo.adapter.summarize({ documents: [{ url: '/a', title: 'A' }] })
  assert.equal(summaryResult.items[0].summary, 'ok')
})

test('resolveAdapterSpec prefers CLI flag over environment variables', () => {
  process.env.AI_EMBED_MODEL = 'env-adapter:model'
  const argv = ['node', 'script', '--adapter', 'cli-adapter:demo']
  const resolved = resolveAdapterSpec({ envKey: 'AI_EMBED_MODEL', cliFlag: 'adapter', argv })
  assert.equal(resolved, 'cli-adapter:demo')
  delete process.env.AI_EMBED_MODEL
})
