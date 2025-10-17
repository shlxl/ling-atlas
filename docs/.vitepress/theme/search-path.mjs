import { getActiveBase, withActiveBase } from './base.mjs'

const RELATIVE_URL_BASE = 'http://127.0.0.1'

function ensureLeadingSlash(value) {
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

function stripActiveBase(pathname, activeBase) {
  const normalizedBase = ensureLeadingSlash(activeBase || '/')
  if (normalizedBase === '/' || !pathname.startsWith(normalizedBase)) {
    return pathname
  }
  const sliced = pathname.slice(normalizedBase.length - 1)
  return sliced.length ? sliced : '/'
}

export function normalizeSearchResultHref(raw) {
  const activeBase = getActiveBase()
  if (!raw) {
    return withActiveBase('/', activeBase)
  }
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) {
    return raw
  }

  try {
    const parsed = new URL(String(raw), RELATIVE_URL_BASE)
    const pathname = ensureLeadingSlash(parsed.pathname || '/')
    const relativePath = stripActiveBase(pathname, activeBase)
    const resolvedPath = withActiveBase(relativePath, activeBase)
    return `${resolvedPath}${parsed.search}${parsed.hash}`
  } catch (err) {
    console.warn('[search] normalizeSearchResultHref failed', err)
    return withActiveBase('/', activeBase)
  }
}
