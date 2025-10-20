import fs from 'node:fs/promises'
import path from 'node:path'

import { lifecycleEvents } from '../plugin-registry.mjs'

export async function register({ registry, scheduler, dryRun, metricsOnly, env }) {
  const summary = {
    generatedAt: null,
    scheduler: {
      parallelEnabled: Boolean(scheduler?.parallelEnabled),
      parallelLimit: scheduler?.parallelLimit ?? null,
      overrides: scheduler?.stageOverrides ?? {}
    },
    dryRun: Boolean(dryRun),
    metricsOnly: Boolean(metricsOnly),
    note: env?.PAGEGEN_PLUGIN_SAMPLE_NOTE ?? null,
    stages: [],
    errors: []
  }

  registry.on(lifecycleEvents.BEFORE_STAGE, payload => {
    summary.stages.push({
      name: payload?.stage ?? 'unknown',
      parallel: Boolean(payload?.options?.parallel),
      parallelLimit: payload?.options?.parallelLimit ?? null
    })
  })

  registry.on(lifecycleEvents.ERROR, payload => {
    summary.errors.push({
      stage: payload?.stage ?? 'unknown',
      message: payload?.error?.message ?? String(payload?.error || '')
    })
  })

  registry.registerStage({
    name: 'plugin-example:write-report',
    run: async () => {
      summary.generatedAt = new Date().toISOString()
      const outDir = path.join(process.cwd(), 'data')
      await fs.mkdir(outDir, { recursive: true })
      await fs.writeFile(
        path.join(outDir, 'pagegen-plugin.example.json'),
        JSON.stringify(summary, null, 2),
        'utf8'
      )
    }
  })
}
