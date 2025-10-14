#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WELL_KNOWN = path.join(ROOT, 'docs', 'public', '.well-known')
const DIST = path.join(ROOT, 'docs', '.vitepress', 'dist', '.well-known')
const OUTPUT = path.join(WELL_KNOWN, 'sbom.json')

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

function getCycloneDxBin() {
  const binName = process.platform === 'win32' ? 'cyclonedx-npm.cmd' : 'cyclonedx-npm'
  const absolute = path.join(ROOT, 'node_modules', '.bin', binName)
  if (!fsSync.existsSync(absolute)) {
    throw new Error('cyclonedx-npm binary not found. Did you install @cyclonedx/bom?')
  }
  return absolute
}

async function runCycloneDx() {
  await ensureDir(WELL_KNOWN)
  await ensureDir(DIST)
  const bin = getCycloneDxBin()
  await new Promise((resolve, reject) => {
    const proc = spawn(bin, ['--output-format', 'json', '--output-file', OUTPUT, '--spec-version', '1.5'], {
      cwd: ROOT,
      stdio: 'inherit'
    })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`cyclonedx-npm exited with code ${code}`))
      } else {
        resolve()
      }
    })
  })
  await fs.copyFile(OUTPUT, path.join(DIST, 'sbom.json'))
  console.log(`[security] SBOM generated at ${path.relative(ROOT, OUTPUT)}`)
}

runCycloneDx().catch(err => {
  console.error('[security] SBOM generation failed:', err)
  process.exitCode = 1
})
