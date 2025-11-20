import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(process.cwd())
const DEFAULT_SOURCE = path.join(ROOT, 'packages', 'backend', 'dist', 'data')
const TARGET_DATA = path.join(ROOT, 'docs', 'public', 'data')
const TARGET_WELL_KNOWN = path.join(ROOT, 'docs', 'public', '.well-known')

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true })
  await fs.cp(from, to, { recursive: true, force: true })
}

async function main() {
  const sourceBase = process.env.BACKEND_ARTIFACT_DIR
    ? path.resolve(ROOT, process.env.BACKEND_ARTIFACT_DIR)
    : DEFAULT_SOURCE

  const sourceData = path.join(sourceBase)
  const sourceWellKnown = path.join(sourceBase, '.well-known')

  if (!(await pathExists(sourceData))) {
    console.warn(`[artifacts] skip: source data dir not found (${sourceData})`)
    return
  }

  console.log(`[artifacts] syncing from ${sourceData}`)
  await copyDir(sourceData, TARGET_DATA)

  if (await pathExists(sourceWellKnown)) {
    await copyDir(sourceWellKnown, TARGET_WELL_KNOWN)
    console.log('[artifacts] synced .well-known artifacts')
  }

  console.log('[artifacts] sync completed')
}

main().catch(error => {
  console.error('[artifacts] failed:', error)
  process.exitCode = 1
})
