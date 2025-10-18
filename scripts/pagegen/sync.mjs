import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'

export async function syncLocaleContent(locales, options = {}) {
  const {
    fullSync = false,
    cacheDir = path.join(process.cwd(), 'data')
  } = options
  const results = []

  for (const lang of locales) {
    const localeId = lang?.code || lang?.manifestLocale || 'unknown'
    const metrics = {
      locale: localeId,
      source: lang?.contentDir || '',
      target: lang?.localizedContentDir || '',
      files: 0,
      bytes: 0,
      copied: false,
      skipped: false,
      mode: fullSync ? 'full' : 'incremental',
      copiedFiles: 0,
      removedFiles: 0,
      unchangedFiles: 0,
      failedCopies: 0,
      failedRemovals: 0,
      errors: [],
      snapshotUpdated: false
    }

    if (!lang?.contentDir || !lang.localizedContentDir) {
      metrics.skipped = true
      results.push(metrics)
      continue
    }

    if (!(await pathExists(lang.contentDir))) {
      metrics.skipped = true
      results.push(metrics)
      continue
    }

    const source = path.resolve(lang.contentDir)
    const target = path.resolve(lang.localizedContentDir)
    if (source === target) {
      metrics.skipped = true
      results.push(metrics)
      continue
    }

    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.mkdir(cacheDir, { recursive: true })

    const manifestPath = path.join(cacheDir, `pagegen-sync.${localeId}.json`)
    const previousSnapshot = (!fullSync && (await readSnapshot(manifestPath))) || { files: {} }

    const { files, bytes, snapshot } = await captureSnapshot(lang.contentDir)
    metrics.files = files
    metrics.bytes = bytes

    if (fullSync || !previousSnapshot.exists) {
      try {
        await fs.rm(target, { recursive: true, force: true })
        await fs.mkdir(target, { recursive: true })
        await fs.cp(lang.contentDir, target, { recursive: true })
        metrics.copiedFiles = files
        metrics.unchangedFiles = 0
        metrics.copied = files > 0
        metrics.mode = 'full'
        await writeSnapshot(manifestPath, snapshot)
        metrics.snapshotUpdated = true
      } catch (error) {
        metrics.failedCopies = files
        metrics.errors.push({ type: 'cp', message: error?.message || 'sync: full copy failed' })
      }
      results.push(metrics)
      continue
    }

    metrics.mode = 'incremental'
    const diff = diffSnapshots(previousSnapshot.files, snapshot.files)

    let successfulCopies = 0
    let successfulRemovals = 0

    for (const relative of diff.changed) {
      const sourceFile = path.join(source, relative)
      const targetFile = path.join(target, relative)
      try {
        await fs.mkdir(path.dirname(targetFile), { recursive: true })
        await fs.copyFile(sourceFile, targetFile)
        successfulCopies++
      } catch (error) {
        metrics.failedCopies += 1
        metrics.errors.push({ type: 'copy', file: relative, message: error?.message || 'sync: copy failed' })
      }
    }

    for (const relative of diff.removed) {
      const targetFile = path.join(target, relative)
      try {
        await fs.rm(targetFile, { force: true })
        successfulRemovals++
      } catch (error) {
        metrics.failedRemovals += 1
        metrics.errors.push({ type: 'remove', file: relative, message: error?.message || 'sync: remove failed' })
      }
    }

    metrics.copiedFiles = successfulCopies
    metrics.removedFiles = successfulRemovals
    metrics.unchangedFiles = diff.unchanged.length
    metrics.copied = successfulCopies > 0 || successfulRemovals > 0

    if (diff.changed.length === 0 && diff.removed.length === 0) {
      metrics.mode = 'incremental'
    }

    if (metrics.failedCopies === 0 && metrics.failedRemovals === 0) {
      await writeSnapshot(manifestPath, snapshot)
      metrics.snapshotUpdated = true
    }
    results.push(metrics)
  }

  return results
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function captureSnapshot(contentDir) {
  const files = await globby('**/*', {
    cwd: contentDir,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false
  })

  const snapshot = { files: {} }
  let totalBytes = 0

  for (const relative of files) {
    const absolute = path.join(contentDir, relative)
    const stat = await fs.stat(absolute)
    snapshot.files[relative] = {
      mtimeMs: stat.mtimeMs,
      size: stat.size
    }
    totalBytes += stat.size
  }

  return { files: files.length, bytes: totalBytes, snapshot }
}

async function readSnapshot(manifestPath) {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8')
    return { exists: true, files: JSON.parse(raw)?.files || {} }
  } catch {
    return { exists: false, files: {} }
  }
}

async function writeSnapshot(manifestPath, snapshot) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(snapshot, null, 2))
}

function diffSnapshots(prev, next) {
  const changed = []
  const removed = []
  const unchanged = []

  for (const [relative, info] of Object.entries(next)) {
    const previous = prev[relative]
    if (!previous) {
      changed.push(relative)
      continue
    }
    if (previous.mtimeMs !== info.mtimeMs || previous.size !== info.size) {
      changed.push(relative)
    } else {
      unchanged.push(relative)
    }
  }

  for (const relative of Object.keys(prev)) {
    if (!next[relative]) removed.push(relative)
  }

  return { changed, removed, unchanged }
}
