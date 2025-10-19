const LIFECYCLE_EVENTS = new Set(['beforeAll', 'afterAll', 'beforeStage', 'afterStage', 'stageError'])

export function createPluginRegistry() {
  const stages = []
  const lifecycleHandlers = {
    beforeAll: [],
    afterAll: [],
    beforeStage: [],
    afterStage: [],
    stageError: []
  }

  function registerStage(definition = {}) {
    const { name, run, iterator, task } = definition || {}
    if (!name) {
      throw new Error('[pagegen.plugin-registry] registerStage requires a stage name')
    }
    if (run && (iterator || task)) {
      throw new Error('[pagegen.plugin-registry] stage cannot provide both "run" and "iterator/task" definitions')
    }
    if (!run && !(iterator && task)) {
      throw new Error('[pagegen.plugin-registry] stage must provide either "run" or both "iterator" and "task" handlers')
    }
    stages.push({
      name,
      run: run || null,
      iterator: iterator || null,
      task: task || null,
      parallel: Boolean(definition?.parallel),
      beforeStage: definition?.beforeStage || null,
      afterStage: definition?.afterStage || null,
      onError: definition?.onError || null
    })
    return definition
  }

  function on(event, handler) {
    if (!LIFECYCLE_EVENTS.has(event)) {
      throw new Error(`[pagegen.plugin-registry] unsupported lifecycle event "${event}"`)
    }
    if (typeof handler !== 'function') {
      throw new Error(`[pagegen.plugin-registry] lifecycle handler for "${event}" must be a function`)
    }
    lifecycleHandlers[event].push(handler)
    return () => {
      const handlers = lifecycleHandlers[event]
      const index = handlers.indexOf(handler)
      if (index >= 0) handlers.splice(index, 1)
    }
  }

  function getStages() {
    return stages.slice()
  }

  function getLifecycleHandlers(event) {
    if (!LIFECYCLE_EVENTS.has(event)) return []
    return lifecycleHandlers[event].slice()
  }

  return { registerStage, getStages, getLifecycleHandlers, on }
}

export const lifecycleEvents = Object.freeze({
  BEFORE_ALL: 'beforeAll',
  AFTER_ALL: 'afterAll',
  BEFORE_STAGE: 'beforeStage',
  AFTER_STAGE: 'afterStage',
  STAGE_ERROR: 'stageError'
})
