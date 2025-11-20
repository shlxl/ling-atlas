import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import {
  DIST_DATA_DIR,
  DIST_GRAPHRAG_DIR,
  DIST_I18N_DIR,
  DIST_NAV_DIR,
  DIST_SEARCH_DIR,
  DIST_TELEMETRY_DIR,
  DOCS_DIR,
  ROOT_DIR,
  DATA_DIR
} from '@ling-atlas/shared/paths'
import { validateManifest } from '@ling-atlas/shared/contracts/manifest'
import { globby } from 'globby'

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true })
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function copyIfExists(from, to) {
  if (!(await pathExists(from))) return false
  await ensureDir(path.dirname(to))
  await fs.copyFile(from, to)
  return true
}

function checksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function checksumWithFallback(filePath) {
  try {
    return await checksum(filePath)
  } catch {
    return undefined
  }
}

async function statSize(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.size
  } catch {
    return undefined
  }
}

function resolveCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR }).toString().trim()
  } catch {
    return 'unknown'
  }
}

async function collectNavArtifacts() {
  const navSources = await globby('nav.manifest.*.json', { cwd: path.join(DOCS_DIR, 'public') })
  const entries = []
  for (const file of navSources) {
    const source = path.join(DOCS_DIR, 'public', file)
    const target = path.join(DIST_NAV_DIR, file)
    await ensureDir(DIST_NAV_DIR)
    await fs.copyFile(source, target)
    entries.push({
      kind: 'nav',
      locale: file.split('.').at(-2),
      path: path.relative(ROOT_DIR, target),
      checksum: await checksumWithFallback(target),
      size: await statSize(target)
    })
  }
  return entries
}

async function collectI18nArtifact() {
  const source = path.join(DOCS_DIR, 'public', 'i18n-map.json')
  const target = path.join(DIST_I18N_DIR, 'i18n-map.json')
  const exists = await copyIfExists(source, target)
  if (!exists) return null
  return {
    kind: 'i18n-map',
    path: path.relative(ROOT_DIR, target),
    checksum: await checksumWithFallback(target),
    size: await statSize(target)
  }
}

async function collectTelemetryArtifact() {
  const source = path.join(DOCS_DIR, 'public', 'telemetry.json')
  const target = path.join(DIST_TELEMETRY_DIR, 'telemetry.json')
  const exists = await copyIfExists(source, target)
  if (!exists) return null
  return {
    kind: 'telemetry',
    path: path.relative(ROOT_DIR, target),
    checksum: await checksumWithFallback(target),
    size: await statSize(target)
  }
}

async function collectSearchArtifacts() {
  const source = path.join(DOCS_DIR, 'public', 'api', 'knowledge.json')
  const target = path.join(DIST_SEARCH_DIR, 'knowledge.json')
  const exists = await copyIfExists(source, target)
  if (!exists) return []
  return [
    {
      kind: 'knowledge',
      path: path.relative(ROOT_DIR, target),
      checksum: await checksumWithFallback(target),
      size: await statSize(target)
    }
  ]
}

async function collectGraphArtifacts() {
  if (!(await pathExists(path.join(DATA_DIR, 'graphrag')))) return []
  await ensureDir(DIST_GRAPHRAG_DIR)
  await fs.cp(path.join(DATA_DIR, 'graphrag'), DIST_GRAPHRAG_DIR, { recursive: true, force: true })
  const files = await globby('**/*.json', { cwd: DIST_GRAPHRAG_DIR })
  const entries = []
  for (const file of files) {
    const target = path.join(DIST_GRAPHRAG_DIR, file)
    entries.push({
      kind: 'graphrag',
      path: path.relative(ROOT_DIR, target),
      checksum: await checksumWithFallback(target),
      size: await statSize(target)
    })
  }
  return entries
}

async function writeManifest(artifacts, warnings) {
  await ensureDir(DIST_DATA_DIR)
  const manifest = {
    version: process.env.BACKEND_MANIFEST_VERSION || '0.1.0',
    sourceCommit: process.env.BACKEND_SOURCE_COMMIT || resolveCommit(),
    generatedAt: new Date().toISOString(),
    warnings,
    artifacts
  }

  if (!validateManifest(manifest)) {
    const details = JSON.stringify(validateManifest.errors, null, 2)
    throw new Error(`[artifacts] manifest validation failed: ${details}`)
  }

  const target = path.join(DIST_DATA_DIR, 'manifest.json')
  await fs.writeFile(target, JSON.stringify(manifest, null, 2), 'utf8')
  return path.relative(ROOT_DIR, target)
}

async function main() {
  const warnings = []
  const nav = await collectNavArtifacts()
  const i18n = await collectI18nArtifact()
  const telemetry = await collectTelemetryArtifact()
  const search = await collectSearchArtifacts()
  const graphrag = await collectGraphArtifacts()

  if (!i18n) warnings.push('i18n-map missing from docs/public')
  if (!telemetry) warnings.push('telemetry.json missing from docs/public')
  if (nav.length === 0) warnings.push('nav manifest missing from docs/public')

  const manifestPath = await writeManifest(
    {
      nav,
      i18n,
      telemetry,
      search,
      graphrag
    },
    warnings
  )

  console.log(`[artifacts] manifest written to ${manifestPath}`)
}

if (import.meta.main) {
  main().catch(error => {
    console.error('[artifacts] failed:', error)
    process.exitCode = 1
  })
}

export { main as syncArtifacts }
