import fs from 'node:fs/promises'
import path from 'node:path'

const TOP_LIMIT = 100

export const AI_TELEMETRY_SCHEMA_VERSION = '2024-11-01'

const AI_DOMAINS = ['embed', 'summary', 'qa']

const MAX_SMOKE_HISTORY = 5

const AI_EVENT_SCHEMA = {
  start: {
    required: ['timestamp', 'inputCount'],
    numeric: ['inputCount', 'localeCount'],
    boolean: [],
    optional: ['preferredLocale', 'locale', 'localeCount', 'requestedAdapter']
  },
  'adapter.resolved': {
    required: ['timestamp', 'adapter'],
    numeric: [],
    boolean: ['fallback'],
    optional: ['requested', 'model', 'reason', 'fallback']
  },
  'adapter.error': {
    required: ['timestamp', 'adapter', 'message'],
    numeric: [],
    boolean: [],
    optional: ['model']
  },
  batch: {
    required: ['timestamp', 'durationMs', 'inputCount', 'outputCount', 'successRate', 'adapter', 'fallback', 'retries'],
    numeric: ['durationMs', 'inputCount', 'outputCount', 'successRate', 'retries'],
    boolean: ['fallback'],
    optional: ['index', 'model']
  },
  write: {
    required: ['timestamp', 'target', 'bytes', 'durationMs', 'items'],
    numeric: ['bytes', 'durationMs', 'items'],
    boolean: ['cacheReuse'],
    optional: ['cacheReuse']
  },
  complete: {
    required: ['timestamp', 'adapter', 'fallback', 'totalMs', 'inferenceMs', 'writeMs', 'batchCount', 'inputCount', 'outputCount', 'successRate', 'target'],
    numeric: ['totalMs', 'inferenceMs', 'writeMs', 'batchCount', 'inputCount', 'outputCount', 'successRate', 'count', 'retries', 'bytes'],
    boolean: ['fallback', 'cacheReuse'],
    optional: ['model', 'cacheReuse', 'count', 'retries', 'bytes']
  }
}

function extractAIEventType(eventName) {
  if (typeof eventName !== 'string') return null
  const segments = eventName.split('.')
  if (segments.length < 3) return null
  return segments.slice(2).join('.')
}

function isValidTimestamp(value) {
  if (typeof value !== 'string') return false
  const time = Date.parse(value)
  return Number.isFinite(time)
}

function coerceNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function validateAIEvent(domain, event, logger) {
  if (!event || typeof event !== 'object') {
    logger?.warn?.('[telemetry] skip invalid ai event: non-object payload')
    return false
  }

  const eventName = event.event
  if (typeof eventName !== 'string') {
    logger?.warn?.('[telemetry] skip invalid ai event: missing event name')
    return false
  }

  const eventDomain = eventName.split('.')[1]
  if (eventDomain !== domain) {
    logger?.warn?.(`[telemetry] skip ai event with mismatched domain "${eventDomain}" for ${domain}`)
    return false
  }

  const eventType = extractAIEventType(eventName)
  if (!eventType || !Object.prototype.hasOwnProperty.call(AI_EVENT_SCHEMA, eventType)) {
    logger?.warn?.(`[telemetry] skip ai event "${eventName}": unsupported event type`)
    return false
  }

  const schema = AI_EVENT_SCHEMA[eventType]
  if (!isValidTimestamp(event.timestamp)) {
    logger?.warn?.(`[telemetry] skip ai event "${eventName}": invalid timestamp`)
    return false
  }

  const missingFields = (schema.required || []).filter(field => event[field] === undefined)
  if (missingFields.length > 0) {
    logger?.warn?.(
      `[telemetry] skip ai event "${eventName}": missing required field(s) ${missingFields.join(', ')}`
    )
    return false
  }

  for (const field of schema.numeric || []) {
    if (event[field] === undefined) continue
    const coerced = coerceNumber(event[field])
    if (coerced === null) {
      logger?.warn?.(
        `[telemetry] skip ai event "${eventName}": field "${field}" should be numeric`
      )
      return false
    }
    event[field] = coerced
  }

  for (const field of schema.boolean || []) {
    if (event[field] === undefined) continue
    event[field] = Boolean(event[field])
  }

  return true
}

