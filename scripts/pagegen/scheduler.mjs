import { lifecycleEvents } from './plugin-registry.mjs'

export function createScheduler(registry, options = {}) {
  if (!registry || typeof registry.getStages !== 'function') {
    throw new Error('[pagegen.scheduler] registry with getStages() is required')
  }

  const parallelEnabled = options?.parallel !== false
  const parallelLimit = normalizeLimit(options?.parallelLimit)

  async function run(sharedContext = {}) {
    const stages = registry.getStages()
    const allContext = { shared: sharedContext, options: { parallel: parallelEnabled, parallelLimit } }
    await callLifecycle(lifecycleEvents.BEFORE_ALL, { ...allContext })
    try {
      for (const stageDef of stages) {
        await executeStage(stageDef, sharedContext)
      }
    } finally {
      await callLifecycle(lifecycleEvents.AFTER_ALL, { ...allContext })
    }
  }

  async function executeStage(stageDef, sharedContext) {
    const stageCtx = { shared: sharedContext, stage: stageDef.name, definition: stageDef, options: { parallel: parallelEnabled, parallelLimit } }
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
          // no-op
        } else if (stageDef.parallel && parallelEnabled) {
          await runParallel(items, sharedContext, stageCtx, stageDef.task, parallelLimit)
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
      await callLifecycle(lifecycleEvents.STAGE_ERROR, stageCtx)
      throw error
    } finally {
      if (!stageError && typeof stageDef.afterStage === 'function') {
        await stageDef.afterStage(sharedContext, stageCtx)
      }
      if (!stageError) {
        await callLifecycle(lifecycleEvents.AFTER_STAGE, stageCtx)
      }
    }
  }

  return { run }

  async function callLifecycle(event, payload) {
    const handlers = registry.getLifecycleHandlers(event)
    for (const handler of handlers) {
      await handler(payload)
    }
  }
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
  if (Number.isFinite(num) && num > 0) return Math.floor(num)
  return 1
}
