import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const DEFAULT_LIMIT = 100
const METRICS_ENV = 'GRAPHRAG_TELEMETRY_PATH'

function resolveMetricsPath() {
  const override = process.env[METRICS_ENV]
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(ROOT, override)
  }
  return path.join(ROOT, 'data', 'graphrag-metrics.json')
}

export function getGraphragMetricsPath() {
  return resolveMetricsPath()
}

export async function appendGraphragMetric(record, { limit = DEFAULT_LIMIT } = {}) {
  if (!record || typeof record !== 'object') return null

  const payload = {
    ...record,
    timestamp: record.timestamp ?? new Date().toISOString()
  }

  const metricsPath = resolveMetricsPath()
  let entries = []
  try {
    const raw = await fs.readFile(metricsPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      entries = parsed
    }
  } catch (error) {
    if (!error || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
      throw error
    }
  }

  entries.unshift(payload)

  const max = Number.isFinite(limit) && limit > 0 ? limit : entries.length
  if (entries.length > max) {
    entries = entries.slice(0, max)
  }

  await fs.mkdir(path.dirname(metricsPath), { recursive: true })
  await fs.writeFile(metricsPath, JSON.stringify(entries, null, 2), 'utf8')

  return payload
}

export async function readGraphragMetrics() {
  const metricsPath = resolveMetricsPath()
  try {
    const raw = await fs.readFile(metricsPath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return []
    }
    throw error
  }
}
