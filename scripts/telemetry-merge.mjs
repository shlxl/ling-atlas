import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOP_LIMIT = 100

export function createTelemetryContext(root = process.cwd()) {
  const resolvedRoot = path.resolve(root)
  const dataDir = path.join(resolvedRoot, 'data')
  return {
    root: resolvedRoot,
    dataDir,
    tmpPath: path.join(dataDir, 'telemetry.tmp.json'),
    dataPath: path.join(dataDir, 'telemetry.json'),
    distPath: path.join(resolvedRoot, 'docs/.vitepress/dist/telemetry.json'),
    publicPath: path.join(resolvedRoot, 'docs/public/telemetry.json'),
    aiEventsDir: path.join(dataDir, 'ai-events'),
    pagegenMetricsPath: path.join(dataDir, 'pagegen-metrics.json')
  }
}

export function defaultState() {
  return {
    updatedAt: new Date(0).toISOString(),
    pv: { total: 0, pathsTop: [] },
    search: { queriesTop: [], clicksTop: [] },
    build: { pagegen: null, ai: null },
    _internal: {
      paths: {},
      queries: {},
      clicks: {}
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

async function ensureDataFileExists(ctx) {
  try {
    await fs.access(ctx.dataPath)
  } catch {
    await fs.mkdir(path.dirname(ctx.dataPath), { recursive: true })
    await fs.writeFile(ctx.dataPath, JSON.stringify(defaultState(), null, 2), 'utf8')
  }
}

async function writeOutputs(ctx, data) {
  const payload = JSON.stringify(data, null, 2)
  await fs.mkdir(path.dirname(ctx.publicPath), { recursive: true })
  await fs.writeFile(ctx.publicPath, payload, 'utf8')
  await fs.mkdir(path.dirname(ctx.distPath), { recursive: true })
  await fs.writeFile(ctx.distPath, payload, 'utf8')
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

function timestampValue(value) {
  const result = Date.parse(value || '')
  return Number.isNaN(result) ? 0 : result
}

function mergeAiBuild(previous, incoming) {
  if (!incoming || !Object.keys(incoming).length) {
    return previous ?? null
  }
  const base = previous && typeof previous === 'object' ? { ...previous } : {}
  for (const [key, value] of Object.entries(incoming)) {
    base[key] = value
  }
  return base
}

export async function loadLatestPagegenSummary(ctx = createTelemetryContext()) {
  let raw
  try {
    raw = await fs.readFile(ctx.pagegenMetricsPath, 'utf8')
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
    }
  }
}

export async function loadLatestAiSummary(ctx = createTelemetryContext()) {
  let entries
  try {
    entries = await fs.readdir(ctx.aiEventsDir, { withFileTypes: true })
  } catch {
    return null
  }
  if (!entries.length) return null

  const summaries = {}

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const filePath = path.join(ctx.aiEventsDir, entry.name)
    let payload
    try {
      payload = JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      console.warn('[telemetry] skip invalid AI telemetry file:', entry.name, error?.message || error)
      continue
    }

    const events = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload) ? payload : []
    if (!events.length) {
      await fs.unlink(filePath).catch(() => {})
      continue
    }

    const namespace = payload.namespace || events[0]?.namespace
    if (typeof namespace !== 'string' || !namespace.startsWith('ai.')) {
      await fs.unlink(filePath).catch(() => {})
      continue
    }

    const key = namespace.split('.')[1]
    if (!key) {
      await fs.unlink(filePath).catch(() => {})
      continue
    }

    const lastEvent = [...events]
      .reverse()
      .find(ev => typeof ev?.event === 'string' && (ev.event.endsWith('.completed') || ev.event.endsWith('.failed') || ev.event.endsWith('.skipped')))

    if (!lastEvent) {
      await fs.unlink(filePath).catch(() => {})
      continue
    }

    const status = lastEvent.status || (lastEvent.event.endsWith('.failed')
      ? 'failed'
      : lastEvent.event.endsWith('.skipped')
        ? 'skipped'
        : 'success')

    const summary = {
      namespace,
      script: payload.script || lastEvent.script || key,
      runId: payload.runId || lastEvent.runId,
      startedAt: payload.startedAt || null,
      timestamp: lastEvent.timestamp || payload.startedAt || new Date().toISOString(),
      status,
      durationMs: lastEvent.durationMs ?? null,
      adapter: lastEvent.adapter,
      itemsProcessed: lastEvent.itemsProcessed ?? null,
      filesScanned: lastEvent.filesScanned ?? null,
      draftsSkipped: lastEvent.draftsSkipped ?? null,
      outputPath: lastEvent.outputPath,
      locales: lastEvent.locales,
      errorName: lastEvent.errorName,
      errorMessage: lastEvent.errorMessage
    }

    const prev = summaries[key]
    if (!prev || timestampValue(summary.timestamp) >= timestampValue(prev.timestamp)) {
      summaries[key] = summary
    }

    await fs.unlink(filePath).catch(() => {})
  }

  return Object.keys(summaries).length ? summaries : null
}

export async function mergeTelemetry(options = {}) {
  const ctx = createTelemetryContext(options.root)
  await ensureDataFileExists(ctx)
  const state = await loadJSON(ctx.dataPath, defaultState())

  if (!state.build || typeof state.build !== 'object') {
    state.build = { pagegen: null, ai: null }
  } else {
    if (!Object.prototype.hasOwnProperty.call(state.build, 'pagegen')) {
      state.build.pagegen = state.build.pagegen ?? null
    }
    if (!Object.prototype.hasOwnProperty.call(state.build, 'ai')) {
      state.build.ai = state.build.ai ?? null
    }
  }

  let tmp
  try {
    tmp = await loadJSON(ctx.tmpPath)
  } catch {
    tmp = null
  }

  if (!tmp) {
    updateDerivedSections(state)
    const pagegenSummary = await loadLatestPagegenSummary(ctx).catch(() => null)
    if (pagegenSummary) {
      state.build.pagegen = pagegenSummary
    }
    const aiSummary = await loadLatestAiSummary(ctx).catch(() => null)
    if (aiSummary) {
      state.build.ai = mergeAiBuild(state.build.ai, aiSummary)
    } else {
      state.build.ai = state.build.ai ?? null
    }
    await fs.writeFile(ctx.dataPath, JSON.stringify(state, null, 2), 'utf8')
    await writeOutputs(ctx, sanitizeForPublic(state))
    return
  }

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
  updateDerivedSections(state)
  state.build.pagegen = await loadLatestPagegenSummary(ctx).catch(() => state.build.pagegen || null)
  const aiSummary = await loadLatestAiSummary(ctx).catch(() => null)
  if (aiSummary) {
    state.build.ai = mergeAiBuild(state.build.ai, aiSummary)
  } else {
    state.build.ai = state.build.ai ?? null
  }

  await fs.writeFile(ctx.dataPath, JSON.stringify(state, null, 2), 'utf8')
  await writeOutputs(ctx, sanitizeForPublic(state))

  await fs.unlink(ctx.tmpPath).catch(() => {})
  console.log('[telemetry] published telemetry snapshot')
}

const modulePath = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  mergeTelemetry().catch(err => {
    console.error('[telemetry] merge failed:', err)
    process.exit(1)
  })
}
