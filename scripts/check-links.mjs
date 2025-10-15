import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'

const ROOT = process.cwd()
const DOCS_DIR = path.join(ROOT, 'docs')
const GENERATED_DIR = path.join(ROOT, 'docs/_generated')
const DIST_DIR = path.join(ROOT, 'docs/.vitepress/dist')
let distReady = false
const INTERNAL_PREFIXES = ['/', './', '../']
const DEFAULT_LOCALE = 'zh'
let localeConfigs = []

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
  for (const config of localeConfigs) {
    if (config.isDefault) continue
    const prefix = `${config.routePrefix}/`
    if (url.startsWith(prefix)) return { relative: url.slice(prefix.length), locale: config.code }
  }
  if (url.startsWith('/')) return { relative: url.slice(1), locale: DEFAULT_LOCALE }
  return { relative: url.replace(/^\/+/, ''), locale: DEFAULT_LOCALE }
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
  const localeConfig = localeConfigs.find(cfg => cfg.code === locale)

  const searchRoots = [DOCS_DIR, GENERATED_DIR, ...(localeConfig?.extraSearchRoots ?? [])]

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
  localeConfigs = buildLocaleConfigs(manifestInfos)
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
  const manifestErrors = await validateNavManifests(manifestInfos)
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

async function collectManifestInfos() {
  const files = await globby('nav.manifest.*.json', { cwd: GENERATED_DIR })
  const infos = files.map(file => ({
    locale: file.replace(/^nav\.manifest\./, '').replace(/\.json$/, ''),
    file: path.join(GENERATED_DIR, file)
  }))
  if (!infos.some(info => info.locale === DEFAULT_LOCALE)) {
    infos.push({ locale: DEFAULT_LOCALE, file: path.join(GENERATED_DIR, `nav.manifest.${DEFAULT_LOCALE}.json`) })
  }
  return infos
}

function buildLocaleConfigs(manifestInfos) {
  const locales = new Set([DEFAULT_LOCALE])
  for (const info of manifestInfos) locales.add(info.locale)
  return [...locales].map(locale => ({
    code: locale,
    isDefault: locale === DEFAULT_LOCALE,
    routePrefix: locale === DEFAULT_LOCALE ? '' : `/${locale}`,
    extraSearchRoots: locale === DEFAULT_LOCALE ? [] : [
      path.join(DOCS_DIR, locale),
      path.join(DOCS_DIR, locale, '_generated')
    ],
    contentRoots: buildContentRoots(locale)
  }))
}

function buildContentRoots(locale) {
  const roots = []
  if (locale === DEFAULT_LOCALE) {
    roots.push(path.join(DOCS_DIR, 'content'))
    roots.push(path.join(DOCS_DIR, `content.${locale}`))
  } else {
    roots.push(path.join(DOCS_DIR, locale, 'content'))
    roots.push(path.join(DOCS_DIR, `content.${locale}`))
  }
  return roots
}

async function validateNavManifests(manifestInfos) {
  const allowedTypes = new Set(['categories', 'series', 'tags', 'archive'])
  const errors = []
  for (const manifestInfo of manifestInfos) {
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
