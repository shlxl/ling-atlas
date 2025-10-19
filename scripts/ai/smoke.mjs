import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { readJSONIfExists, logStructured } from './utils.mjs'

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

function nowISO() {
  return new Date().toISOString()
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

function resolveRuntime(argValue, manifest) {
  const runtime = (argValue || process.env.AI_RUNTIME || manifest?.runtime || 'placeholder').toLowerCase()
  if (!runtime) return 'placeholder'
  return runtime
}

function interpretDirectory(input) {
  if (!input) return null
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2))
  }
  if (input.startsWith('./')) {
    return path.join(ROOT, input.slice(2))
  }
  if (path.isAbsolute(input)) {
    return input
  }
  return path.join(ROOT, input)
}

function resolveCacheBase(manifest, args) {
  const customDir = args['cache-dir'] || process.env.AI_MODELS_DIR
  if (customDir) {
    return path.isAbsolute(customDir) ? customDir : path.resolve(ROOT, customDir)
  }
  const scope = (process.env.AI_MODELS_SCOPE || args.cache || manifest?.cache?.preferred || 'local').toLowerCase()
  if (scope === 'global') {
    return DEFAULT_CACHE_DIRECTORIES.global
  }
  const manifestDir = interpretDirectory(manifest?.cache?.directory)
  if (manifestDir) {
    return manifestDir
  }
  return DEFAULT_CACHE_DIRECTORIES.local
}

function resolveArtifactPath(baseDir, relativePath) {
  const segments = String(relativePath || '')
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
  return path.join(baseDir, ...segments)
}

async function runLinearSmokeTest(model, artifactPath) {
  const smoke = model.smokeTest
  if (!Array.isArray(smoke?.expected) || !Array.isArray(smoke?.input)) {
    throw new Error('Linear smoke test requires "input" and "expected" arrays')
  }
  const tolerance = typeof smoke.tolerance === 'number' ? smoke.tolerance : 1e-4
  const raw = await fs.readFile(artifactPath, 'utf8')
  const payload = JSON.parse(raw)
  const bias = Array.isArray(payload.bias) ? payload.bias : []
  const weights = Array.isArray(payload.weights) ? payload.weights : []
  const output = []

  for (let index = 0; index < smoke.expected.length; index += 1) {
    let sum = typeof bias[index] === 'number' ? bias[index] : 0
    for (let feature = 0; feature < smoke.input.length; feature += 1) {
      const row = Array.isArray(weights[feature]) ? weights[feature] : []
      const weight = typeof row[index] === 'number' ? row[index] : 0
      sum += weight * smoke.input[feature]
    }
    output.push(sum)
  }

  output.forEach((value, index) => {
    const expected = smoke.expected[index]
    if (typeof expected !== 'number') {
      throw new Error(`Expected value at index ${index} is not a number`)
    }
    const diff = Math.abs(value - expected)
    if (diff > tolerance) {
      throw new Error(
        `Linear smoke mismatch at index ${index}: expected ${expected}, received ${value}, tolerance ${tolerance}`
      )
    }
  })

  return { output }
}

