import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { validateNavIntegrity } from './pagegen/nav-validation.mjs'

const ajv = new Ajv({ allErrors: true, strict: false })

let cachedValidateLocales = null
let cachedValidateNav = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.join(__dirname, '..')
export const DOCS_DIR = path.join(ROOT_DIR, 'docs')
export const GENERATED_ROOT = path.join(DOCS_DIR, '_generated')
export const PUBLIC_ROOT = path.join(DOCS_DIR, 'public')

const CONFIG_PATH = path.join(ROOT_DIR, 'schema', 'locales.json')
const SCHEMA_PATH = path.join(ROOT_DIR, 'schema', 'locales.schema.json')
const NAV_CONFIG_PATH = path.join(ROOT_DIR, 'schema', 'nav.json')
const NAV_SCHEMA_PATH = path.join(ROOT_DIR, 'schema', 'nav.schema.json')
const CACHE_DIR = path.join(ROOT_DIR, '.codex', 'cache')
const CACHE_FILE = path.join(CACHE_DIR, 'pagegen-locales.cache.json')

const RAW_LOCALES = Object.freeze(loadLocalesFromDisk())
const NAV_CONFIG = Object.freeze(loadNavConfig())

function uniq(paths) {
  const seen = new Set()
  const result = []
  for (const item of paths) {
    if (!item) continue
    const key = path.normalize(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function ensureLeadingSlash(value) {
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

function ensureTrailingSlash(value) {
  if (!value) return '/'
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeGeneratedPrefix(prefix) {
  if (!prefix) return '/_generated'
  const normalized = ensureLeadingSlash(prefix)
  return normalized.endsWith('/_generated') ? normalized : `${normalized}/_generated`
}

function finalizeLocale(code, config = {}) {
  const preferred = Boolean(config.preferred)
  const mirrorContentToRoot = Boolean(config.mirrorContentToRoot)
  const manifestLocale = config.manifestLocale || code
  const aliasLocaleIds = Array.isArray(config.aliasLocaleIds) ? config.aliasLocaleIds : []
  const vitepressLocaleKey = config.vitepressLocaleKey || code

  const defaultRoutePrefix = mirrorContentToRoot ? '' : `/${code}`
  const routePrefix = normalizeRoutePrefix(config.routePrefix ?? defaultRoutePrefix)
  const localeRoot = routePrefix ? ensureTrailingSlash(routePrefix) : '/'
  const normalizedRoutePrefix = ensureTrailingSlash(`/${code}`)

  const docsRoot = resolvePath(config.docsRoot, {
    defaultValue: mirrorContentToRoot ? DOCS_DIR : path.join(DOCS_DIR, code)
  })
  const generatedDir = resolvePath(config.generatedDir, {
    defaultValue: path.join(docsRoot, '_generated')
  })
  const contentDir = resolvePath(config.contentDir, {
    defaultValue: path.join(docsRoot, 'content')
  })
  const localizedContentDir =
    resolvePath(config.localizedContentDir, {
      defaultValue: mirrorContentToRoot ? path.join(DOCS_DIR, 'content') : path.join(docsRoot, 'content')
    })

  const contentRoots = uniq([
    localizedContentDir,
    contentDir,
    ...(Array.isArray(config.contentRoots) ? config.contentRoots.map(root => resolvePath(root)) : [])
  ])

  const searchRoots = uniq([
    DOCS_DIR,
    GENERATED_ROOT,
    docsRoot,
    generatedDir,
    ...(Array.isArray(config.searchRoots) ? config.searchRoots.map(root => resolvePath(root)) : [])
  ])

  const basePath = ensureTrailingSlash(config.basePath || `${localeRoot}content/`)
  const generatedPathPrefix = config.generatedPathPrefix
    ? ensureLeadingSlash(config.generatedPathPrefix)
    : normalizeGeneratedPrefix(routePrefix)

  const navManifestFile = config.navManifestFile || `nav.manifest.${code}.json`
  const navManifestPath = resolvePath(config.navManifestPath, {
    defaultValue: path.join(generatedDir, navManifestFile)
  })

  const outMetaFile = config.outMetaFile || `meta.${code}.json`
  const outMeta = resolvePath(config.outMeta, { defaultValue: path.join(generatedDir, outMetaFile) })

  const labels = composeLabels(config.labels)
  const collectionsTemplate = typeof config.collectionsTemplate === 'string'
    ? config.collectionsTemplate.trim()
    : ''
  const contentFields = composeContentFields(config.contentFields)

  return {
    code,
    preferred,
    vitepressLocaleKey,
    manifestLocale,
    aliasLocaleIds,
    mirrorContentToRoot,
    routePrefix,
    localeRoot,
    normalizedRoutePrefix,
    docsRoot,
    generatedDir,
    navManifestFile,
    navManifestPath,
    contentDir,
    localizedContentDir,
    contentRoots,
    searchRoots,
    basePath,
    generatedPathPrefix,
    labels,
    collectionsTemplate: collectionsTemplate || undefined,
    contentFields,
    rssFile: config.rssFile,
    sitemapFile: config.sitemapFile,
    outMeta,
    ui: config.ui || {}
  }
}

const localeEntries = Object.freeze(
  RAW_LOCALES.map(entry => finalizeLocale(entry.code, entry))
)

export const LANG_CONFIG = Object.freeze(Object.fromEntries(localeEntries.map(locale => [locale.code, locale])))
export const LANGUAGES = localeEntries

export const NAVIGATION_CONFIG = NAV_CONFIG

export const LOCALE_REGISTRY = Object.freeze(
  localeEntries.map(locale => ({
    code: locale.code,
    preferred: locale.preferred,
    routePrefix: locale.routePrefix,
    localeRoot: locale.localeRoot,
    normalizedRoutePrefix: locale.normalizedRoutePrefix,
    navManifestFile: locale.navManifestFile,
    navManifestPath: locale.navManifestPath,
    docsRoot: locale.docsRoot,
    generatedDir: locale.generatedDir,
    searchRoots: locale.searchRoots,
    contentRoots: locale.contentRoots,
    contentDir: locale.contentDir,
    localizedContentDir: locale.localizedContentDir,
    basePath: locale.basePath,
    generatedPathPrefix: locale.generatedPathPrefix
  }))
)

export function getLocaleConfig(localeCode) {
  return LANG_CONFIG[localeCode]
}

export function getPreferredLocale() {
  const preferredLocale = localeEntries.find(locale => locale.preferred)
  return preferredLocale ? preferredLocale.code : localeEntries[0]?.code
}

export const __test__ = {
  loadLocalesFromFiles,
  loadNavConfigFromFiles
}

function loadLocalesFromDisk() {
  return loadLocalesFromFiles({
    configPath: CONFIG_PATH,
    schemaPath: SCHEMA_PATH,
    cachePath: CACHE_FILE,
    useCache: true
  })
}

function loadLocalesFromFiles({ configPath, schemaPath, cachePath, useCache = false }) {
  const configStat = safeStat(configPath)
  const schemaStat = safeStat(schemaPath)

  let cached = null
  if (useCache && cachePath) {
    cached = readCache(cachePath)
    if (
      cached &&
      cached.sourceMtimeMs === configStat?.mtimeMs &&
      cached.schemaMtimeMs === schemaStat?.mtimeMs &&
      Array.isArray(cached.locales)
    ) {
      return cached.locales
    }
  }

  const schemaJson = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'))

  const validator = useCache
    ? (cachedValidateLocales ||= ajv.compile(schemaJson))
    : ajv.compile(schemaJson)

  if (!validator(configJson)) {
    const details = (validator.errors || [])
      .map(err => `${err.instancePath || 'root'} ${err.message}`)
      .join('; ')
    throw new Error(`Invalid locales configuration: ${details}`)
  }

  const locales = Array.isArray(configJson.locales) ? configJson.locales.map(normalizeLocaleEntry) : []

  if (useCache && cachePath) {
    writeCache(cachePath, {
      version: 1,
      sourceMtimeMs: configStat?.mtimeMs ?? null,
      schemaMtimeMs: schemaStat?.mtimeMs ?? null,
      locales
    })
  }

  return locales
}

function loadNavConfig() {
  return loadNavConfigFromFiles({
    configPath: NAV_CONFIG_PATH,
    schemaPath: NAV_SCHEMA_PATH,
    useCache: true
  })
}

function loadNavConfigFromFiles({ configPath, schemaPath, useCache = false }) {
  const schemaStat = safeStat(schemaPath)
  const configStat = safeStat(configPath)
  if (!schemaStat) {
    throw new Error(`[pagegen.locales] navigation schema 缺失：${schemaPath}`)
  }
  if (!configStat) {
    throw new Error(`[pagegen.locales] navigation 配置缺失：${configPath}`)
  }

  const schemaJson = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'))

  const validator = useCache
    ? (cachedValidateNav ||= ajv.compile(schemaJson))
    : ajv.compile(schemaJson)

  if (!validator(configJson)) {
    const details = (validator.errors || [])
      .map(err => `${err.instancePath || 'root'} ${err.message}`)
      .join('; ')
    throw new Error(`Invalid navigation configuration: ${details}`)
  }

  const { errors, warnings } = validateNavIntegrity(configJson)
  if (warnings.length) {
    for (const warning of warnings) {
      console.warn(`[pagegen.locales] ${warning}`)
    }
  }
  if (errors.length) {
    const message = errors.map(item => ` - ${item}`).join('\n')
    throw new Error(`Invalid navigation references:\n${message}`)
  }

  return configJson
}

function normalizeLocaleEntry(entry) {
  if (!entry || typeof entry !== 'object') return {}
  return {
    ...entry,
    code: entry.code
  }
}

function resolvePath(target, { defaultValue } = {}) {
  if (target == null || target === '') {
    return defaultValue
  }
  if (path.isAbsolute(target)) {
    return target
  }
  if (target.startsWith('./') || target.startsWith('../')) {
    return path.join(ROOT_DIR, target)
  }
  return path.join(DOCS_DIR, target)
}

function normalizeRoutePrefix(input) {
  if (!input) return ''
  const trimmed = input.trim()
  if (!trimmed || trimmed === '/') return ''
  return ensureLeadingSlash(trimmed.replace(/\/+$/, ''))
}

function composeLabels(raw = {}) {
  const template = typeof raw === 'object' && raw ? raw : {}
  return {
    category: createLabelFormatter(template.category),
    series: createLabelFormatter(template.series),
    tag: createLabelFormatter(template.tag),
    archive: createLabelFormatter(template.archive),
    rssTitle: template.rssTitle || '',
    rssDesc: template.rssDesc || ''
  }
}

function createLabelFormatter(template) {
  if (typeof template === 'string' && template.length) {
    if (template.includes('{value}')) {
      return value => template.replaceAll('{value}', String(value ?? ''))
    }
    return value => `${template}${value != null ? String(value) : ''}`
  }
  return value => String(value ?? '')
}

function composeContentFields(raw = {}) {
  if (!raw || typeof raw !== 'object') return {}
  const normalized = {}
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      normalized[key] = value.map(item => String(item))
    } else if (typeof value === 'string') {
      normalized[key] = [value]
    }
  }
  return normalized
}

function safeStat(targetPath) {
  try {
    return fs.statSync(targetPath)
  } catch {
    return null
  }
}

function readCache(cachePath) {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeCache(cachePath, payload) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2))
  } catch (error) {
    console.warn('[pagegen.locales] Failed to write cache:', error.message)
  }
}
