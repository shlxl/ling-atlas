import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const EVENTS_DIR = path.join(ROOT, 'data', 'ai-events')

function nowISO() {
  return new Date().toISOString()
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true })
}

export function createAiEventRecorder({ script, namespace }) {
  if (!script) throw new Error('script is required for AI event recorder')
  if (!namespace) throw new Error('namespace is required for AI event recorder')
  const runId = randomUUID()
  const events = []
  const startedAt = nowISO()

  function record(event, payload = {}) {
    events.push({
      event,
      namespace,
      script,
      runId,
      timestamp: nowISO(),
      ...payload
    })
  }

  async function flush() {
    if (!events.length) return null
    const fileName = `${Date.now()}-${runId}.json`
    const target = path.join(EVENTS_DIR, fileName)
    try {
      await ensureDir(EVENTS_DIR)
      await fs.writeFile(target, JSON.stringify({
        script,
        namespace,
        runId,
        startedAt,
        events
      }, null, 2), 'utf8')
      return target
    } catch (error) {
      console.warn('[ai-events] failed to persist telemetry:', error?.message || error)
      return null
    }
  }

  return { record, flush, runId, startedAt }
}
