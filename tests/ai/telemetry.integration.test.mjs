import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { mergeTelemetry, createTelemetryContext } from '../../scripts/telemetry-merge.mjs'

function createEventPayload({ namespace, script, runId, startedAt, events }) {
  return {
    namespace,
    script,
    runId,
    startedAt,
    events
  }
}

test('mergeTelemetry aggregates AI events and cleans processed files', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'ling-telemetry-'))
  const ctx = createTelemetryContext(root)

  await fs.mkdir(path.join(root, 'docs/.vitepress/dist'), { recursive: true })
  await fs.mkdir(path.join(root, 'docs/public'), { recursive: true })
  await fs.mkdir(ctx.aiEventsDir, { recursive: true })

  const startedAt = '2024-05-01T00:00:00.000Z'

  const embedEvents = createEventPayload({
    namespace: 'ai.embed',
    script: 'embed-build',
    runId: 'run-embed',
    startedAt,
    events: [
      {
        event: 'ai.embed.started',
        timestamp: startedAt,
        script: 'embed-build',
        runId: 'run-embed',
        status: 'running',
        adapter: 'placeholder'
      },
      {
        event: 'ai.embed.completed',
        timestamp: '2024-05-01T00:00:01.000Z',
        script: 'embed-build',
        runId: 'run-embed',
        status: 'success',
        adapter: 'placeholder',
        durationMs: 1200,
        itemsProcessed: 3,
        outputPath: 'docs/public/data/embeddings.json',
        locales: [
          { locale: 'zh', status: 'ok', totalFiles: 2, included: 2 },
          { locale: 'en', status: 'empty', totalFiles: 1, included: 0 }
        ]
      }
    ]
  })

  const summaryEvents = createEventPayload({
    namespace: 'ai.summary',
    script: 'summary',
    runId: 'run-summary',
    startedAt,
    events: [
      {
        event: 'ai.summary.started',
        timestamp: startedAt,
        script: 'summary',
        runId: 'run-summary',
        status: 'running',
        adapter: 'placeholder',
        preferredLocale: 'zh'
      },
      {
        event: 'ai.summary.completed',
        timestamp: '2024-05-01T00:00:01.500Z',
        script: 'summary',
        runId: 'run-summary',
        status: 'success',
        adapter: 'placeholder',
        durationMs: 1500,
        itemsProcessed: 2,
        filesScanned: 2,
        draftsSkipped: 0,
        outputPath: 'docs/public/data/summaries.json',
        locale: 'zh'
      }
    ]
  })

  const qaEvents = createEventPayload({
    namespace: 'ai.qa',
    script: 'qa-build',
    runId: 'run-qa',
    startedAt,
    events: [
      {
        event: 'ai.qa.started',
        timestamp: startedAt,
        script: 'qa-build',
        runId: 'run-qa',
        status: 'running',
        adapter: 'placeholder'
      },
      {
        event: 'ai.qa.completed',
        timestamp: '2024-05-01T00:00:02.000Z',
        script: 'qa-build',
        runId: 'run-qa',
        status: 'success',
        adapter: 'placeholder',
        durationMs: 2000,
        itemsProcessed: 1,
        filesScanned: 2,
        draftsSkipped: 1,
        outputPath: 'docs/public/data/qa.json',
        locale: 'zh'
      }
    ]
  })

  await fs.writeFile(path.join(ctx.aiEventsDir, 'embed.json'), JSON.stringify(embedEvents, null, 2), 'utf8')
  await fs.writeFile(path.join(ctx.aiEventsDir, 'summary.json'), JSON.stringify(summaryEvents, null, 2), 'utf8')
  await fs.writeFile(path.join(ctx.aiEventsDir, 'qa.json'), JSON.stringify(qaEvents, null, 2), 'utf8')

  await mergeTelemetry({ root })

  const stateRaw = await fs.readFile(ctx.dataPath, 'utf8')
  const state = JSON.parse(stateRaw)

  assert.ok(state.build?.ai, 'AI build summary should exist')
  assert.equal(state.build.ai.embed.status, 'success')
  assert.equal(state.build.ai.embed.itemsProcessed, 3)
  assert.equal(state.build.ai.summary.filesScanned, 2)
  assert.equal(state.build.ai.qa.draftsSkipped, 1)

  const publicPayload = JSON.parse(await fs.readFile(ctx.publicPath, 'utf8'))
  assert.equal(publicPayload.build.ai.summary.status, 'success')
  assert.equal(publicPayload.build.ai.qa.adapter, 'placeholder')

  const remainingEvents = await fs.readdir(ctx.aiEventsDir)
  assert.deepEqual(remainingEvents, [])
})
