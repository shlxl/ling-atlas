import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { appendGraphragMetric, readGraphragMetrics, getGraphragMetricsPath } from '../../scripts/graphrag/telemetry.mjs'

test('appendGraphragMetric maintains limit and prepends latest entry', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'graphrag-metrics-'))
  const metricsFile = path.join(tmpRoot, 'metrics.json')
  const previousEnv = process.env.GRAPHRAG_TELEMETRY_PATH
  process.env.GRAPHRAG_TELEMETRY_PATH = metricsFile

  t.after(async () => {
    if (previousEnv === undefined) {
      delete process.env.GRAPHRAG_TELEMETRY_PATH
    } else {
      process.env.GRAPHRAG_TELEMETRY_PATH = previousEnv
    }
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  await appendGraphragMetric({ type: 'ingest', timestamp: '2025-01-01T00:00:00Z', write: { written: 1 } }, { limit: 2 })
  await appendGraphragMetric({ type: 'ingest', timestamp: '2025-01-02T00:00:00Z', write: { written: 2 } }, { limit: 2 })
  await appendGraphragMetric({ type: 'ingest', timestamp: '2025-01-03T00:00:00Z', write: { written: 3 } }, { limit: 2 })

  const metricsPath = getGraphragMetricsPath()
  const raw = await fs.readFile(metricsPath, 'utf8')
  const metrics = JSON.parse(raw)

  assert.equal(metrics.length, 2)
  assert.equal(metrics[0].write.written, 3)
  assert.equal(metrics[0].timestamp, '2025-01-03T00:00:00Z')
  assert.equal(metrics[1].write.written, 2)

  const readBack = await readGraphragMetrics()
  assert.deepEqual(readBack, metrics)
})