function defaultState() {
  return {
    updatedAt: new Date(0).toISOString(),
    pv: { total: 0, pathsTop: [] },
    search: { queriesTop: [], clicksTop: [] },
    build: { pagegen: null, ai: normalizeAIState({}), graphrag: null, graphragHistory: [] },
    _internal: {
      paths: {},
      queries: {}, // hash -> { count, lenSum }
      clicks: {}   // key -> { hash, url, count, rankSum }
    }
  }
}

function createPaths(root) {
  return {
    root,
    tmpPath: path.join(root, 'data', 'telemetry.tmp.json'),
    dataPath: path.join(root, 'data', 'telemetry.json'),
    distPath: path.join(root, 'docs/.vitepress/dist/telemetry.json'),
    publicPath: path.join(root, 'docs/public/telemetry.json')
  }
}

async function loadJSON(file, fallback) {
  try {
    const content = await fs.readFile(file, 'utf8')
    return JSON.parse(content)
  } catch (err) {
    if (fallback !== undefined) return fallback
    throw err
  }
}

function mergeMaps(target, source, reducer) {
  Object.entries(source || {}).forEach(([key, value]) => {
    reducer(target, key, value)
  })
}

function sanitizeForPublic(state) {
  return {
    updatedAt: state.updatedAt,
    pv: state.pv,
    search: state.search,
    build: state.build
  }
}

async function ensureDataFileExists(paths) {
  try {
    await fs.access(paths.dataPath)
  } catch {
    await fs.mkdir(path.dirname(paths.dataPath), { recursive: true })
    await fs.writeFile(paths.dataPath, JSON.stringify(defaultState(), null, 2), 'utf8')
  }
}

async function writeOutputs(paths, data) {
  const payload = JSON.stringify(data, null, 2)
  await fs.mkdir(path.dirname(paths.publicPath), { recursive: true })
  await fs.writeFile(paths.publicPath, payload, 'utf8')
  await fs.mkdir(path.dirname(paths.distPath), { recursive: true })
  await fs.writeFile(paths.distPath, payload, 'utf8')
}

function pickLatestByType(entries = []) {
  const latest = {}
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const type = entry.type || 'ingest'
    const ts = entry.timestamp ? Date.parse(entry.timestamp) : 0
    const current = latest[type]
    if (!current || Date.parse(current.timestamp || 0) < ts) {
      latest[type] = entry
    }
  }
  return Object.keys(latest).length ? latest : null
}

