import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

function resolveAIEventsDir() {
  const override = process.env.AI_TELEMETRY_PATH
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(ROOT, override)
  }
  return path.join(ROOT, 'data', 'ai-events')
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

export async function readJSONIfExists(file) {
  try {
    const content = await fs.readFile(file, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null
    }
    throw error
  }
}

export function resolveAdapterSpec({ envKey, cliFlag, argv = process.argv, fallback = undefined }) {
  const args = Array.isArray(argv) ? argv.slice(2) : []
  const withValuePrefix = `--${cliFlag}=`
  const prefixed = args.find(arg => arg.startsWith(withValuePrefix))
  if (prefixed) {
    const value = prefixed.slice(withValuePrefix.length)
    if (value) return value
  }

  const flagIndex = args.indexOf(`--${cliFlag}`)
  if (flagIndex !== -1 && typeof args[flagIndex + 1] === 'string') {
    return args[flagIndex + 1]
  }

  if (envKey && process.env[envKey]) {
    return process.env[envKey]
  }

  return fallback
}

export function logStructured(event, details = {}, logger = console) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...details
  }
  const message = JSON.stringify(payload)
  logger?.log?.(message)
  return payload
}

export function getAIEventsDirectory() {
  return resolveAIEventsDir()
}

export async function flushAIEvents(domain, events = [], logger = console) {
  if (!domain || !Array.isArray(events) || events.length === 0) {
    return null
  }

  const disabledFlag = String(process.env.AI_TELEMETRY_DISABLE || '').toLowerCase()
  if (disabledFlag === '1' || disabledFlag === 'true') {
    logStructured(
      `ai.${domain}.events.skipped`,
      { reason: 'AI telemetry disabled via AI_TELEMETRY_DISABLE' },
      logger
    )
    return null
  }

  const dir = resolveAIEventsDir()
  await ensureDir(dir)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${domain}-${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`
  const filePath = path.join(dir, fileName)
  const payload = { domain, events }

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')

  logStructured(
    `ai.${domain}.events.flushed`,
    { file: filePath, count: events.length },
    logger
  )

  return filePath
}

export function isDraft(frontmatter) {
  const { status, draft } = frontmatter || {}
  if (typeof draft === 'boolean') return draft
  if (typeof status === 'string') return status.toLowerCase() === 'draft'
  return false
}

export function toPlainText(markdown) {
  return markdown
    .replace(/^>\s+/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_~#>]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getFirstParagraph(content) {
  const normalized = content.trim()
  if (!normalized) return ''
  const segments = normalized.split(/\r?\n\r?\n/)
  const firstBlock = segments.find(block => block.trim().length > 0) || ''
  return toPlainText(firstBlock)
}
