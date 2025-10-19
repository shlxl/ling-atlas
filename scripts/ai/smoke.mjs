#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')

function parseArgs(argv) {
  const args = [...argv]
  let configPath = path.join(ROOT, 'data', 'models.json')
  const configIndex = args.indexOf('--config')
  if (configIndex !== -1) {
    const value = args[configIndex + 1]
    if (!value) {
      throw new Error('--config requires a file path')
    }
    configPath = path.resolve(value)
    args.splice(configIndex, 2)
  }
  return { configPath }
}

async function loadConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf8').catch(err => {
    if (err.code === 'ENOENT') {
      throw new Error(`model config not found at ${configPath}. run ai:prepare first.`)
    }
    throw err
  })
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed.models)) {
    throw new Error(`invalid model config: ${configPath}`)
  }
  return parsed
}

async function computeChecksum(filePath) {
  const hash = crypto.createHash('sha256')
  const file = await fs.open(filePath, 'r')
  try {
    const stream = file.createReadStream()
    for await (const chunk of stream) {
      hash.update(chunk)
    }
  } finally {
    await file.close()
  }
  return hash.digest('hex')
}

function resolveTarget(model) {
  if (model.target) {
    return path.isAbsolute(model.target) ? model.target : path.join(ROOT, model.target)
  }
  const fileName = model.fileName || `${model.id}.bin`
  return path.join(ROOT, 'data', 'models', model.id || fileName.replace(/\.\w+$/, ''), fileName)
}

async function validateModel(model) {
  const target = resolveTarget(model)
  const summary = { id: model.id || target, target }
  try {
    const stat = await fs.stat(target)
    if (!stat.isFile()) {
      throw new Error('target exists but is not a file')
    }
    if (model.checksum) {
      const [algorithm, expected] = model.checksum.split(':')
      if (!algorithm || !expected) {
        throw new Error('invalid checksum format')
      }
      if (algorithm.toLowerCase() !== 'sha256') {
        throw new Error(`unsupported checksum algorithm ${algorithm}`)
      }
      const digest = await computeChecksum(target)
      if (digest !== expected.toLowerCase()) {
        throw new Error(`checksum mismatch expected ${expected} got ${digest}`)
      }
    }
    summary.status = 'ok'
    return summary
  } catch (error) {
    summary.status = 'failed'
    summary.error = error.message || String(error)
    return summary
  }
}

async function main() {
  const { configPath } = parseArgs(process.argv.slice(2))
  const config = await loadConfig(configPath)
  if (config.models.length === 0) {
    console.warn('[ai:smoke] no models defined in config; skipping smoke test')
    return
  }
  const results = []
  for (const model of config.models) {
    const result = await validateModel(model)
    results.push(result)
    if (result.status === 'ok') {
      console.log(`[ai:smoke] ${result.id} ready (${result.target})`)
    } else {
      console.error(`[ai:smoke] ${result.id} failed: ${result.error}`)
    }
  }
  const failures = results.filter(item => item.status !== 'ok')
  if (failures.length) {
    throw new Error(`ai:smoke detected ${failures.length} failing model(s)`)
  }
  console.log(`[ai:smoke] verified ${results.length} model(s) via ${configPath}`)
}

main().catch(error => {
  console.error('[ai:smoke] error:', error.message || error)
  process.exit(1)
})
