import fs from 'node:fs/promises'
import path from 'node:path'

const TOP_LIMIT = 100

function defaultState() {
  return {
    updatedAt: new Date(0).toISOString(),
    pv: { total: 0, pathsTop: [] },
    search: { queriesTop: [], clicksTop: [] },
    build: { pagegen: null, ai: { embed: null, summary: null, qa: null } },
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

    const list = grouped.get(domain) || []
    list.push(...events)
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

function normalizeAIState(existing = {}) {
  return {
    embed: existing?.embed ?? null,
    summary: existing?.summary ?? null,
    qa: existing?.qa ?? null
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

  const batchTotalMs = batches.reduce((sum, entry) => sum + Number(entry.durationMs || 0), 0)
  const batchAvgMs = batchCount > 0 ? Number((batchTotalMs / batchCount).toFixed(2)) : 0

  const successRate = Number(
    complete?.successRate ?? computeSuccessRate(outputCount, inputCount)
  )

  const timestamp = complete?.timestamp || write?.timestamp || start?.timestamp || new Date().toISOString()
  const totalMs = Number(
    complete?.totalMs ??
      (start && complete
        ? Number(new Date(complete.timestamp)) - Number(new Date(start.timestamp))
        : 0)
  )

  const writeSummary = write
    ? {
        target: write.target,
        bytes: Number(write.bytes || 0),
        durationMs: Number(write.durationMs || 0),
        items: Number(write.items || 0),
        cacheReuse: Boolean(write.cacheReuse)
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
    if (!['embed', 'summary', 'qa'].includes(domain)) {
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

export async function mergeTelemetry({ root = process.cwd(), logger = console } = {}) {
  const paths = createPaths(root)
  await ensureDataFileExists(paths)
  const state = await loadJSON(paths.dataPath, defaultState())

  if (!state.build || typeof state.build !== 'object') {
    state.build = { pagegen: null, ai: { embed: null, summary: null, qa: null } }
  } else {
    if (!Object.prototype.hasOwnProperty.call(state.build, 'pagegen')) {
      state.build.pagegen = state.build.pagegen ?? null
    }
    if (!Object.prototype.hasOwnProperty.call(state.build, 'ai')) {
      state.build.ai = { embed: null, summary: null, qa: null }
    } else {
      state.build.ai = normalizeAIState(state.build.ai)
    }
  }

  const aiGrouped = await collectAIEvents({ root, logger })
  if (aiGrouped.size > 0) {
    state.build.ai = mergeAIState(state.build.ai, aiGrouped, logger)
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
