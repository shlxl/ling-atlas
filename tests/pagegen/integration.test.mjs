import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

function runPagegen(args = [], env = {}) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      ['scripts/pagegen.mjs', ...args],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr })
      }
    )
  })
}

test('pagegen dry run writes metrics file with summaries', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pagegen-integration-'))
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  const metricsFile = path.join(tempDir, 'metrics.json')
  const { code, stderr } = await runPagegen(['--dry-run', '--metrics-output', metricsFile])

  assert.equal(code, 0, `pagegen exited with non-zero code: ${stderr}`)

  const raw = await fs.readFile(metricsFile, 'utf8')
  const metrics = JSON.parse(raw)
  assert.ok(Array.isArray(metrics) && metrics.length > 0, 'metrics should be a non-empty array')

  const last = metrics.at(-1)
  assert.equal(typeof last.totalMs, 'number', 'totalMs should be numeric')
  assert.ok(last.stageSummary, 'stage summary should exist')
  assert.ok(last.collect?.summary, 'collect summary should exist')
  assert.ok(last.sync?.summary, 'sync summary should exist')
  assert.equal(last.write?.summary?.disabled, true, 'dry run should disable writer')
})
