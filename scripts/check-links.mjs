import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import { DEFAULT_LOCALE, LOCALE_REGISTRY } from './pagegen.locales.mjs'

const ROOT = process.cwd()
const DOCS_DIR = path.join(ROOT, 'docs')
const GENERATED_DIR = path.join(ROOT, 'docs/_generated')
const DIST_DIR = path.join(ROOT, 'docs/.vitepress/dist')
let distReady = false
const INTERNAL_PREFIXES = ['/', './', '../']
const NAV_MANIFEST_FILES = [
  { locale: 'root', file: path.join(GENERATED_DIR, 'nav.manifest.root.json') },
  { locale: 'en', file: path.join(GENERATED_DIR, 'nav.manifest.en.json') }
]

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

function stripLocalePrefix(url) {
  const normalized = url.startsWith('/') ? url : `/${url.replace(/^\/+/, '')}`
  for (const entry of localePrefixes) {
    if (normalized === entry.prefix.slice(0, -1)) {
      return { relative: '', locale: entry.locale }
    }
    if (normalized.startsWith(entry.prefix)) {
      return { relative: normalized.slice(entry.prefix.length), locale: entry.locale }
    }
  }
  return { relative: normalized.replace(/^\//, ''), locale: DEFAULT_LOCALE }
}

async function validateInternalLink(url, filePath) {
  const normalized = normalizeInternal(url)
  if (normalized.endsWith('.html')) {
    if (!distReady) return true
    const distPath = path.join(DIST_DIR, normalized.replace(/\/$/, ''))
    if (await fileExists(distPath)) return true
    if (await fileExists(distPath + '/index.html')) return true
    return `${normalized} (from ${filePath}) -> dist file missing`
  }

  const clean = normalized.replace(/#.+$/, '')
  if (clean === '/' || clean === '') return true
  const { relative, locale } = stripLocalePrefix(clean)
  const localeConfig = localeMap.get(locale) || localeMap.get(DEFAULT_LOCALE)

  const searchRoots = localeConfig?.searchRoots?.length
    ? localeConfig.searchRoots
    : [DOCS_DIR, GENERATED_DIR]

  for (const root of searchRoots) {
    const mdPath = path.join(root, relative)
    if (await fileExists(mdPath + '.md')) return true
    if (await fileExists(path.join(mdPath, 'index.md'))) return true
  }

  if (localeConfig?.contentRoots?.length) {
    const segments = relative.split('/').filter(Boolean)
    if (segments[0] === 'content') {
      const remainder = segments.slice(1).join('/')
      for (const contentRoot of localeConfig.contentRoots) {
        const base = remainder ? path.join(contentRoot, remainder) : contentRoot
        if (await fileExists(base + '.md')) return true
        if (await fileExists(path.join(base, 'index.md'))) return true
      }
    }
  }

  const candidateDist = path.join(DIST_DIR, clean)
  if (distReady) {
    if (await fileExists(candidateDist)) return true
    if (await fileExists(path.join(candidateDist, 'index.html'))) return true
  }

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
  distReady = await fileExists(path.join(DIST_DIR, 'index.html'))
  const manifestInfos = await collectManifestInfos()
  const excludeLocales = localeConfigs
    .filter(cfg => !cfg.isDefault)
    .map(cfg => `!docs/${cfg.code}/_generated/**/*`)
  const files = await globby(['docs/**/*.md', ...excludeLocales], { cwd: ROOT })
  const errors = []
  for (const file of files) {
    const filePath = path.join(ROOT, file)
    const fileErrors = await checkFile(filePath)
    errors.push(...fileErrors)
  }
  const manifestErrors = await validateNavManifests()
  errors.push(...manifestErrors)
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

async function validateNavManifests() {
  const allowedTypes = new Set(['categories', 'series', 'tags', 'archive'])
  const errors = []
  for (const manifestInfo of NAV_MANIFEST_FILES) {
    const payload = await readManifest(manifestInfo.file)
    if (!payload) continue
    for (const [type, entries] of Object.entries(payload)) {
      if (!allowedTypes.has(type)) continue
      if (typeof entries !== 'object' || !entries) continue
      for (const [slug, targetPath] of Object.entries(entries)) {
        if (typeof targetPath !== 'string' || !targetPath) continue
        const context = `nav.manifest.${manifestInfo.locale}.json [${type}:${slug}]`
        const result = await validateInternalLink(targetPath, context)
        if (result !== true) errors.push(result)
      }
    }
  }
  return errors
}

async function readManifest(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}
