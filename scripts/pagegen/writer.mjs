import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

function hashContent(content, algorithm = 'sha1') {
  return crypto.createHash(algorithm).update(content).digest('hex')
}

async function ensureDir(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
}

async function readFileSafe(target, encoding) {
  try {
    return await fs.readFile(target, encoding)
  } catch {
    return null
  }
}

export function createWriter(options = {}) {
  const { hash = 'sha1', encoding = 'utf8' } = options
  const tasks = []

  function addFileTask({ stage, locale, target, content, mode = encoding }) {
    if (!target) throw new Error('createWriter: target path is required')
    const task = {
      stage,
      locale,
      target,
      execute: async () => {
        const nextContent = typeof content === 'function' ? await content() : content
        if (nextContent == null) return { status: 'skipped', reason: 'empty' }

        await ensureDir(target)
        const existing = await readFileSafe(target, mode)
        if (existing != null) {
          const currentHash = hashContent(existing, hash)
          const nextHash = hashContent(nextContent, hash)
          if (currentHash === nextHash) {
            return { status: 'skipped', reason: 'hash' }
          }
        }
        await fs.writeFile(target, nextContent, mode)
        return { status: 'written' }
      }
    }
    tasks.push(task)
  }

  async function flush() {
    const results = {
      total: tasks.length,
      written: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      skippedByReason: {}
    }

    if (!tasks.length) return results

    const executions = tasks.map(task =>
      task
        .execute()
        .then(outcome => ({ task, outcome }))
        .catch(error => ({ task, error }))
    )

    const responses = await Promise.all(executions)

    for (const { task, outcome, error } of responses) {
      if (error) {
        results.failed += 1
        results.errors.push({
          stage: task?.stage,
          locale: task?.locale,
          target: task?.target,
          message: error?.message || 'Unknown write error',
          stack: error?.stack
        })
        continue
      }

      if (outcome?.status === 'written') {
        results.written += 1
      } else {
        results.skipped += 1
        const reason = outcome?.reason || 'unknown'
        results.skippedByReason[reason] = (results.skippedByReason[reason] || 0) + 1
      }
    }

    tasks.length = 0

    return results
  }

  return {
    addFileTask,
    flush
  }
}
