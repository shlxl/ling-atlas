import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { lifecycleEvents } from '../../scripts/pagegen/plugin-registry.mjs'
import { register as registerExamplePlugin } from '../../scripts/pagegen/plugins/example.mjs'

test('pagegen example plugin writes summary report', async t => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pagegen-plugin-'))
  const originalCwd = process.cwd()
  process.chdir(tmpRoot)

  t.after(async () => {
    process.chdir(originalCwd)
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const listeners = {
    [lifecycleEvents.BEFORE_STAGE]: [],
    [lifecycleEvents.AFTER_STAGE]: [],
    [lifecycleEvents.ERROR]: []
  }
  const stages = []

  const registry = {
    registerStage(definition) {
      stages.push(definition)
    },
    on(event, handler) {
      if (listeners[event]) listeners[event].push(handler)
    }
  }

  await registerExamplePlugin({
    registry,
    scheduler: {
      parallelEnabled: true,
      parallelLimit: 4,
      stageOverrides: { collect: { enabled: true, limit: 2 } }
    },
    dryRun: false,
    metricsOnly: false,
    env: { PAGEGEN_PLUGIN_SAMPLE_NOTE: 'demo-note' }
  })

  assert.ok(stages.some(stage => stage.name === 'plugin-example:write-report'), 'example plugin did not register report stage')

  const emit = (event, payload) => {
    for (const handler of listeners[event] || []) {
      handler(payload)
    }
  }

  emit(lifecycleEvents.BEFORE_STAGE, { stage: 'collect', options: { parallel: true, parallelLimit: 2 } })
  emit(lifecycleEvents.BEFORE_STAGE, { stage: 'feeds', options: { parallel: false, parallelLimit: 1 } })
  emit(lifecycleEvents.ERROR, { stage: 'feeds', error: new Error('feed failure') })

  const reportStage = stages.find(stage => stage.name === 'plugin-example:write-report')
  await reportStage.run()

  const reportPath = path.join(tmpRoot, 'data', 'pagegen-plugin.example.json')
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))

  assert.equal(report.scheduler.parallelEnabled, true)
  assert.equal(report.scheduler.parallelLimit, 4)
  assert.equal(report.scheduler.overrides.collect.limit, 2)
  assert.equal(report.note, 'demo-note')
  assert.equal(report.stages[0].name, 'collect')
  assert.equal(report.errors[0].stage, 'feeds')
  assert.equal(report.errors[0].message, 'feed failure')
})
