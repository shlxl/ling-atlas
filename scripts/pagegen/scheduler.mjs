import { lifecycleEvents } from './plugin-registry.mjs'

export function createScheduler(registry, options = {}) {
  if (!registry || typeof registry.getStages !== 'function') {
    throw new Error('[pagegen.scheduler] registry with getStages() is required')
  }

  const parallelLimit = normalizeLimit(options?.parallelLimit)
  const parallelEnabled = options?.parallel === true && parallelLimit > 1
  const stageOverrides = normalizeOverrides(options?.stageOverrides)

  async function run(sharedContext = {}) {
    const stages = registry.getStages()
    for (const stageDef of stages) {
      await executeStage(stageDef, sharedContext)
    }
  }

  async function executeStage(stageDef, sharedContext) {
    const nameKey = typeof stageDef.name === 'string' ? stageDef.name.toLowerCase() : ''
    const override = nameKey ? stageOverrides[nameKey] : undefined
    const baseParallel = Boolean(stageDef.parallel && parallelEnabled)
    let stageParallel = baseParallel
    if (override && Object.prototype.hasOwnProperty.call(override, 'enabled')) {
      stageParallel = override.enabled === true ? baseParallel : false
    }
    const stageParallelLimit = stageParallel
      ? normalizeLimit(override?.limit || parallelLimit)
      : 1

    const stageCtx = {
      stage: stageDef.name,
      definition: stageDef,
      shared: sharedContext,
      options: {
        parallel: stageParallel,
        parallelLimit: stageParallelLimit,
        override: override || null
      }
    }

    await callLifecycle(lifecycleEvents.BEFORE_STAGE, stageCtx)
    if (typeof stageDef.beforeStage === 'function') {
      await stageDef.beforeStage(sharedContext, stageCtx)
    }

    let stageError = null
    try {
      if (typeof stageDef.run === 'function') {
        await stageDef.run(sharedContext, stageCtx)
      } else {
        const items = await collectItems(stageDef.iterator, sharedContext, stageCtx)
        if (!items.length) {
          // no items
        } else if (stageCtx.options.parallel) {
          await runParallel(items, sharedContext, stageCtx, stageDef.task, stageCtx.options.parallelLimit)
        } else {
          await runSequential(items, sharedContext, stageCtx, stageDef.task)
        }
      }
    } catch (error) {
      stageError = error
      stageCtx.error = error
      if (typeof stageDef.onError === 'function') {
        await stageDef.onError(error, sharedContext, stageCtx)
      }
      await callLifecycle(lifecycleEvents.ERROR, stageCtx)
      throw error
    } finally {
      if (!stageError) {
        if (typeof stageDef.afterStage === 'function') {
          await stageDef.afterStage(sharedContext, stageCtx)
        }
        await callLifecycle(lifecycleEvents.AFTER_STAGE, stageCtx)
      }
    }
  }

  async function callLifecycle(event, payload) {
    const handlers = registry.getLifecycleHandlers(event)
    for (const handler of handlers) {
      await handler(payload)
    }
  }

  return { run }
}

async function collectItems(iteratorFn, sharedContext, stageCtx) {
  if (typeof iteratorFn !== 'function') return []
  const source = await iteratorFn(sharedContext, stageCtx)
  if (!source) return []
  if (Array.isArray(source)) return source
  if (typeof source.length === 'number') return Array.from(source)
  if (typeof source[Symbol.asyncIterator] === 'function') {
    const out = []
    for await (const item of source) {
      out.push(item)
    }
    return out
  }
  if (typeof source[Symbol.iterator] === 'function') {
    return Array.from(source)
  }
  throw new Error('[pagegen.scheduler] iterator() must return an iterable or array-like value')
}

async function runSequential(items, sharedContext, stageCtx, task) {
  for (let index = 0; index < items.length; index += 1) {
    await task(items[index], sharedContext, { ...stageCtx, index })
  }
}

async function runParallel(items, sharedContext, stageCtx, task, limit) {
  const effectiveLimit = normalizeLimit(limit)
  const executing = new Set()
  const tasks = []
  for (let index = 0; index < items.length; index += 1) {
    const runner = Promise.resolve().then(() => task(items[index], sharedContext, { ...stageCtx, index }))
    executing.add(runner)
    const cleanup = () => executing.delete(runner)
    runner.then(cleanup, cleanup)
    tasks.push(runner)
    if (executing.size >= effectiveLimit) {
      await Promise.race(executing)
    }
  }
  await Promise.all(tasks)
}

function normalizeLimit(value) {
  const num = Number(value)
  if (Number.isFinite(num) && num > 1) return Math.floor(num)
  return 1
}

function normalizeOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return {}
  const normalized = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (!key) continue
    const stage = key.toLowerCase()
    if (!stage) continue
    const config = {}
    if (value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'enabled')) {
        config.enabled = Boolean(value.enabled)
      }
      if (Number.isFinite(value.limit) && value.limit > 0) {
        config.limit = Math.floor(value.limit)
      }
    } else if (value === false) {
      config.enabled = false
    } else if (value === true) {
      config.enabled = true
    } else if (Number.isFinite(value) && value > 0) {
      config.enabled = true
      config.limit = Math.floor(value)
    }

    if (Object.keys(config).length > 0) {
      normalized[stage] = config
    }
  }
  return normalized
}
