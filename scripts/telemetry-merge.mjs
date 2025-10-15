import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const TMP_PATH = path.join(ROOT, 'data', 'telemetry.tmp.json')
const DATA_PATH = path.join(ROOT, 'data', 'telemetry.json')
const DIST_PATH = path.join(ROOT, 'docs/.vitepress/dist/telemetry.json')
const PUBLIC_PATH = path.join(ROOT, 'docs/public/telemetry.json')
const TOP_LIMIT = 100

function defaultState() {
  return {
    updatedAt: new Date(0).toISOString(),
    pv: { total: 0, pathsTop: [] },
    search: { queriesTop: [], clicksTop: [] },
    _internal: {
      paths: {},
      queries: {}, // hash -> { count, lenSum }
      clicks: {}   // key -> { hash, url, count, rankSum }
    }
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
    search: state.search
  }
}

async function ensureDataFileExists() {
  try {
    await fs.access(DATA_PATH)
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true })
    await fs.writeFile(DATA_PATH, JSON.stringify(defaultState(), null, 2), 'utf8')
  }
}

async function writeOutputs(data) {
  const payload = JSON.stringify(data, null, 2)
  await fs.mkdir(path.dirname(PUBLIC_PATH), { recursive: true })
  await fs.writeFile(PUBLIC_PATH, payload, 'utf8')
  await fs.mkdir(path.dirname(DIST_PATH), { recursive: true })
  await fs.writeFile(DIST_PATH, payload, 'utf8')
}

function updateDerivedSections(state) {
  const pathsEntries = Object.entries(state._internal.paths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LIMIT)
    .map(([path, count]) => ({ path, count }))
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

async function main(){
  await ensureDataFileExists()
  const state = await loadJSON(DATA_PATH, defaultState())
  let tmp
  try {
    tmp = await loadJSON(TMP_PATH)
  } catch {
    // no tmp file, just ensure dist output exists
    updateDerivedSections(state)
    await writeOutputs(sanitizeForPublic(state))
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

  await fs.writeFile(DATA_PATH, JSON.stringify(state, null, 2), 'utf8')
  await writeOutputs(sanitizeForPublic(state))

  await fs.unlink(TMP_PATH).catch(() => {})
  console.log('[telemetry] published telemetry snapshot')
}

main().catch(err => {
  console.error('[telemetry] merge failed:', err)
  process.exit(1)
})
