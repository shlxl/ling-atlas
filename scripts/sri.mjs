import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SECURITY_DIR = path.join(ROOT, 'security')
const ALLOWLIST_PATH = path.join(SECURITY_DIR, 'sri-allowlist.json')
const DOCS = path.join(ROOT, 'docs')
const PUBLIC = path.join(DOCS, 'public')
const DIST = path.join(DOCS, '.vitepress', 'dist')
const WELL_KNOWN = path.join(PUBLIC, '.well-known')
const MANIFEST_PATH = path.join(WELL_KNOWN, 'sri-manifest.json')

async function readAllowlist() {
  const raw = await fs.readFile(ALLOWLIST_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('SRI allowlist is empty. Please add at least one entry.')
  }
  return parsed
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

function hashBuffer(buffer) {
  return crypto.createHash('sha384').update(buffer).digest('base64')
}

function isNetworkError(error) {
  if (!error) return false
  const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT'])
  if (typeof error.code === 'string' && networkCodes.has(error.code)) {
    return true
  }
  if (error instanceof TypeError && typeof error.message === 'string' && error.message.includes('fetch failed')) {
    return true
  }
  if (error.cause) {
    return isNetworkError(error.cause)
  }
  if (Array.isArray(error.errors)) {
    return error.errors.some(isNetworkError)
  }
  return false
}

async function fetchResource(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    referrerPolicy: 'no-referrer'
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status} ${response.statusText})`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function buildManifest() {
  const allowlist = await readAllowlist()
  const manifest = []
  const degraded = []
  for (const entry of allowlist) {
    const url = entry?.url
    const expected = entry?.integrity
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid entry in SRI allowlist. "url" is required.')
    }
    if (!expected || typeof expected !== 'string') {
      throw new Error(`Missing integrity for ${url}. Update security/sri-allowlist.json.`)
    }
    try {
      const buffer = await fetchResource(url)
      const computed = `sha384-${hashBuffer(buffer)}`
      if (computed !== expected) {
        throw new Error(
          `SRI mismatch for ${url}\n  expected: ${expected}\n  computed: ${computed}\n` +
          'Update security/sri-allowlist.json with the new hash after validating the change.'
        )
      }
      manifest.push({ url, integrity: expected })
    } catch (error) {
      if (isNetworkError(error)) {
        degraded.push({ url, reason: error })
        console.warn(`[security] network error while fetching ${url}:`, error)
        console.warn('[security] reused allowlist integrity. Restore network and rerun build:search to verify hashes.')
        manifest.push({ url, integrity: expected })
        continue
      }
      throw error
    }
  }
  return { manifest, degraded }
}

function normalizeManifest(list) {
  return (list || []).map(item => ({ url: item.url, integrity: item.integrity })).sort((a, b) => a.url.localeCompare(b.url))
}

function diffManifest(previous, next) {
  const prevMap = new Map(previous.map(item => [item.url, item.integrity]))
  const nextMap = new Map(next.map(item => [item.url, item.integrity]))
  const changes = []

  for (const [url, integrity] of nextMap.entries()) {
    if (!prevMap.has(url)) {
      changes.push({ type: 'added', url, integrity })
    } else if (prevMap.get(url) !== integrity) {
      changes.push({ type: 'changed', url, from: prevMap.get(url), to: integrity })
    }
  }

  for (const [url, integrity] of prevMap.entries()) {
    if (!nextMap.has(url)) {
      changes.push({ type: 'removed', url, integrity })
    }
  }

  return changes
}

async function loadPreviousManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function mirrorManifest() {
  const distWellKnown = path.join(DIST, '.well-known')
  await ensureDir(distWellKnown)
  await fs.copyFile(MANIFEST_PATH, path.join(distWellKnown, path.basename(MANIFEST_PATH)))
}

async function main() {
  await ensureDir(WELL_KNOWN)
  const { manifest, degraded } = await buildManifest()
  const normalized = normalizeManifest(manifest)
  const previousRaw = await loadPreviousManifest()
  const previous = normalizeManifest(previousRaw || [])
  const changes = diffManifest(previous, normalized)

  if (previousRaw && changes.length && process.env.SRI_ALLOW_UPDATE !== 'true') {
    console.error('[security] SRI manifest change detected:')
    for (const change of changes) {
      if (change.type === 'added') {
        console.error(`  + ${change.url} :: ${change.integrity}`)
      } else if (change.type === 'removed') {
        console.error(`  - ${change.url} :: ${change.integrity}`)
      } else {
        console.error(`  * ${change.url}\n    from: ${change.from}\n    to:   ${change.to}`)
      }
    }
    console.error('[security] SRI validation failed. Verify external resource changes and update security/sri-allowlist.json / .well-known manifest as needed.')
    process.exitCode = 1
    return
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  await mirrorManifest()
  console.log('[security] SRI manifest entries:')
  for (const item of normalized) {
    console.log(`  - ${item.url} :: ${item.integrity}`)
  }
  if (degraded.length) {
    console.warn('[security] SRI validation degraded due to network errors:')
    for (const item of degraded) {
      console.warn(`  - ${item.url}`)
    }
    console.warn('[security] 请在网络恢复后重新执行 npm run build:search，确认外部资源哈希未发生变化。')
  }
}

main().catch((error) => {
  console.error('[security] SRI generation failed:', error)
  process.exitCode = 1
})
