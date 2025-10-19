import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function parseArgs(argv) {
  const args = [...argv]
  function takeFlag(flag) {
    const index = args.indexOf(flag)
    if (index === -1) return undefined
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`)
    }
    args.splice(index, 2)
    return value
  }

  const baseline = takeFlag('--baseline') || process.env.STATS_BASELINE
  const current = takeFlag('--current') || process.env.STATS_CURRENT || path.join(process.cwd(), 'data', 'stats.snapshot.json')
  const warnThreshold = parseNumber(takeFlag('--warn-threshold') ?? process.env.STATS_WARN_THRESHOLD, 0.3)
  const failThreshold = parseNumber(takeFlag('--fail-threshold') ?? process.env.STATS_FAIL_THRESHOLD, 0.6)
  const limit = Math.max(1, Math.floor(parseNumber(takeFlag('--limit') ?? process.env.STATS_DIFF_LIMIT, 10)))
  const json = args.includes('--json')
  const quiet = args.includes('--quiet')

  return { baseline, current, warnThreshold, failThreshold, limit, json, quiet }
}

async function detectDefaultBaseline() {
  const snapshotPath = 'data/stats.snapshot.json'
  const candidateRefs = ['origin/main', 'origin/master', 'main', 'master']

  for (const ref of candidateRefs) {
    if (await gitObjectExists(`${ref}:${snapshotPath}`)) {
      return `${ref}:${snapshotPath}`
    }
  }

  const fallbackParents = ['HEAD^', 'HEAD~1']
  for (const parent of fallbackParents) {
    if (await gitObjectExists(`${parent}:${snapshotPath}`)) {
      return `${parent}:${snapshotPath}`
    }
  }

  return undefined
}

async function gitObjectExists(revision) {
  try {
    await execFileAsync('git', ['cat-file', '-e', revision])
    return true
  } catch {
    return false
  }
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

async function loadSnapshot(source) {
  if (!source) {
    throw new Error('baseline path is required (use --baseline or STATS_BASELINE)')
  }
  if (source.includes(':') && !(await fileExists(source))) {
    const [ref, ...fileParts] = source.split(':')
    const filePath = fileParts.join(':')
    if (!filePath) {
      throw new Error(`invalid baseline reference: ${source}`)
    }
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${filePath}`])
    return JSON.parse(stdout.toString())
  }
  const resolved = path.isAbsolute(source) ? source : path.join(process.cwd(), source)
  const raw = await fs.readFile(resolved, 'utf8')
  return JSON.parse(raw)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function indexSnapshot(snapshot = {}) {
  const locales = new Map()
  for (const entry of snapshot.locales || []) {
    locales.set(entry.locale, {
      categories: new Map(Object.entries(entry.categories || {})),
      tags: new Map(Object.entries(entry.tags || {}))
    })
  }
  return locales
}

function toDiffEntries(baselineSnapshot, currentSnapshot) {
  const baseLocales = indexSnapshot(baselineSnapshot)
  const currentLocales = indexSnapshot(currentSnapshot)
  const allLocales = new Set([...baseLocales.keys(), ...currentLocales.keys()])
  const entries = []

  for (const locale of allLocales) {
    const base = baseLocales.get(locale) || { categories: new Map(), tags: new Map() }
    const curr = currentLocales.get(locale) || { categories: new Map(), tags: new Map() }
    entries.push(...diffMaps(locale, 'categories', base.categories, curr.categories))
    entries.push(...diffMaps(locale, 'tags', base.tags, curr.tags))

    const baseCategoryTotal = sumMap(base.categories)
    const currCategoryTotal = sumMap(curr.categories)
    entries.push(
      makeDiff(locale, 'categories-total', '__total__', baseCategoryTotal, currCategoryTotal)
    )

    const baseTagTotal = sumMap(base.tags)
    const currTagTotal = sumMap(curr.tags)
    entries.push(makeDiff(locale, 'tags-total', '__total__', baseTagTotal, currTagTotal))
  }

  // global totals across locales
  const globalBase = aggregateTotals(baseLocales)
  const globalCurrent = aggregateTotals(currentLocales)
  entries.push(makeDiff('all', 'categories-total', '__total__', globalBase.categories, globalCurrent.categories))
  entries.push(makeDiff('all', 'tags-total', '__total__', globalBase.tags, globalCurrent.tags))

  return entries
}

