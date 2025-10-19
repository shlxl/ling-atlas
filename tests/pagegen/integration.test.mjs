import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMinimalSiteFixture, runPagegenCLI, pathExists } from './fixtures/minimal-site.mjs'

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

test('pagegen metrics-only run emits structured stdout for fixture', async t => {
  const { root: fixture, cleanup } = await createMinimalSiteFixture()
  t.after(cleanup)

  const result = await runPagegenCLI(fixture, ['--metrics-only'])
  assert.equal(result.code, 0, `pagegen exited with ${result.code}: ${result.stderr}`)

  const stdout = result.stdout.trim()
  assert.ok(stdout.startsWith('{'), 'metrics-only stdout should be JSON object')
  const metrics = JSON.parse(stdout)
  assert.ok(Array.isArray(metrics.stages) && metrics.stages.length > 0, 'stages list should exist')
  assert.ok(metrics.collect?.summary?.locales >= 2, 'collect summary should count locales')
  assert.equal(metrics.write?.summary?.disabled, true, 'metrics-only run should disable writer')
})

test('pagegen aborts and logs stage context when write fails', async t => {
  const { root: fixture, cleanup, paths } = await createMinimalSiteFixture({ readOnlyMeta: true })
  t.after(cleanup)

  const result = await runPagegenCLI(fixture)
  assert.notEqual(result.code, 0, 'pagegen should exit with failure code')
  assert.match(
    result.stderr,
    /stage=meta\s+locale=zh\s+target=.*meta\.zh\.json/i,
    'stderr should include stage, locale, and target context'
  )

  const metricsExists = await pathExists(paths.metricsLog)
  assert.equal(metricsExists, false, 'metrics log should not be created when write fails')

  const metaStat = await fs.stat(paths.meta.zh)
  assert.ok(metaStat.isDirectory(), 'failing write should leave meta path as guard directory')
})