function updateDerivedSections(state) {
  const pathsEntries = Object.entries(state._internal.paths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LIMIT)
    .map(([pathKey, count]) => ({ path: pathKey, count }))
  const total = Object.values(state._internal.paths).reduce((sum, value) => sum + value, 0)
  state.pv = { total, pathsTop: pathsEntries }

  const queriesTop = Object.entries(state._internal.queries)
    .map(([hash, info]) => ({
      hash,
      count: info.count,
      avgLen: Number((info.lenSum / (info.count || 1)).toFixed(2))
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT)
  state.search.queriesTop = queriesTop

  const clicksTop = Object.values(state._internal.clicks)
    .map(info => ({
      hash: info.hash,
      url: info.url,
      count: info.count,
      avgRank: Number((info.rankSum / (info.count || 1)).toFixed(2))
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT)
  state.search.clicksTop = clicksTop
}

function resolveAIEventsDir(root) {
  const override = process.env.AI_TELEMETRY_PATH
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(root, override)
  }
  return path.join(root, 'data', 'ai-events')
}

function detectDomainFromEvents(events = []) {
  for (const entry of events) {
    const name = typeof entry?.event === 'string' ? entry.event : ''
    const segments = name.split('.')
    if (segments.length >= 3 && segments[0] === 'ai') {
      return segments[1]
    }
  }
  return null
}

function sanitizeSmokeSummary(manifestSummary = {}, manifest = {}) {
  if (!manifestSummary || typeof manifestSummary !== 'object') return null
  const failures = Array.isArray(manifestSummary.failures)
    ? manifestSummary.failures.map(entry => ({
        id: entry?.id ?? entry?.modelId ?? null,
        reason: entry?.reason ?? null
      }))
    : []
  return {
    status: manifestSummary.status ?? 'unknown',
    runtime: manifestSummary.runtime ?? manifest.runtime ?? null,
    executed: Number(manifestSummary.executed ?? 0),
    skipped: Number(manifestSummary.skipped ?? 0),
    failed: Number(manifestSummary.failed ?? 0),
    verifiedAt: manifestSummary.verifiedAt ?? null,
    reason: manifestSummary.reason ?? null,
    failures
  }
}

function sanitizeModelEntries(models = []) {
  if (!Array.isArray(models)) return []
  return models.map(model => ({
    id: model?.id ?? null,
    name: model?.name ?? null,
    tasks: Array.isArray(model?.tasks) ? model.tasks : [],
    smoke: model?.smoke
      ? {
          status: model.smoke.status ?? 'unknown',
          reason: model.smoke.reason ?? null,
          verifiedAt: model.smoke.verifiedAt ?? null
        }
      : null,
    cache: model?.cache
      ? {
          status: model.cache.status ?? null,
          scope: model.cache.location?.scope ?? null
        }
      : null
  }))
}

async function loadModelSmokeSummary(root, logger) {
  const manifestPath = path.join(root, 'data', 'models.json')
  let raw
  try {
    raw = await fs.readFile(manifestPath, 'utf8')
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null
    }
    throw error
  }

  if (!raw) return null

  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (error) {
    logger?.warn?.('[telemetry] skip invalid models manifest:', error?.message || error)
    return null
  }

  const summary = sanitizeSmokeSummary(manifest?.smoke, manifest)
  const models = sanitizeModelEntries(manifest?.models)

  let history = []
  if (Array.isArray(manifest?.history?.smoke)) {
    history = manifest.history.smoke
      .map(entry => sanitizeSmokeSummary(entry, manifest))
      .filter(Boolean)
  }
  if (summary) {
    history = [summary, ...history]
  }
  history = history
    .sort((a, b) => {
      const timeA = a?.verifiedAt ? Date.parse(a.verifiedAt) : 0
      const timeB = b?.verifiedAt ? Date.parse(b.verifiedAt) : 0
      return timeB - timeA
    })
    .slice(0, MAX_SMOKE_HISTORY)

  return {
    summary,
    models,
    runtime: manifest?.runtime ?? null,
    fallback: manifest?.fallback ?? null,
    generatedAt: manifest?.generatedAt ?? null,
    history
  }
}

async function collectAIEvents({ root, logger }) {
  const dir = resolveAIEventsDir(root)
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return new Map()
    }
    throw error
  }

  const grouped = new Map()
  const processedFiles = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const filePath = path.join(dir, entry.name)
    let parsed
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      parsed = JSON.parse(raw)
    } catch (error) {
      logger?.warn?.(`[telemetry] skip invalid ai event file ${entry.name}: ${error?.message || error}`)
      processedFiles.push(filePath)
      continue
    }

    const events = Array.isArray(parsed?.events) ? parsed.events.filter(evt => evt && typeof evt === 'object') : []
    if (!events.length) {
      processedFiles.push(filePath)
      continue
    }

    const domain = parsed?.domain || detectDomainFromEvents(events)
    if (!domain) {
      logger?.warn?.(`[telemetry] skip ai event file without domain: ${entry.name}`)
      processedFiles.push(filePath)
      continue
    }

    const validEvents = events.filter(evt => validateAIEvent(domain, evt, logger))
    if (!validEvents.length) {
      logger?.warn?.(
        `[telemetry] skip ai event file ${entry.name}: no events passed schema validation`
      )
      processedFiles.push(filePath)
      continue
    }

    const list = grouped.get(domain) || []
    list.push(...validEvents)
    grouped.set(domain, list)
    processedFiles.push(filePath)
  }

  await Promise.all(
    processedFiles.map(file => fs.unlink(file).catch(() => {}))
  )

  return grouped
}