async function main() {
  const args = parseArgs()
  const manifest = await readJSONIfExists(MANIFEST_PATH)
  if (!manifest) {
    throw new Error('Model manifest is missing. Run "npm run ai:prepare" first.')
  }

  const runtime = resolveRuntime(args.runtime, manifest)
  const baseDir = resolveCacheBase(manifest, args)
  const models = Array.isArray(manifest.models) ? manifest.models : []
  const updatedManifest = clone(manifest)
  const updatedModels = []

  if (runtime === 'placeholder' || runtime === 'none') {
    const reason = 'Runtime set to placeholder; skipping inference checks.'
    for (const model of models) {
      const entry = clone(model)
      entry.smoke = {
        status: 'skipped',
        reason,
        verifiedAt: null
      }
      updatedModels.push(entry)
    }

    updatedManifest.models = updatedModels
    updatedManifest.smoke = {
      status: 'skipped',
      runtime,
      executed: 0,
      skipped: models.length,
      failed: 0,
      verifiedAt: nowISO(),
      reason
    }

    await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8')

    logStructured('ai.models.smoke.skipped', {
      runtime,
      reason
    })
    return
  }

  let executed = 0
  let skipped = 0
  let failed = 0
  const failedIds = []
  const failureDetails = []

  logStructured('ai.models.smoke.start', {
    runtime,
    directory: baseDir
  })

  for (const model of models) {
    const entry = clone(model)
    const supportedRuntimes = Array.isArray(model.runtime) ? model.runtime : []
    if (!supportedRuntimes.includes(runtime)) {
      skipped += 1
      const reason = `runtime ${runtime} unsupported`
      entry.smoke = {
        status: 'skipped',
        reason,
        verifiedAt: null
      }
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'skipped',
        reason
      })
      continue
    }

    if (model.disableEnv && isTruthy(process.env[model.disableEnv])) {
      skipped += 1
      const reason = `disabled via ${model.disableEnv}`
      entry.smoke = {
        status: 'skipped',
        reason,
        verifiedAt: null
      }
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'skipped',
        reason
      })
      continue
    }

    if (model.cache?.status !== 'ready') {
      skipped += 1
      const reason = `cache status ${model.cache?.status ?? 'unknown'}`
      entry.smoke = {
        status: 'skipped',
        reason,
        verifiedAt: null
      }
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'skipped',
        reason
      })
      continue
    }

    if (!model.smokeTest) {
      skipped += 1
      const reason = 'smokeTest definition missing'
      entry.smoke = {
        status: 'skipped',
        reason,
        verifiedAt: null
      }
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'skipped',
        reason
      })
      continue
    }

    const relativePath = model.cache?.location?.relativePath
    if (!relativePath) {
      failed += 1
      failedIds.push(model.id)
      const reason = 'cache location missing'
      entry.smoke = {
        status: 'failed',
        reason,
        verifiedAt: nowISO()
      }
      failureDetails.push({ id: model.id, reason })
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'failed',
        reason
      })
      continue
    }

    const artifactPath = resolveArtifactPath(baseDir, relativePath)
    try {
      switch (model.smokeTest.type) {
        case 'linear':
          await runLinearSmokeTest(model, artifactPath)
          break
        default:
          throw new Error(`Unsupported smoke test type "${model.smokeTest.type}"`)
      }
      executed += 1
      entry.smoke = {
        status: 'passed',
        reason: null,
        verifiedAt: nowISO()
      }
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'passed',
        path: relativePath
      })
    } catch (error) {
      failed += 1
      failedIds.push(model.id)
      const reason = error?.message || String(error)
      entry.smoke = {
        status: 'failed',
        reason,
        verifiedAt: nowISO()
      }
      failureDetails.push({ id: model.id, reason })
      updatedModels.push(entry)
      logStructured('ai.models.smoke.model', {
        id: model.id,
        status: 'failed',
        reason
      })
    }
  }

  updatedManifest.models = updatedModels

  logStructured('ai.models.smoke.complete', {
    runtime,
    executed,
    skipped,
    failed
  })

  const summary = {
    status: failed > 0 ? 'failed' : 'passed',
    runtime,
    executed,
    skipped,
    failed,
    verifiedAt: nowISO(),
    failures: failureDetails
  }

  updatedManifest.smoke = summary

  if (failed > 0 && runtime !== 'placeholder' && runtime !== 'none') {
    const fallbackInfo = {
      activatedAt: nowISO(),
      fromRuntime: runtime,
      reason: 'smoke-failed',
      failedModels: failureDetails
    }
    updatedManifest.fallback = fallbackInfo
    updatedManifest.runtime = 'placeholder'
    logStructured('ai.models.smoke.rollback', {
      ...fallbackInfo,
      manifest: path.relative(ROOT, MANIFEST_PATH)
    })
  } else if (failed === 0 && updatedManifest?.fallback?.reason === 'smoke-failed') {
    updatedManifest.fallback = null
  }

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8')

  if (failed > 0) {
    throw new Error(`Smoke tests failed for: ${failedIds.join(', ')}`)
  }
}

main().catch(error => {
  logStructured('ai.models.smoke.failed', {
    message: error?.message || String(error)
  })
  process.exit(1)
})
