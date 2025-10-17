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

const NETWORK_ERROR_CODES = new Set([
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EAI_FAIL',
  'ENOTFOUND',
  'ETIMEDOUT'
])

function isNetworkError(error) {
  if (!error || typeof error !== 'object') return false
  if (NETWORK_ERROR_CODES.has(error.code)) return true
  if (Array.isArray(error.errors)) {
    return error.errors.some(isNetworkError)
  }
  if (error.cause && error.cause !== error) {
    return isNetworkError(error.cause)
  }
  return false
}

async function fetchResource(url) {
  try {
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
  } catch (error) {
    if (isNetworkError(error) || isNetworkError(error?.cause)) {
      const offlineError = new Error(`Network request failed for ${url}`)
      offlineError.cause = error
      offlineError.code = 'OFFLINE'
      throw offlineError
    }
    throw error
  }
}

async function buildManifest() {
  const allowlist = await readAllowlist()
  const manifest = []
  const offline = []
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
    } catch (error) {
      if (error?.code === 'OFFLINE') {
        offline.push({ url, error })
      } else {
        throw error
      }
    }
    manifest.push({ url, integrity: expected })
  }
  return { manifest, offline }
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
  const { manifest, offline } = await buildManifest()
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
  if (offline.length) {
    console.warn('[security] SRI verification skipped for the following resources due to network issues:')
    for (const item of offline) {
      const reason = item.error?.cause?.message || item.error?.message || 'Unknown error'
      console.warn(`  - ${item.url} :: ${reason}`)
    }
    console.warn('[security] 请在网络恢复后重新运行 node scripts/sri.mjs 以完成完整校验。')
  }
}

main().catch((error) => {
  console.error('[security] SRI generation failed:', error)
  process.exitCode = 1
})