function computeSuccessRate(outputCount, inputCount) {
  if (!Number.isFinite(inputCount) || inputCount <= 0) return 1
  if (!Number.isFinite(outputCount) || outputCount < 0) return 0
  const rate = outputCount / inputCount
  return Number.isFinite(rate) ? Number(rate.toFixed(4)) : 0
}

function normalizeAIOverview(overview) {
  const summary = overview?.summary || {}
  return {
    schemaVersion: overview?.schemaVersion ?? AI_TELEMETRY_SCHEMA_VERSION,
    updatedAt: overview?.updatedAt ?? null,
    status: overview?.status ?? 'unknown',
    summary: {
      ok: summary.ok ?? 0,
      fallback: summary.fallback ?? 0,
      empty: summary.empty ?? 0,
      missing: summary.missing ?? 0,
      overall: summary.overall ?? overview?.status ?? 'unknown'
    },
    domains: overview?.domains && typeof overview.domains === 'object' ? { ...overview.domains } : {}
  }
}

function normalizeAIState(existing = {}) {
  return {
    schemaVersion: AI_TELEMETRY_SCHEMA_VERSION,
    embed: existing?.embed ?? null,
    summary: existing?.summary ?? null,
    qa: existing?.qa ?? null,
    overview: normalizeAIOverview(existing?.overview),
    smoke: existing?.smoke ?? null
  }
}

function summarizeAIDomain(domain, events = []) {
  if (!events.length) return null
  const sorted = events
    .filter(event => event && typeof event === 'object')
    .sort((a, b) => {
      const aTime = Number(new Date(a.timestamp || 0))
      const bTime = Number(new Date(b.timestamp || 0))
      return aTime - bTime
    })

  const prefix = `ai.${domain}.`
  const start = sorted.find(event => event.event === `${prefix}start`)
  const complete = [...sorted].reverse().find(event => event.event === `${prefix}complete` || event.event === `${prefix}completed`)
  const batches = sorted.filter(event => event.event === `${prefix}batch`)
  const write = [...sorted].reverse().find(event => event.event === `${prefix}write`)
  const adapter = sorted.find(event => event.event === `${prefix}adapter.resolved`)
  const errors = sorted.filter(event => event.event === `${prefix}adapter.error`)

  const batchCount = Number(complete?.batchCount ?? batches.length ?? 0)
  const inputCount = Number(
    complete?.inputCount ??
      batches.at(-1)?.inputCount ??
      start?.inputCount ?? 0
  )
  const outputCount = Number(
    complete?.outputCount ??
      batches.at(-1)?.outputCount ??
      complete?.count ??
      0
  )
  const retries = Number(complete?.retries ?? batches.reduce((sum, entry) => sum + Number(entry.retries || 0), 0) ?? 0)

  const batchTotalMsRaw = batches.reduce((sum, entry) => sum + Number(entry.durationMs || 0), 0)
  const inferenceTotalMs = batchTotalMsRaw || Number(complete?.inferenceMs || 0)
  const batchTotalMs = inferenceTotalMs
  const batchAvgMs = batchCount > 0 ? Number((batchTotalMs / batchCount).toFixed(2)) : 0

  const rawSuccessRate = Number(
    complete?.successRate ?? computeSuccessRate(outputCount, inputCount)
  )
  const successRate = Math.min(Math.max(rawSuccessRate, 0), 1)

  const timestamp = complete?.timestamp || write?.timestamp || start?.timestamp || new Date().toISOString()
  const totalMs = Number(
    complete?.totalMs ??
      (start && complete
        ? Number(new Date(complete.timestamp)) - Number(new Date(start.timestamp))
        : 0)
  )

  const writeSummary = write || complete
    ? {
        target: (write?.target ?? complete?.target) || null,
        bytes: Number((write?.bytes ?? complete?.bytes) || 0),
        durationMs: Number((write?.durationMs ?? complete?.writeMs) || 0),
        items: Number((write?.items ?? complete?.outputCount ?? complete?.count) || 0),
        cacheReuse: Boolean(write?.cacheReuse ?? complete?.cacheReuse ?? false)
      }
    : null

  const adapterSummary = {
    name: complete?.adapter ?? adapter?.adapter ?? null,
    model: complete?.model ?? adapter?.model ?? null,
    fallback: Boolean(
      complete?.fallback ?? adapter?.fallback ?? false
    )
  }

  const cacheReuse = Boolean(
    complete?.cacheReuse ??
      write?.cacheReuse ??
      false
  )

  return {
    schemaVersion: AI_TELEMETRY_SCHEMA_VERSION,
    timestamp,
    totalMs,
    adapter: adapterSummary,
    inference: {
      batches: batchCount,
      totalMs: Number(batchTotalMs || 0),
      avgMs: batchAvgMs,
      inputCount,
      outputCount,
      successRate,
      retries,
      errors: errors.slice(0, 5).map(error => ({
        adapter: error.adapter ?? adapterSummary.name,
        model: error.model ?? adapterSummary.model,
        message: error.message || null
      }))
    },
    write: writeSummary,
    cache: { reused: cacheReuse }
  }
}

