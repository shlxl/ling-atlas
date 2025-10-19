import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createPluginRegistry, lifecycleEvents } from '../../scripts/pagegen/plugin-registry.mjs'
import { createScheduler } from '../../scripts/pagegen/scheduler.mjs'

describe('pagegen plugin scheduler', () => {
  it('executes stages in registration order with lifecycle hooks', async () => {
    const registry = createPluginRegistry()
    const scheduler = createScheduler(registry)
    const events = []

    registry.on(lifecycleEvents.BEFORE_STAGE, ({ stage }) => {
      events.push(`before:${stage}`)
    })
    registry.on(lifecycleEvents.AFTER_STAGE, ({ stage }) => {
      events.push(`after:${stage}`)
    })

    registry.registerStage({
      name: 'alpha',
      run: async () => {
        events.push('run:alpha')
      }
    })

    registry.registerStage({
      name: 'beta',
      run: async () => {
        events.push('run:beta')
      }
    })

    await scheduler.run({})

    assert.deepStrictEqual(events, [
      'before:alpha',
      'run:alpha',
      'after:alpha',
      'before:beta',
      'run:beta',
      'after:beta'
    ])
  })

  it('runs parallel stage tasks without duplicates when enabled', async () => {
    const registry = createPluginRegistry()
    const scheduler = createScheduler(registry, { parallel: true, parallelLimit: 3 })
    const seen = new Set()

    registry.registerStage({
      name: 'parallel-stage',
      iterator: () => [1, 2, 3, 4, 5],
      parallel: true,
      task: async value => {
        await new Promise(resolve => setTimeout(resolve, 5))
        if (seen.has(value)) {
          throw new Error(`duplicate execution for ${value}`)
        }
        seen.add(value)
      }
    })

    await scheduler.run({})

    assert.equal(seen.size, 5)
    assert.deepStrictEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5])
  })

  it('propagates stage errors via lifecycle events', async () => {
    const registry = createPluginRegistry()
    const scheduler = createScheduler(registry)
    const errors = []

    registry.on(lifecycleEvents.ERROR, payload => {
      errors.push({ stage: payload?.stage, message: payload?.error?.message })
    })

    registry.registerStage({
      name: 'boom',
      run: async () => {
        throw new Error('expected failure')
      }
    })

    await assert.rejects(async () => scheduler.run({}), /expected failure/)
    assert.deepStrictEqual(errors, [{ stage: 'boom', message: 'expected failure' }])
  })
})
