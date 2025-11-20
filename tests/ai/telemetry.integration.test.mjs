import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { flushAIEvents } from '../../scripts/ai/utils.mjs'
import { AI_TELEMETRY_SCHEMA_VERSION } from '../../packages/shared/src/telemetry/constants.mjs'
import { mergeTelemetry } from '../../scripts/telemetry-merge.mjs'

const noopLogger = { log() {}, warn() {}, error() {} }

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
    noopLogger
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
    noopLogger
  )

  const smokeTimestamp = new Date(Date.now() + 1000).toISOString()
  await flushAIEvents(
    'smoke',
    [
      {
        event: 'ai.smoke.summary',
        timestamp: smokeTimestamp,
        runtime: 'placeholder',
        status: 'passed',
        executed: 2,
        skipped: 0,
        failed: 0,
        failures: []
      }
    ],
    noopLogger
  )

  const modelsDir = path.join(tmpRoot, 'data')
  await fs.mkdir(modelsDir, { recursive: true })
  const smokeManifest = {
    version: 1,
    generatedAt: embedCompleteTs,
    runtime: 'placeholder',
    smoke: {
      status: 'passed',
      runtime: 'placeholder',
      executed: 2,
      skipped: 0,
      failed: 0,
      verifiedAt: embedCompleteTs,
      failures: []
    },
    models: [
      {
        id: 'placeholder-embed-linear',
        name: 'Placeholder Embedding Linear Model',
        tasks: ['embed'],
        smoke: {
          status: 'passed',
          verifiedAt: embedCompleteTs
        }
      }
    ]
  }
  await fs.writeFile(path.join(modelsDir, 'models.json'), JSON.stringify(smokeManifest, null, 2), 'utf8')

  const logs = []
  const warnings = []
  const testLogger = {
    log(message) {
      logs.push(message)
    },
    warn(message) {
      warnings.push(message)
    },
    error(message) {
      warnings.push(message)
    }
  }

  await mergeTelemetry({ root: tmpRoot, logger: testLogger })

  assert.equal(warnings.length, 0, 'no warnings expected for valid events')
  assert.ok(logs.some(message => message.includes('ai overview status=degraded')), 'overview log not emitted')
  assert.ok(logs.some(message => message.includes('ai smoke status=passed')), 'smoke log not emitted')

  const telemetryPath = path.join(tmpRoot, 'data', 'telemetry.json')
  const raw = await fs.readFile(telemetryPath, 'utf8')
  const telemetry = JSON.parse(raw)

  assert.equal(telemetry.build?.ai?.schemaVersion, AI_TELEMETRY_SCHEMA_VERSION)
  assert.equal(telemetry.build.ai.embed?.schemaVersion, AI_TELEMETRY_SCHEMA_VERSION)
  assert.equal(telemetry.build.ai.overview?.status, 'degraded')
  assert.equal(telemetry.build.ai.overview?.summary?.fallback, 2)
  assert.equal(telemetry.build.ai.overview?.summary?.missing, 1)
  assert.equal(telemetry.build.ai.overview?.smoke?.status, 'passed')
  assert.equal(telemetry.build.ai.smoke?.summary?.status, 'passed')
  assert.equal(telemetry.build.ai.smoke?.summary?.executed, 2)
  assert.equal(telemetry.build.ai.smoke?.summary?.runtime, 'placeholder')
  assert.equal(telemetry.build.ai.smoke?.summary?.verifiedAt, smokeTimestamp)
  assert.ok(Array.isArray(telemetry.build.ai.smoke?.history))
  assert.ok((telemetry.build.ai.smoke?.history?.length ?? 0) >= 1)
  assert.equal(telemetry.build.ai.smoke?.history?.[0]?.status, 'passed')
  assert.equal(telemetry.build.ai.smoke?.models?.length, 1)
  const embedOverview = telemetry.build.ai.overview?.domains?.embed
  assert.ok(embedOverview, 'embed overview should exist')
  assert.equal(embedOverview.status, 'fallback')
  assert.equal(embedOverview.outputCount, 2)
  assert.equal(telemetry.build.ai.overview?.domains?.qa?.status, 'missing')

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
  assert.equal(publicTelemetry.build.ai.schemaVersion, AI_TELEMETRY_SCHEMA_VERSION)
  assert.equal(publicTelemetry.build.ai.overview.status, 'degraded')
  assert.equal(publicTelemetry.build.ai.overview.domains.qa.status, 'missing')

  let remaining
  try {
    remaining = await fs.readdir(aiEventsDir)
  } catch (error) {
    remaining = []
  }
  assert.equal(remaining.length, 0, 'ai event files should be cleaned up after merge')
})

