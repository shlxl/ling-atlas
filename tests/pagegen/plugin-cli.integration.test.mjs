import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import {
  createMinimalSiteFixture,
  runPagegenCLI,
  pathExists,
  writePluginModule
} from './fixtures/minimal-site.mjs'

test(
  'pagegen loads example plugin via CLI and records metrics',
  { concurrency: false },
  async t => {
    const { root, cleanup } = await createMinimalSiteFixture()
    t.after(cleanup)

    const pluginPath = path.join(root, 'scripts', 'pagegen', 'plugins', 'example.mjs')
    const result = await runPagegenCLI(root, [
      '--plugin',
      pluginPath,
      '--max-parallel',
      '3',
      '--parallel-stage',
      'collect=2'
    ])

    if (result.code !== 0) {
      console.error('[plugin-cli.test] stdout:', result.stdout)
      console.error('[plugin-cli.test] stderr:', result.stderr)
    }
    assert.equal(result.code, 0, `pagegen exited with ${result.code}`)

    const reportPath = path.join(root, 'data', 'pagegen-plugin.example.json')
    assert.equal(await pathExists(reportPath), true, 'example plugin report missing')
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))

    assert.equal(report.scheduler.parallelEnabled, true)
    assert.equal(report.scheduler.parallelLimit, 3)
    assert.equal(report.scheduler.overrides.collect?.limit, 2)
    assert.ok((report.stages?.length || 0) > 0, 'expected plugin to observe scheduler stages')
    assert.ok(report.generatedAt, 'report missing generatedAt timestamp')

    const metricsLog = JSON.parse(await fs.readFile(path.join(root, 'data', 'pagegen-metrics.json'), 'utf8'))
    const latest = metricsLog.at(-1)
    assert.ok(latest.plugins, 'plugins metrics missing')
    assert.equal(latest.plugins.disabled, false)
    assert.equal(latest.plugins.ignoreErrors, false)
    assert.deepStrictEqual(latest.plugins.requested, [pluginPath])
    const pluginEntry = latest.plugins.results.find(item => item.specifier === pluginPath)
    assert.ok(pluginEntry, 'example plugin metrics entry missing')
    assert.equal(pluginEntry.status, 'loaded')
  }
)

test(
  'pagegen fails fast when plugin register throws without ignore flag',
  { concurrency: false },
  async t => {
    const { root, cleanup } = await createMinimalSiteFixture()
    t.after(cleanup)

    const failingPlugin = await writePluginModule(
      root,
      'failing-plugin.mjs',
      `export async function register() { throw new Error('expected plugin failure') }`
    )

    const result = await runPagegenCLI(root, ['--plugin', failingPlugin])
    assert.notEqual(result.code, 0, 'pagegen should exit non-zero on plugin failure')
    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`
    assert.match(combinedOutput, /pagegen plugin load failed/i)
    assert.match(combinedOutput, /expected plugin failure/i)
  }
)

test(
  'pagegen continues when ignore-plugin-errors is set and reports failed plugin',
  { concurrency: false },
  async t => {
    const { root, cleanup } = await createMinimalSiteFixture()
    t.after(cleanup)

    const failingPlugin = await writePluginModule(
      root,
      'failing-plugin.mjs',
      `export async function register() { throw new Error('expected plugin failure') }`
    )
    const examplePlugin = path.join(root, 'scripts', 'pagegen', 'plugins', 'example.mjs')

    const result = await runPagegenCLI(root, [
      '--plugin',
      failingPlugin,
      '--plugin',
      examplePlugin,
      '--ignore-plugin-errors',
      '--max-parallel',
      '2'
    ])

    if (result.code !== 0) {
      console.error('[plugin-cli.ignore.test] stdout:', result.stdout)
      console.error('[plugin-cli.ignore.test] stderr:', result.stderr)
    }
    assert.equal(result.code, 0, `pagegen should continue when ignoring plugin errors (got ${result.code})`)

    const metricsLog = JSON.parse(await fs.readFile(path.join(root, 'data', 'pagegen-metrics.json'), 'utf8'))
    const latest = metricsLog.at(-1)
    assert.ok(latest.plugins, 'plugins metrics not recorded')
    assert.equal(latest.plugins.ignoreErrors, true)

    const requested = [...latest.plugins.requested].sort()
    const expectedRequested = [examplePlugin, failingPlugin].sort()
    assert.deepStrictEqual(requested, expectedRequested)

    const failingEntry = latest.plugins.results.find(item => item.specifier === failingPlugin)
    assert.ok(failingEntry, 'failing plugin metrics missing')
    assert.equal(failingEntry.status, 'failed')
    assert.match(failingEntry.error || '', /expected plugin failure/)

    const exampleEntry = latest.plugins.results.find(item => item.specifier === examplePlugin)
    assert.ok(exampleEntry, 'example plugin metrics missing')
    assert.equal(exampleEntry.status, 'loaded')

    const reportPath = path.join(root, 'data', 'pagegen-plugin.example.json')
    assert.equal(await pathExists(reportPath), true, 'example plugin report should still be written')
  }
)
