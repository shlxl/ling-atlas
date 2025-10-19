import fs from 'node:fs/promises'

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