test('invalid ai events are skipped by schema validation', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ling-atlas-ai-invalid-'))
  const aiEventsDir = path.join(tmpRoot, 'data', 'ai-events')
  await fs.mkdir(aiEventsDir, { recursive: true })

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

  const invalidPayload = {
    domain: 'embed',
    events: [
      { event: 'ai.embed.start', timestamp: new Date().toISOString() }
    ]
  }

  await fs.writeFile(
    path.join(aiEventsDir, 'invalid.json'),
    JSON.stringify(invalidPayload, null, 2),
    'utf8'
  )

  const modelsDir = path.join(tmpRoot, 'data')
  await fs.mkdir(modelsDir, { recursive: true })
  const failingManifest = {
    version: 1,
    runtime: 'placeholder',
    generatedAt: new Date().toISOString(),
    smoke: {
      status: 'failed',
      runtime: 'placeholder',
      executed: 1,
      skipped: 0,
      failed: 1,
      verifiedAt: new Date().toISOString(),
      failures: [{ id: 'placeholder-embed-linear', reason: 'missing events' }]
    },
    models: [
      {
        id: 'placeholder-embed-linear',
        tasks: ['embed'],
        smoke: {
          status: 'failed',
          reason: 'missing events',
          verifiedAt: new Date().toISOString()
        }
      }
    ]
  }
  await fs.writeFile(path.join(modelsDir, 'models.json'), JSON.stringify(failingManifest, null, 2), 'utf8')

  const logs = []
  const warnings = []
  const logger = {
    log(message) {
      logs.push(message)
    },
    warn(message) {
      warnings.push(message)
    },
    error(message) {
      warnings.push(message)
    }
  }

  await mergeTelemetry({ root: tmpRoot, logger })

  const telemetryPath = path.join(tmpRoot, 'data', 'telemetry.json')
  const telemetry = JSON.parse(await fs.readFile(telemetryPath, 'utf8'))

  assert.equal(telemetry.build.ai.embed, null, 'invalid events should not populate embed summary')
  assert.equal(telemetry.build.ai.overview.status, 'degraded')
  assert.equal(telemetry.build.ai.overview.domains.embed.status, 'missing')
  assert.equal(telemetry.build.ai.overview.smoke.status, 'failed')
  assert.equal(telemetry.build.ai.smoke.summary.status, 'failed')
  assert.equal(telemetry.build.ai.smoke.summary.failures.length, 1)
  assert.ok(
    warnings.some(message => message.includes('missing required field(s) inputCount')),
    'expected missing field warning'
  )
  assert.ok(
    warnings.some(message => message.includes('no events passed schema validation')),
    'expected file skipped warning'
  )
  assert.ok(
    logs.some(message => message.includes('ai overview status=degraded')),
    'overview log should reflect degraded status'
  )
  assert.ok(
    logs.some(message => message.includes('ai smoke status=failed')),
    'smoke log should reflect failure status'
  )

  let remaining
  try {
    remaining = await fs.readdir(aiEventsDir)
  } catch {
    remaining = []
  }
  assert.equal(remaining.length, 0, 'invalid ai event file should be removed after processing')
})
