import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const distDir = path.resolve('docs/.vitepress/dist')

function hasHtmlFiles(directory) {
  if (!fs.existsSync(directory)) return false
  const queue = [directory]
  while (queue.length) {
    const current = queue.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (error) {
      console.warn(`[search:index] unable to read directory: ${current}`, error)
      continue
    }
    for (const entry of entries) {
      const resolved = path.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(resolved)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        return true
      }
    }
  }
  return false
}

function runBuildOnce() {
  console.warn('[search:index] docs/.vitepress/dist has no HTML output; running "npm run build" before indexing…')
  const result = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: process.env
  })
  if (result.status !== 0) {
    console.error('[search:index] "npm run build" failed; aborting Pagefind indexing.')
    process.exit(result.status ?? 1)
  }
}

export function ensureDistHasHtml() {
  if (hasHtmlFiles(distDir)) {
    return { rebuilt: false }
  }

  if (process.env.SEARCH_INDEX_SKIP_BUILD) {
    console.error(
      '[search:index] docs/.vitepress/dist is missing HTML output and auto-rebuild is disabled (SEARCH_INDEX_SKIP_BUILD=1).'
    )
    process.exit(1)
  }

  runBuildOnce()

  if (!hasHtmlFiles(distDir)) {
    console.error('[search:index] docs/.vitepress/dist still lacks HTML output after rebuilding. Please inspect build logs.')
    process.exit(1)
  }

  console.info('[search:index] docs/.vitepress/dist rebuilt successfully; continuing Pagefind indexing.')
  return { rebuilt: true }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureDistHasHtml()
}

export { hasHtmlFiles, distDir }
