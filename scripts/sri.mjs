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
  for (const entry of allowlist) {
    const url = entry?.url
    const expected = entry?.integrity
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid entry in SRI allowlist. "url" is required.')
    }
    if (!expected || typeof expected !== 'string') {
      throw new Error(`Missing integrity for ${url}. Update security/sri-allowlist.json.`)
    }
    const buffer = await fetchResource(url)
    const computed = `sha384-${hashBuffer(buffer)}`
    if (computed !== expected) {
      throw new Error(
        `SRI mismatch for ${url}\n  expected: ${expected}\n  computed: ${computed}\n` +
        'Update security/sri-allowlist.json with the new hash after validating the change.'
      )
    }
    manifest.push({ url, integrity: expected })
  }
  return manifest
}

async function mirrorManifest() {
  const distWellKnown = path.join(DIST, '.well-known')
  await ensureDir(distWellKnown)
  await fs.copyFile(MANIFEST_PATH, path.join(distWellKnown, path.basename(MANIFEST_PATH)))
}

async function main() {
  await ensureDir(WELL_KNOWN)
  const manifest = await buildManifest()
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  await mirrorManifest()
  console.log('[security] SRI manifest entries:')
  for (const item of manifest) {
    console.log(`  - ${item.url} :: ${item.integrity}`)
  }
}

main().catch((error) => {
  console.error('[security] SRI generation failed:', error)
  process.exitCode = 1
})