function mergeAIState(existing, grouped, logger) {
  const normalized = normalizeAIState(existing)
  for (const [domain, events] of grouped.entries()) {
    if (!AI_DOMAINS.includes(domain)) {
      logger?.warn?.(`[telemetry] skip ai domain ${domain}`)
      continue
    }
    const summary = summarizeAIDomain(domain, events)
    if (summary) {
      normalized[domain] = summary
    }
  }
  return normalized
}

function computeDomainOverview(summary) {
  if (!summary) {
    return {
      status: 'missing',
      lastRunAt: null,
      adapter: null,
      outputCount: 0,
      successRate: null,
      cacheReuse: false,
      totalMs: null,
      inputCount: null,
      retries: null,
      batches: null
    }
  }

  const fallback = Boolean(summary.adapter?.fallback)
  const outputCount = Number(summary.inference?.outputCount ?? summary.write?.items ?? 0)
  let status = 'ok'
  if (fallback) {
    status = 'fallback'
  } else if (!Number.isFinite(outputCount) || outputCount <= 0) {
    status = 'empty'
  }

  return {
    status,
    lastRunAt: summary.timestamp || null,
    adapter: summary.adapter || null,
    outputCount,
    successRate: summary.inference?.successRate ?? null,
    cacheReuse: summary.cache?.reused ?? Boolean(summary.write?.cacheReuse),
    totalMs: summary.totalMs ?? null,
    inputCount: summary.inference?.inputCount ?? null,
    retries: summary.inference?.retries ?? null,
    batches: summary.inference?.batches ?? null
  }
}

function resolveOverallStatus(counts) {
  if ((counts.ok ?? 0) === 0 && (counts.fallback ?? 0) === 0 && (counts.empty ?? 0) === 0) {
    return 'missing'
  }
  if ((counts.fallback ?? 0) > 0 || (counts.empty ?? 0) > 0) {
    return 'degraded'
  }
  return 'ok'
}

