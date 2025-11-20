import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { mergeTelemetry } from '../../scripts/telemetry-merge.mjs'

test('telemetry merge emits graphrag normalization warnings', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'graphrag-warn-'))
  const dataDir = path.join(tmpRoot, 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const prevLlmThreshold = process.env.GRAPHRAG_WARN_LLM_FAILURE_ERROR
  const prevFallbackThreshold = process.env.GRAPHRAG_WARN_FALLBACK_WARNING
  process.env.GRAPHRAG_WARN_LLM_FAILURE_ERROR = '1'
  process.env.GRAPHRAG_WARN_FALLBACK_WARNING = '5'

  t.after(async () => {
    if (prevLlmThreshold === undefined) {
      delete process.env.GRAPHRAG_WARN_LLM_FAILURE_ERROR
    } else {
      process.env.GRAPHRAG_WARN_LLM_FAILURE_ERROR = prevLlmThreshold
    }
    if (prevFallbackThreshold === undefined) {
      delete process.env.GRAPHRAG_WARN_FALLBACK_WARNING
    } else {
      process.env.GRAPHRAG_WARN_FALLBACK_WARNING = prevFallbackThreshold
    }
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const metrics = [
    {
      type: 'ingest',
      timestamp: '2025-01-03T00:00:00.000Z',
      write: { written: 0 },
      guardAlerts: [{ scope: 'guard.entities', message: 'LLM failures exceed threshold', severity: 'error' }]
    },
    {
      type: 'normalize',
      domain: 'entities',
      timestamp: '2025-01-01T00:00:00.000Z',
      enabled: true,
      totals: { total: 10, updated: 0, entities: 10 },
      sources: { alias: 0, cache: 0, llm: 2, fallback: 8, reuse: 0 },
      aliasEntries: 0,
      llm: { failures: 2, provider: 'gemini', model: 'gemini-1.5-flash' },
      samples: { failures: [{ name: 'foo', message: 'bar' }] }
    },
    {
      type: 'normalize_relationships',
      domain: 'relationships',
      timestamp: '2025-01-02T00:00:00.000Z',
      enabled: false,
      totals: { total: 5, updated: 0, relationships: 5 },
      sources: { alias: 0, cache: 0, llm: 0, fallback: 5, reuse: 0 },
      aliasEntries: 0,
      llm: { failures: 0 },
      samples: { failures: [] }
    }
  ]

  await fs.writeFile(path.join(dataDir, 'graphrag-metrics.json'), JSON.stringify(metrics, null, 2), 'utf8')

  await mergeTelemetry({ root: tmpRoot, logger: { log() {}, warn() {}, error() {} } })

  const telemetry = JSON.parse(await fs.readFile(path.join(dataDir, 'telemetry.json'), 'utf8'))
  const warnings = telemetry.build?.graphrag?.warnings || []

  assert.ok(warnings.length >= 4, 'expected multiple graphrag warnings')
  assert.ok(warnings.some(w => w.scope === 'ingest' && w.severity === 'error'))
  assert.ok(warnings.some(w => w.scope === 'normalize.entities' && w.message.includes('LLM 失败') && w.severity === 'error'))
  assert.ok(warnings.some(w => w.scope === 'normalize.entities' && w.message.includes('未成功更新')))
  assert.ok(warnings.some(w => w.scope === 'normalize.entities' && w.message.includes('回退到原始类型') && w.severity === 'warning'))
  assert.ok(warnings.some(w => w.scope === 'normalize.relationships' && w.message.includes('已禁用')))
})
