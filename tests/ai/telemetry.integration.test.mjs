import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { flushAIEvents } from '../../scripts/ai/utils.mjs'
import { mergeTelemetry } from '../../scripts/telemetry-merge.mjs'

const silentLogger = { log() {}, warn() {}, error() {} }

function buildTimestampSequence(count) {
  const base = Date.now()
  return Array.from({ length: count }, (_, index) => new Date(base + index).toISOString())
}

test('ai events flushed and merged into telemetry snapshot', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ling-atlas-ai-'))
  const aiEventsDir = path.join(tmpRoot, 'data', 'ai-events')
  const previousEnv = process.env.AI_TELEMETRY_PATH
  process.env.AI_TELEMETRY_PATH = aiEventsDir

  t.after(async () => {
    if (previousEnv === undefined) {
      delete process.env.AI_TELEMETRY_PATH
    } else {
      process.env.AI_TELEMETRY_PATH = previousEnv
    }
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const [embedStartTs, embedBatchTs, embedWriteTs, embedCompleteTs] = buildTimestampSequence(4)
  await flushAIEvents(
    'embed',
    [
      { event: 'ai.embed.start', timestamp: embedStartTs, inputCount: 2, requestedAdapter: 'placeholder' },
      {
        event: 'ai.embed.batch',
        timestamp: embedBatchTs,
        index: 0,
        durationMs: 42,
        inputCount: 2,
        outputCount: 2,
        successRate: 1,
        adapter: 'placeholder',
        model: null,
        fallback: true,
        retries: 0
      },
      {
        event: 'ai.embed.write',
        timestamp: embedWriteTs,
        target: 'docs/public/data/embeddings.json',
        bytes: 128,
        durationMs: 6,
        items: 2,
        cacheReuse: false
      },
      {
        event: 'ai.embed.complete',
        timestamp: embedCompleteTs,
        adapter: 'placeholder',
        model: null,
        fallback: true,
        cacheReuse: false,
        count: 2,
        inputCount: 2,
        outputCount: 2,
        successRate: 1,
        totalMs: 60,
        inferenceMs: 42,
        writeMs: 6,
        target: 'docs/public/data/embeddings.json',
        batchCount: 1,
        retries: 0
      }
    ],
    silentLogger
  )

  const [summaryStartTs, summaryBatchTs, summaryWriteTs, summaryCompleteTs] = buildTimestampSequence(4)
  await flushAIEvents(
    'summary',
    [
      { event: 'ai.summary.start', timestamp: summaryStartTs, inputCount: 1, locale: 'zh' },
      {
        event: 'ai.summary.batch',
        timestamp: summaryBatchTs,
        index: 0,
        durationMs: 24,
        inputCount: 1,
        outputCount: 1,
        successRate: 1,
        adapter: 'placeholder',
        model: null,
        fallback: true,
        retries: 0
      },
      {
        event: 'ai.summary.write',
        timestamp: summaryWriteTs,
        target: 'docs/public/data/summaries.json',
        bytes: 98,
        durationMs: 4,
        items: 1,
        cacheReuse: false
      },
      {
        event: 'ai.summary.complete',
        timestamp: summaryCompleteTs,
        adapter: 'placeholder',
        model: null,
        fallback: true,
        cacheReuse: false,
        count: 1,
        inputCount: 1,
        outputCount: 1,
        successRate: 1,
        totalMs: 40,
        inferenceMs: 24,
        writeMs: 4,
        target: 'docs/public/data/summaries.json',
        batchCount: 1,
        retries: 0
      }
    ],
    silentLogger
  )

  await mergeTelemetry({ root: tmpRoot, logger: silentLogger })

  const telemetryPath = path.join(tmpRoot, 'data', 'telemetry.json')
  const raw = await fs.readFile(telemetryPath, 'utf8')
  const telemetry = JSON.parse(raw)

  assert.ok(telemetry.build?.ai?.embed, 'embed summary should exist')
  assert.equal(telemetry.build.ai.embed.inference.outputCount, 2)
  assert.equal(telemetry.build.ai.embed.inference.successRate, 1)
  assert.equal(telemetry.build.ai.embed.inference.batches, 1)
  assert.equal(telemetry.build.ai.embed.inference.totalMs, 42)
  assert.equal(telemetry.build.ai.embed.write.target, 'docs/public/data/embeddings.json')
  assert.equal(telemetry.build.ai.embed.write.durationMs, 6)
  assert.equal(telemetry.build.ai.embed.adapter.name, 'placeholder')
  assert.equal(telemetry.build.ai.embed.cache.reused, false)

  assert.ok(telemetry.build.ai.summary, 'summary summary should exist')
  assert.equal(telemetry.build.ai.summary.inference.outputCount, 1)
  assert.equal(telemetry.build.ai.summary.inference.totalMs, 24)
  assert.equal(telemetry.build.ai.summary.write.items, 1)

  assert.strictEqual(telemetry.build.ai.qa, null, 'qa summary should remain null when no events provided')

  const publicTelemetryPath = path.join(tmpRoot, 'docs/public/telemetry.json')
  const publicRaw = await fs.readFile(publicTelemetryPath, 'utf8')
  const publicTelemetry = JSON.parse(publicRaw)
  assert.deepEqual(publicTelemetry.build.ai.embed.adapter, telemetry.build.ai.embed.adapter)

  let remaining
  try {
    remaining = await fs.readdir(aiEventsDir)
  } catch (error) {
    remaining = []
  }
  assert.equal(remaining.length, 0, 'ai event files should be cleaned up after merge')
})