function updateAIOverview(state, options = {}) {
  const normalized = normalizeAIState(state)
  const smokeSummary = options?.smoke?.summary || options?.smoke || null
  const overview = {
    schemaVersion: AI_TELEMETRY_SCHEMA_VERSION,
    updatedAt: null,
    status: 'unknown',
    summary: { ok: 0, fallback: 0, empty: 0, missing: 0, overall: 'unknown' },
    domains: {}
  }

  let latestTimestamp = null
  for (const domain of AI_DOMAINS) {
    const domainOverview = computeDomainOverview(normalized[domain])
    overview.domains[domain] = domainOverview
    overview.summary[domainOverview.status] = (overview.summary[domainOverview.status] || 0) + 1

    const ts = domainOverview.lastRunAt
    if (ts && (!latestTimestamp || new Date(ts) > new Date(latestTimestamp))) {
      latestTimestamp = ts
    }
  }

  overview.summary.overall = resolveOverallStatus(overview.summary)
  overview.status = overview.summary.overall
  overview.updatedAt = latestTimestamp

  if (smokeSummary) {
    const smokeStatus = smokeSummary.status ?? 'unknown'
    overview.smoke = {
      status: smokeStatus,
      runtime: smokeSummary.runtime ?? null,
      executed: Number(smokeSummary.executed ?? 0),
      skipped: Number(smokeSummary.skipped ?? 0),
      failed: Number(smokeSummary.failed ?? 0),
      verifiedAt: smokeSummary.verifiedAt ?? null
    }
    if (smokeStatus === 'failed') {
      overview.status = 'degraded'
      overview.summary.overall = overview.status
    }
  }

  normalized.overview = overview
  normalized.schemaVersion = AI_TELEMETRY_SCHEMA_VERSION
  return normalized
}

function logAIOverview(aiState, logger) {
  if (!logger?.log) return
  const overview = aiState?.overview
  if (!overview) return
  const summary = overview.summary || {}
  logger.log(
    `[telemetry] ai overview status=${overview.status} updated=${overview.updatedAt || 'n/a'} ok=${summary.ok ?? 0} fallback=${summary.fallback ?? 0} empty=${summary.empty ?? 0} missing=${summary.missing ?? 0}`
  )
  for (const domain of AI_DOMAINS) {
    const info = overview.domains?.[domain]
    if (!info) continue
    const adapterName = info.adapter?.name || 'n/a'
    const adapterModel = info.adapter?.model || null
    const adapterDescriptor = adapterModel ? `${adapterName}(${adapterModel})` : adapterName
    const fallback = info.adapter?.fallback ? 'yes' : 'no'
    logger.log(
      `[telemetry] ai.${domain} status=${info.status} adapter=${adapterDescriptor} fallback=${fallback} output=${info.outputCount ?? 0} successRate=${info.successRate ?? 0}`
    )
  }
  const smokeSummary = aiState?.smoke?.summary || overview.smoke
  if (smokeSummary) {
    logger.log(
      `[telemetry] ai smoke status=${smokeSummary.status ?? 'unknown'} failed=${smokeSummary.failed ?? 0} executed=${smokeSummary.executed ?? 0} skipped=${smokeSummary.skipped ?? 0}`
    )
  }
}

async function loadLatestPagegenSummary(root) {
  const metricsPath = path.join(root, 'data', 'pagegen-metrics.json')
  let raw
  try {
    raw = await fs.readFile(metricsPath, 'utf8')
  } catch {
    return null
  }
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn('[telemetry] skip invalid pagegen metrics:', error?.message || error)
    return null
  }
  if (!Array.isArray(parsed) || !parsed.length) return null
  const latest = parsed.at(-1)
  if (!latest) return null
  const collectSummary = latest.collect?.summary || {}
  const writeSummary = latest.write?.summary || {}
  const feedsSummary = latest.feeds || null
  const navSummary = latest.nav || null
  const schedulerSummary = latest.scheduler || null
  const pluginsSummary = latest.plugins || null
  return {
    timestamp: latest.timestamp,
    totalMs: latest.totalMs,
    collect: {
      locales: collectSummary.locales,
      cacheHitRate: collectSummary.cacheHitRate,
      cacheHits: collectSummary.cacheHits,
      cacheMisses: collectSummary.cacheMisses,
      cacheDisabledLocales: collectSummary.cacheDisabledLocales,
      parsedFiles: collectSummary.parsedFiles,
      totalFiles: collectSummary.totalFiles,
      parseErrors: collectSummary.parseErrors,
      errorEntries: collectSummary.errorEntries
    },
    write: {
      total: writeSummary.total,
      written: writeSummary.written,
      skipped: writeSummary.skipped,
      failed: writeSummary.failed,
      hashMatches: writeSummary.hashMatches,
      disabled: writeSummary.disabled,
      skippedByReason: writeSummary.skippedByReason || {}
    },
    feeds: feedsSummary,
    nav: navSummary,
    scheduler: schedulerSummary,
    plugins: pluginsSummary
  }
}

