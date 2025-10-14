import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'

const ROOT = process.cwd()
const DOCS_DIR = path.join(ROOT, 'docs')
const GENERATED_DIR = path.join(ROOT, 'docs/_generated')
const DIST_DIR = path.join(ROOT, 'docs/.vitepress/dist')
let distReady = false
const INTERNAL_PREFIXES = ['/', './', '../']

function isInternalLink(url) {
  return INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix)) && !url.startsWith('http')
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizeInternal(url) {
  if (url.startsWith('/')) return url
  return '/' + url.replace(/^\.\//, '')
}

async function validateInternalLink(url, filePath) {
  const normalized = normalizeInternal(url)
  if (normalized.endsWith('.html')) {
    if (!distReady) return true
    const distPath = path.join(DIST_DIR, normalized.replace(/\/$/, ''))
    if (await fileExists(distPath)) return true
    return `${normalized} (from ${filePath}) -> dist file missing`
  }
  const clean = normalized.replace(/#.+$/, '')
  if (clean === '/' || clean === '') return true
  const relative = clean.replace(/^\//, '')
  const mdPath = path.join(DOCS_DIR, relative)
  if (await fileExists(mdPath + '.md')) return true
  const generatedPath = path.join(GENERATED_DIR, relative)
  if (await fileExists(generatedPath)) return true
  const distPath = path.join(DIST_DIR, relative)
  if (await fileExists(distPath)) return true
  return `${normalized} (from ${filePath}) -> target not found`
}

async function checkFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8')
  const regex = /\[[^\]]+\]\(([^)]+)\)/g
  const errors = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const url = match[1]
    if (url.startsWith('http')) continue
    if (!isInternalLink(url)) continue
    const result = await validateInternalLink(url, path.relative(ROOT, filePath))
    if (result !== true) errors.push(result)
  }
  return errors
}

async function main() {
  distReady = await fileExists(DIST_DIR)
  const files = await globby('docs/**/*.md', { cwd: ROOT })
  const errors = []
  for (const file of files) {
    const filePath = path.join(ROOT, file)
    const fileErrors = await checkFile(filePath)
    errors.push(...fileErrors)
  }
  if (errors.length) {
    console.error('Link check failed:')
    errors.forEach(err => console.error(' -', err))
    process.exit(1)
  }
  console.log('Link check passed')
}

main().catch(err => {
  console.error('Link check script failed:', err)
  process.exit(1)
})
