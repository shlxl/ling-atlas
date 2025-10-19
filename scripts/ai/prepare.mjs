import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ensureDir, readJSONIfExists, logStructured } from './utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const MANIFEST_PATH = path.join(ROOT, 'data', 'models.json')
const DEFAULT_CACHE_DIRECTORIES = {
  local: path.join(ROOT, 'data', 'models'),
  global: path.join(os.homedir(), '.cache', 'ling-atlas', 'models')
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

function parseArgs(argv = process.argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : []
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) continue
    const sliced = arg.slice(2)
    if (!sliced) continue
    const [key, inlineValue] = sliced.split('=')
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue
      continue
    }
    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      parsed[key] = next
      index += 1
    } else {
      parsed[key] = true
    }
  }
  return parsed
}

function isTruthy(value) {
  if (value === true) return true
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
  }
  return false
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function fileSha256(file) {
  const buffer = await fs.readFile(file)
  return sha256(buffer)
}

async function fileExists(target) {
  try {
    await fs.access(target)
    return true
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false
    }
    throw error
  }
}

function resolveRuntime(argValue, manifest) {
  const runtime = (argValue || process.env.AI_RUNTIME || manifest?.runtime || 'placeholder').toLowerCase()
  if (!runtime) return 'placeholder'
  return runtime
}

function resolveScope(args, manifest) {
  const override = process.env.AI_MODELS_SCOPE || args.cache || manifest?.cache?.preferred
  if (!override) return 'local'
  return String(override).toLowerCase()
}

function resolveCustomDirectory(args) {
  const override = args['cache-dir'] || process.env.AI_MODELS_DIR
  if (!override) return null
  return path.isAbsolute(override) ? override : path.resolve(ROOT, override)
}

function resolveCacheDirectory(scope, customDirectory) {
  if (customDirectory) return customDirectory
  if (scope === 'global') return DEFAULT_CACHE_DIRECTORIES.global
  return DEFAULT_CACHE_DIRECTORIES.local
}

function formatDirectoryForManifest(scope, absoluteDirectory, customDirectory) {
  if (customDirectory) return absoluteDirectory
  if (scope === 'global') return '~/.cache/ling-atlas/models'
  return './data/models'
}

function toPosixRelative(modelId, filename) {
  return path.posix.join(modelId, filename.replace(/\\/g, '/'))
}

