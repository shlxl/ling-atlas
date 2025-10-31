import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { mergeTelemetry } from '../../scripts/telemetry-merge.mjs'

const noopLogger = { log() {}, warn() {}, error() {} }

test('graphrag metrics are merged into telemetry snapshot', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ling-atlas-telemetry-'))
  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const dataDir = path.join(tmpRoot, 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const metrics = [
    {
      type: 'ingest',
      timestamp: '2025-01-01T00:00:00Z',
      locale: 'zh',
      durationMs: 1200,
      totals: { collected: 10, normalized: 8, readyForWrite: 8, processed: 6 },
      write: { attempted: 8, written: 5, cacheUpdated: true },
      skipped: { total: 2, reasons: [{ reason: '质量守门失败', count: 2 }] }
    },
    {
      type: 'ingest',
      timestamp: '2025-01-05T12:00:00Z',
      locale: 'en',
      durationMs: 900,
      adapter: 'placeholder',
      totals: { collected: 4, normalized: 4, readyForWrite: 4, processed: 4 },
      write: { attempted: 4, written: 4, cacheUpdated: true },
      skipped: { total: 0, reasons: [] }
    },
    {
      type: 'export',
      timestamp: '2025-01-06T08:00:00Z',
      docId: 'zh/guide/start-here',
      topic: 'zh-guide-start-here',
      durationMs: 640,
      dryRun: false,
      totals: { nodes: 32, edges: 48, entities: 12, recommendations: 5 },
      files: { subgraph: true, context: true, metadata: true, page: true }
    },
    {
      type: 'retrieve',
      timestamp: '2025-01-06T09:30:00Z',
      mode: 'topn',
      durationMs: 120,
      query: { entityNames: 2, category: 'guide', limit: 5 },
      totals: { items: 4 }
    }
  ]

  await fs.writeFile(path.join(dataDir, 'graphrag-metrics.json'), JSON.stringify(metrics, null, 2), 'utf8')

  await mergeTelemetry({ root: tmpRoot, logger: noopLogger })

  const telemetryPath = path.join(dataDir, 'telemetry.json')
  const raw = await fs.readFile(telemetryPath, 'utf8')
  const telemetry = JSON.parse(raw)

  assert.ok(telemetry.build?.graphrag, 'graphrag summary should exist')
  assert.equal(telemetry.build.graphrag.ingest.locale, 'en')
  assert.equal(telemetry.build.graphrag.ingest.write.written, 4)
  assert.equal(telemetry.build.graphrag.ingest.skipped.total, 0)
  assert.equal(telemetry.build.graphrag.export.docId, 'zh/guide/start-here')
  assert.equal(telemetry.build.graphrag.export.totals.nodes, 32)
  assert.equal(telemetry.build.graphrag.retrieve.mode, 'topn')
  assert.equal(telemetry.build.graphrag.retrieve.totals.items, 4)
  assert.ok(Array.isArray(telemetry.build.graphrag.warnings))
  assert.equal(telemetry.build.graphrag.warnings.length, 0)
  assert.ok(Array.isArray(telemetry.build.graphragHistory))
  assert.ok(telemetry.build.graphragHistory.length >= 1)
  assert.ok(Array.isArray(telemetry.build.graphragHistory[0].warnings))
})

test('graphrag warnings capture severity and history', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ling-atlas-telemetry-warn-'))
  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const dataDir = path.join(tmpRoot, 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const metrics = [
    {
      type: 'ingest',
      timestamp: '2025-02-01T10:00:00Z',
      durationMs: 600,
      locale: 'zh',
      write: { attempted: 5, written: 0 },
      totals: { readyForWrite: 5 }
    },
    {
      type: 'retrieve',
      timestamp: '2025-02-01T10:05:00Z',
      mode: 'hybrid',
      totals: { items: 3, sources: ['vector'] }
    },
    {
      type: 'export',
      timestamp: '2025-02-01T10:06:00Z',
      docId: 'zh/demo/index',
      topic: 'zh-demo',
      files: { page: false }
    },
    {
      type: 'explore',
      timestamp: '2025-02-01T10:07:00Z',
      mode: 'question',
      nodes: 10,
      edges: 12,
      truncatedNodes: true,
      truncatedEdges: false
    }
  ]

  await fs.writeFile(path.join(dataDir, 'graphrag-metrics.json'), JSON.stringify(metrics, null, 2), 'utf8')

  await mergeTelemetry({ root: tmpRoot, logger: noopLogger })

  const telemetryPath = path.join(dataDir, 'telemetry.json')
  const raw = await fs.readFile(telemetryPath, 'utf8')
  const telemetry = JSON.parse(raw)

  const warnings = telemetry.build?.graphrag?.warnings
  assert.ok(Array.isArray(warnings))
  assert.equal(warnings.length, 4)
  const scopes = warnings.map((item) => item.scope).sort()
  assert.deepEqual(scopes, ['explore', 'export', 'ingest', 'retrieve'])
  assert.equal(warnings.find((item) => item.scope === 'ingest')?.severity, 'error')

  const history = telemetry.build?.graphragHistory
  assert.ok(Array.isArray(history))
  assert.ok(history[0].warnings.length >= 4)
})