function aggregateTotals(locales) {
  let categoryTotal = 0
  let tagTotal = 0
  for (const locale of locales.values()) {
    categoryTotal += sumMap(locale.categories)
    tagTotal += sumMap(locale.tags)
  }
  return { categories: categoryTotal, tags: tagTotal }
}

function diffMaps(locale, type, baselineMap, currentMap) {
  const keys = new Set([...baselineMap.keys(), ...currentMap.keys()])
  const diffs = []
  for (const key of keys) {
    const baselineValue = baselineMap.get(key) || 0
    const currentValue = currentMap.get(key) || 0
    if (baselineValue === currentValue) continue
    diffs.push(makeDiff(locale, type, key, baselineValue, currentValue))
  }
  return diffs
}

function makeDiff(locale, type, key, baselineValue, currentValue) {
  const delta = currentValue - baselineValue
  let ratio
  if (baselineValue === 0) {
    ratio = currentValue === 0 ? 0 : Infinity
  } else {
    ratio = delta / baselineValue
  }
  return { locale, type, key, baseline: baselineValue, current: currentValue, delta, ratio }
}

function sumMap(map) {
  let total = 0
  for (const value of map.values()) {
    total += Number(value || 0)
  }
  return total
}

function classifyDiffs(entries, { warnThreshold, failThreshold, limit }) {
  const warnings = []
  const failures = []
  for (const entry of entries) {
    const absRatio = Math.abs(entry.ratio)
    if (!Number.isFinite(absRatio)) {
      failures.push({ ...entry, severity: 'fail' })
      continue
    }
    if (absRatio >= failThreshold) {
      failures.push({ ...entry, severity: 'fail' })
    } else if (absRatio >= warnThreshold) {
      warnings.push({ ...entry, severity: 'warn' })
    }
  }

  warnings.sort(byImpact)
  failures.sort(byImpact)

  return {
    warnings: warnings.slice(0, limit),
    failures: failures.slice(0, limit)
  }
}

function byImpact(a, b) {
  const ratioDiff = Math.abs(b.ratio) - Math.abs(a.ratio)
  if (ratioDiff !== 0) return ratioDiff
  return Math.abs(b.delta) - Math.abs(a.delta)
}

function formatDiff(entry) {
  const direction = entry.delta > 0 ? '+' : ''
  const ratioText = Number.isFinite(entry.ratio)
    ? `${(entry.ratio * 100).toFixed(1)}%`
    : 'new'
  return `locale=${entry.locale} type=${entry.type} key=${entry.key} delta=${direction}${entry.delta} (${entry.baseline} → ${entry.current}, ${ratioText})`
}

async function main() {
  try {
    const { baseline, current, warnThreshold, failThreshold, limit, json, quiet } = parseArgs(process.argv.slice(2))
    const resolvedBaseline = baseline || await detectDefaultBaseline()
    if (!resolvedBaseline) {
      if (!quiet) {
        console.warn('[stats-diff] baseline not provided and no default snapshot found; skipping diff')
      }
      return
    }
    const baselineSnapshot = await loadSnapshot(resolvedBaseline)
    const currentSnapshot = await loadSnapshot(current)
    const diffs = toDiffEntries(baselineSnapshot, currentSnapshot)
    const summary = classifyDiffs(diffs, { warnThreshold, failThreshold, limit })

    if (json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    } else {
      if (!quiet) {
        console.log(`[stats-diff] compared baseline=${resolvedBaseline} current=${current}`)
        console.log(`[stats-diff] thresholds warn=${warnThreshold} fail=${failThreshold}`)
      }
      for (const failure of summary.failures) {
        console.error(`[stats-diff] ❌ ${formatDiff(failure)}`)
      }
      for (const warning of summary.warnings) {
        console.warn(`[stats-diff] ⚠ ${formatDiff(warning)}`)
      }
      if (!summary.failures.length && !summary.warnings.length && !quiet) {
        console.log('[stats-diff] no significant changes detected')
      }
    }

    if (summary.failures.length) {
      process.exitCode = 2
    } else if (summary.warnings.length) {
      process.exitCode = 0
    }
  } catch (error) {
    console.error('[stats-diff] failed:', error)
    process.exitCode = 1
  }
}

const executedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (executedDirectly) {
  main()
}

export const __test__ = {
  parseArgs,
  detectDefaultBaseline,
  gitObjectExists,
  loadSnapshot,
  toDiffEntries,
  classifyDiffs,
  formatDiff,
  makeDiff,
  parseNumber
}
