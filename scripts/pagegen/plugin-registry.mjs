const STAGE_EVENTS = Object.freeze({
  BEFORE_STAGE: 'beforeStage',
  AFTER_STAGE: 'afterStage',
  ERROR: 'onError'
})

const EVENT_NAMES = Object.values(STAGE_EVENTS)

export function createPluginRegistry() {
  const stages = []
  const lifecycleHandlers = {
    [STAGE_EVENTS.BEFORE_STAGE]: [],
    [STAGE_EVENTS.AFTER_STAGE]: [],
    [STAGE_EVENTS.ERROR]: []
  }

  function registerStage(definition = {}) {
    const { name, run, iterator, task } = definition || {}
    if (!name || typeof name !== 'string') {
      throw new Error('[pagegen.plugin-registry] registerStage requires a stage name')
    }
    if (run && (iterator || task)) {
      throw new Error('[pagegen.plugin-registry] stage cannot define both "run" and "iterator/task" handlers')
    }
    if (!run && !(typeof iterator === 'function' && typeof task === 'function')) {
      throw new Error('[pagegen.plugin-registry] stage must provide either a "run" handler or both "iterator" and "task" handlers')
    }
    stages.push({
      name,
      run: typeof run === 'function' ? run : null,
      iterator: typeof iterator === 'function' ? iterator : null,
      task: typeof task === 'function' ? task : null,
      parallel: Boolean(definition?.parallel),
      beforeStage: typeof definition?.beforeStage === 'function' ? definition.beforeStage : null,
      afterStage: typeof definition?.afterStage === 'function' ? definition.afterStage : null,
      onError: typeof definition?.onError === 'function' ? definition.onError : null
    })
    return definition
  }

  function on(event, handler) {
    const normalized = normalizeEvent(event)
    if (!normalized) {
      throw new Error(`[pagegen.plugin-registry] unsupported lifecycle event "${event}"`)
    }
    if (typeof handler !== 'function') {
      throw new Error(`[pagegen.plugin-registry] lifecycle handler for "${normalized}" must be a function`)
    }
    lifecycleHandlers[normalized].push(handler)
    return () => {
      const handlers = lifecycleHandlers[normalized]
      const index = handlers.indexOf(handler)
      if (index >= 0) handlers.splice(index, 1)
    }
  }

  function getStages() {
    return stages.slice()
  }

  function getLifecycleHandlers(event) {
    const normalized = normalizeEvent(event)
    if (!normalized) return []
    return lifecycleHandlers[normalized].slice()
  }

  return { registerStage, getStages, getLifecycleHandlers, on }
}

function normalizeEvent(event) {
  if (EVENT_NAMES.includes(event)) return event
  if (typeof event === 'string') {
    const lower = event.toLowerCase()
    if (lower === 'beforestage') return STAGE_EVENTS.BEFORE_STAGE
    if (lower === 'afterstage') return STAGE_EVENTS.AFTER_STAGE
    if (lower === 'onerror' || lower === 'error') return STAGE_EVENTS.ERROR
  }
  return null
}

export const lifecycleEvents = Object.freeze({
  BEFORE_STAGE: STAGE_EVENTS.BEFORE_STAGE,
  AFTER_STAGE: STAGE_EVENTS.AFTER_STAGE,
  ERROR: STAGE_EVENTS.ERROR
})