async function loadLatestGraphragSummary(root) {
  const metricsPath = path.join(root, 'data', 'graphrag-metrics.json')
  let raw
  try {
    raw = await fs.readFile(metricsPath, 'utf8')
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null
    }
    throw error
  }

  if (!raw) return null

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn('[telemetry] skip invalid graphrag metrics:', error?.message || error)
    return null
  }

  if (!Array.isArray(parsed) || !parsed.length) return null

  const summary = pickLatestByType(parsed)
  summary.warnings = computeGraphragWarnings(summary)
  return summary
}

function computeGraphragWarnings(summary = {}) {
  const warnings = []
  if (!summary || typeof summary !== 'object') return warnings

  function addWarning({ scope, message, severity = 'warning', timestamp }) {
    warnings.push({
      scope,
      message,
      severity,
      timestamp: timestamp ?? new Date().toISOString()
    })
  }

  const ingest = summary.ingest
  if (ingest && Number(ingest.write?.written ?? 0) === 0) {
    addWarning({
      scope: 'ingest',
      message: '最新 ingest 未写入任何文档，请检查质量守门与缓存设置。',
      severity: 'error',
      timestamp: ingest.timestamp
    })
  }

  const retrieve = summary.retrieve
  if (
    retrieve?.mode === 'hybrid' &&
    Array.isArray(retrieve?.totals?.sources) &&
    !retrieve.totals.sources.includes('structure')
  ) {
    addWarning({
      scope: 'retrieve',
      message: 'Hybrid 检索未启用结构权重，请确认是否已运行 graphrag:gnn。',
      severity: 'warning',
      timestamp: retrieve.timestamp
    })
  }

  const exportSummary = summary.export
  if (exportSummary && exportSummary.files && exportSummary.files.page === false) {
    addWarning({
      scope: 'export',
      message: '最近一次 graphrag:export 未生成主题页，/graph 下可能缺少可视化入口。',
      severity: 'warning',
      timestamp: exportSummary.timestamp
    })
  }

  const explore = summary.explore
  if (explore && (explore.truncatedNodes || explore.truncatedEdges)) {
    addWarning({
      scope: 'explore',
      message: 'Graph Explorer 子图存在截断，请检查 --node-limit / --edge-limit 配置。',
      severity: 'info',
      timestamp: explore.timestamp
    })
  }

  return warnings
}

