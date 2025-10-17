const ACTIVE_BASE_GLOBAL = '__LING_ATLAS_ACTIVE_BASE__'
const BASE_META_SELECTOR = 'meta[name="ling-atlas:base"]'

function ensureLeadingSlash(value) {
  if (!value.startsWith('/')) return `/${value}`
  return value
}

function ensureTrailingSlash(value) {
  if (value === '/') return value
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeBase(value) {
  if (!value) return '/'
  const trimmed = value.trim()
  if (!trimmed) return '/'
  return ensureTrailingSlash(ensureLeadingSlash(trimmed))
}

function readMetaBase() {
  if (typeof document === 'undefined') return null
  const meta = document.querySelector(BASE_META_SELECTOR)
  if (!meta) return null
  const content = meta.getAttribute('content')
  if (!content) return null
  const normalized = content.trim()
  return normalized.length ? normalized : null
}

function readSiteBase(globalWindow) {
  const siteBase = globalWindow?.__VP_SITE_DATA__?.site?.base
  if (typeof siteBase === 'string' && siteBase.length) return siteBase
  return null
}

function readEnvBase() {
  const envBase = (import.meta?.env?.BASE_URL)
  if (typeof envBase === 'string' && envBase.length) return envBase
  return null
}

function readDeclaredBase(globalWindow) {
  return readMetaBase() ?? readSiteBase(globalWindow) ?? readEnvBase() ?? '/'
}

function computeActiveBase(globalWindow, declaredBase) {
  const normalizedDeclared = normalizeBase(declaredBase)
  const pathname = typeof globalWindow?.location?.pathname === 'string' ? globalWindow.location.pathname : '/'
  if (normalizedDeclared !== '/' && pathname && !pathname.startsWith(normalizedDeclared)) {
    return '/'
  }
  return normalizedDeclared
}

export function getActiveBase() {
  if (typeof window === 'undefined') {
    return normalizeBase(readDeclaredBase())
  }

  const globalWindow = window
  const stored = globalWindow[ACTIVE_BASE_GLOBAL]
  if (typeof stored === 'string' && stored.length) {
    return normalizeBase(stored)
  }

  const declared = readDeclaredBase(globalWindow)
  const active = computeActiveBase(globalWindow, declared)
  globalWindow[ACTIVE_BASE_GLOBAL] = active
  return active
}

export function withActiveBase(path, baseOverride) {
  const base = normalizeBase(baseOverride ?? getActiveBase())
  const trimmed = path.startsWith('/') ? path.slice(1) : path
  if (!trimmed) return base
  return base === '/' ? `/${trimmed}` : `${base}${trimmed}`
}

export { ACTIVE_BASE_GLOBAL }