async function resolveArtifactBuffer(artifact, model) {
  if (!artifact) {
    return { buffer: null, origin: 'none' }
  }
  const encoding = artifact.encoding || 'utf8'
  switch (artifact.type) {
    case 'json': {
      const json = JSON.stringify(artifact.content ?? {}, null, 2)
      return { buffer: Buffer.from(json, encoding), origin: 'inline-json' }
    }
    case 'text': {
      return { buffer: Buffer.from(String(artifact.content ?? ''), encoding), origin: 'inline-text' }
    }
    case 'base64': {
      return { buffer: Buffer.from(String(artifact.content ?? ''), 'base64'), origin: 'inline-base64' }
    }
    case 'binary': {
      if (!artifact.path) {
        throw new Error(`Artifact for model ${model?.id ?? 'unknown'} is missing "path" property`)
      }
      const filePath = path.isAbsolute(artifact.path)
        ? artifact.path
        : path.resolve(ROOT, artifact.path)
      const buffer = await fs.readFile(filePath)
      return { buffer, origin: 'file' }
    }
    case 'remote': {
      if (!artifact.url) {
        throw new Error(`Artifact for model ${model?.id ?? 'unknown'} is missing "url" property`)
      }
      const response = await fetch(artifact.url)
      if (!response.ok) {
        throw new Error(`Failed to download ${artifact.url}: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return { buffer: Buffer.from(arrayBuffer), origin: 'remote' }
    }
    case 'noop':
      return { buffer: null, origin: 'noop' }
    default:
      throw new Error(`Unsupported artifact type "${artifact.type}" for model ${model?.id ?? 'unknown'}`)
  }
}

function shouldClean(args) {
  if (isTruthy(args.clean)) return true
  if (isTruthy(process.env.AI_MODELS_CLEAN)) return true
  return false
}

function createEmptyManifest() {
  return {
    version: 1,
    generatedAt: null,
    runtime: 'placeholder',
    cache: {
      preferred: 'local',
      directory: './data/models'
    },
    models: []
  }
}

async function cleanCache(cacheDir, preparedModels) {
  const keepIds = new Set()
  const expectedFiles = new Map()

  for (const model of preparedModels) {
    if (!model.cache?.location?.relativePath) continue
    const modelId = model.id
    const dir = path.join(cacheDir, modelId)
    keepIds.add(modelId)
    if (!expectedFiles.has(dir)) {
      expectedFiles.set(dir, new Set())
    }
    const fileSet = expectedFiles.get(dir)
    const filename = path.basename(model.cache.location.relativePath)
    fileSet.add(filename)
  }

  const entries = await fs.readdir(cacheDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const entryPath = path.join(cacheDir, entry.name)
    if (entry.isDirectory()) {
      if (!keepIds.has(entry.name)) {
        await fs.rm(entryPath, { recursive: true, force: true })
        logStructured('ai.models.prepare.clean', { removed: entryPath, reason: 'stale-model' })
        continue
      }
      const expected = expectedFiles.get(entryPath) || new Set()
      const childEntries = await fs.readdir(entryPath, { withFileTypes: true })
      for (const child of childEntries) {
        if (!expected.has(child.name)) {
          await fs.rm(path.join(entryPath, child.name), { recursive: true, force: true })
          logStructured('ai.models.prepare.clean', { removed: path.join(entryPath, child.name), reason: 'stale-artifact' })
        }
      }
    } else {
      await fs.rm(entryPath, { force: true })
      logStructured('ai.models.prepare.clean', { removed: entryPath, reason: 'unexpected-file' })
    }
  }
}

async function main() {
  const args = parseArgs()
  const manifest = (await readJSONIfExists(MANIFEST_PATH)) ?? createEmptyManifest()
  const runtime = resolveRuntime(args.runtime, manifest)
  const scope = resolveScope(args, manifest)
  const customDirectory = resolveCustomDirectory(args)
  const cacheDir = resolveCacheDirectory(scope, customDirectory)
  const clean = shouldClean(args)

  await ensureDir(cacheDir)

  const updatedManifest = clone(manifest)
  updatedManifest.runtime = runtime
  updatedManifest.generatedAt = new Date().toISOString()
  updatedManifest.cache = {
    preferred: customDirectory ? 'custom' : scope,
    directory: formatDirectoryForManifest(scope, cacheDir, customDirectory)
  }

  const preparedModels = []
  let readyCount = 0
  let skippedCount = 0
  let failureCount = 0

  logStructured('ai.models.prepare.start', {
    runtime,
    scope: updatedManifest.cache.preferred,
    directory: updatedManifest.cache.directory
  })

  for (const model of manifest.models ?? []) {
    const entry = clone(model)
    entry.cache = entry.cache ?? {}
    entry.cache.location = entry.cache.location ?? {}
    const supportedRuntimes = Array.isArray(model.runtime) ? model.runtime : []
    if (!supportedRuntimes.includes(runtime)) {
      entry.cache.status = 'skipped'
      entry.cache.reason = `runtime ${runtime} unsupported`
      entry.cache.verifiedAt = null
      preparedModels.push(entry)
      skippedCount += 1
      logStructured('ai.models.prepare.model', {
        id: model.id,
        status: 'skipped',
        reason: entry.cache.reason
      })
      continue
    }

    if (model.disableEnv && isTruthy(process.env[model.disableEnv])) {
      entry.cache.status = 'disabled'
      entry.cache.reason = `disabled via ${model.disableEnv}`
      entry.cache.verifiedAt = null
      preparedModels.push(entry)
      skippedCount += 1
      logStructured('ai.models.prepare.model', {
        id: model.id,
        status: 'skipped',
        reason: entry.cache.reason
      })
      continue
    }

    const artifact = model.artifact
    if (!artifact?.filename) {
      entry.cache.status = 'error'
      entry.cache.reason = 'artifact.filename missing'
      entry.cache.verifiedAt = new Date().toISOString()
      entry.cache.bytes = 0
      entry.cache.checksum = null
      entry.cache.location.scope = customDirectory ? 'custom' : scope
      entry.cache.location.relativePath = null
      preparedModels.push(entry)
      failureCount += 1
      logStructured('ai.models.prepare.model', {
        id: model.id,
        status: 'error',
        reason: entry.cache.reason
      })
      continue
    }

    const relativePath = toPosixRelative(model.id, artifact.filename)
    const modelDir = path.join(cacheDir, model.id)
    const targetFile = path.join(modelDir, artifact.filename)
    entry.cache.location.scope = customDirectory ? 'custom' : scope
    entry.cache.location.relativePath = relativePath

    try {
      await ensureDir(modelDir)
      const { buffer } = await resolveArtifactBuffer(artifact, model)

      if (buffer) {
        let shouldWrite = true
        if (await fileExists(targetFile)) {
          const existingHash = await fileSha256(targetFile)
          if (model.checksum?.value && existingHash === model.checksum.value) {
            shouldWrite = false
          }
        }
        if (shouldWrite) {
          await fs.writeFile(targetFile, buffer)
        }
      } else if (!(await fileExists(targetFile))) {
        throw new Error('Artifact buffer missing and file not found on disk')
      }

      const stats = await fs.stat(targetFile)
      const actualHash = await fileSha256(targetFile)
      if (model.checksum?.value && actualHash !== model.checksum.value) {
        throw new Error(
          `Checksum mismatch for ${model.id}. Expected ${model.checksum.value}, received ${actualHash}`
        )
      }

      entry.cache.status = 'ready'
      entry.cache.reason = null
      entry.cache.bytes = stats.size
      entry.cache.checksum = actualHash
      entry.cache.verifiedAt = new Date().toISOString()
      preparedModels.push(entry)
      readyCount += 1
      logStructured('ai.models.prepare.model', {
        id: model.id,
        status: 'ready',
        size: stats.size,
        checksum: actualHash,
        path: relativePath
      })
    } catch (error) {
      entry.cache.status = 'error'
      entry.cache.reason = error?.message || String(error)
      entry.cache.bytes = 0
      entry.cache.checksum = null
      entry.cache.verifiedAt = new Date().toISOString()
      preparedModels.push(entry)
      failureCount += 1
      logStructured('ai.models.prepare.model', {
        id: model.id,
        status: 'error',
        reason: entry.cache.reason
      })
    }
  }

  updatedManifest.models = preparedModels

  if (clean) {
    await cleanCache(cacheDir, preparedModels)
  }

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8')

  logStructured('ai.models.prepare.complete', {
    runtime,
    ready: readyCount,
    skipped: skippedCount,
    failed: failureCount,
    manifest: path.relative(ROOT, MANIFEST_PATH)
  })

  if (failureCount > 0) {
    throw new Error(`Failed to prepare ${failureCount} model(s).`)
  }
}

main().catch(error => {
  logStructured('ai.models.prepare.failed', {
    message: error?.message || String(error)
  })
  process.exit(1)
})