export async function mergeTelemetry({ root = process.cwd(), logger = console } = {}) {
  const paths = createPaths(root)
  await ensureDataFileExists(paths)
  const state = await loadJSON(paths.dataPath, defaultState())

  if (!state.build || typeof state.build !== 'object') {
    state.build = { pagegen: null, ai: normalizeAIState({}), graphrag: null, graphragHistory: [] }
  } else {
    if (!Object.prototype.hasOwnProperty.call(state.build, 'pagegen')) {
      state.build.pagegen = state.build.pagegen ?? null
    }
    if (!Object.prototype.hasOwnProperty.call(state.build, 'ai')) {
      state.build.ai = normalizeAIState({})
    }
    if (!Object.prototype.hasOwnProperty.call(state.build, 'graphrag')) {
      state.build.graphrag = state.build.graphrag ?? null
    }
    if (!Object.prototype.hasOwnProperty.call(state.build, 'graphragHistory')) {
      state.build.graphragHistory = Array.isArray(state.build.graphragHistory)
        ? state.build.graphragHistory
        : []
    }
  }

  state.build.ai = normalizeAIState(state.build.ai)

  const aiGrouped = await collectAIEvents({ root, logger })
  if (aiGrouped.size > 0) {
    state.build.ai = mergeAIState(state.build.ai, aiGrouped, logger)
  }

  const modelSmoke = await loadModelSmokeSummary(root, logger)

  state.build.ai = updateAIOverview(state.build.ai, { smoke: modelSmoke })
  state.build.ai.smoke = {
    summary: modelSmoke?.summary ?? null,
    models: modelSmoke?.models ?? [],
    runtime: modelSmoke?.runtime ?? null,
    fallback: modelSmoke?.fallback ?? null,
    generatedAt: modelSmoke?.generatedAt ?? null,
    history: modelSmoke?.history ?? []
  }
  logAIOverview(state.build.ai, logger)

  const graphragSummary = await loadLatestGraphragSummary(root)
  state.build.graphrag = graphragSummary ?? null
  if (!Array.isArray(state.build.graphragHistory)) {
    state.build.graphragHistory = []
  }
  if (graphragSummary) {
    const referenceTimestamp =
      graphragSummary.explore?.timestamp ??
      graphragSummary.retrieve?.timestamp ??
      graphragSummary.export?.timestamp ??
      graphragSummary.ingest?.timestamp ??
      new Date().toISOString()

    const entry = {
      timestamp: referenceTimestamp,
      warnings: graphragSummary.warnings ?? []
    }

    const lastEntry = state.build.graphragHistory[0]
    if (!lastEntry || JSON.stringify(lastEntry) !== JSON.stringify(entry)) {
      state.build.graphragHistory.unshift(entry)
    }
    if (state.build.graphragHistory.length > 10) {
      state.build.graphragHistory = state.build.graphragHistory.slice(0, 10)
    }
  }

  let tmp
  try {
    tmp = await loadJSON(paths.tmpPath)
  } catch {
    tmp = null
  }

  if (tmp) {
    mergeMaps(state._internal.paths, tmp?.pv?.paths || {}, (target, key, value) => {
      target[key] = (target[key] || 0) + Number(value || 0)
    })

    mergeMaps(state._internal.queries, tmp?.search?.queries || {}, (target, hash, info) => {
      const entry = target[hash] || { count: 0, lenSum: 0 }
      entry.count += Number(info.count || 0)
      entry.lenSum += Number(info.lenSum || 0)
      target[hash] = entry
    })

    mergeMaps(state._internal.clicks, tmp?.search?.clicks || {}, (target, key, info) => {
      const entry = target[key] || { hash: info.hash, url: info.url, count: 0, rankSum: 0 }
      entry.count += Number(info.count || 0)
      entry.rankSum += Number(info.rankSum || 0)
      entry.hash = info.hash
      entry.url = info.url
      target[key] = entry
    })

    state.updatedAt = new Date().toISOString()
  }

  updateDerivedSections(state)
  state.build.pagegen = await loadLatestPagegenSummary(root).catch(() => state.build.pagegen || null)

  await fs.writeFile(paths.dataPath, JSON.stringify(state, null, 2), 'utf8')
  await writeOutputs(paths, sanitizeForPublic(state))

  if (tmp) {
    await fs.unlink(paths.tmpPath).catch(() => {})
    logger?.log?.('[telemetry] published telemetry snapshot')
  }
}

if (import.meta.main) {
  mergeTelemetry().catch(err => {
    console.error('[telemetry] merge failed:', err)
    process.exit(1)
  })
}
