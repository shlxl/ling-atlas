const STORAGE_KEY = 'telemetry-buffer'

function createDefaultBuffer() {
  return {
    pv: { total: 0, paths: {} },
    search: {
      queries: {}, // hash -> { count, lenSum }
      clicks: {}   // key(hash|url) -> { hash, url, count, rankSum }
    },
    meta: { searchOpen: 0 }
  }
}

function loadBuffer() {
  if (typeof window === 'undefined') return createDefaultBuffer()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultBuffer()
    const parsed = JSON.parse(raw)
    if (!parsed.pv || !parsed.search) return createDefaultBuffer()
    return parsed
  } catch (err) {
    console.warn('[telemetry] failed to load buffer', err)
    return createDefaultBuffer()
  }
}

let buffer = loadBuffer()

function persist() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer))
  } catch (err) {
    console.warn('[telemetry] persist failed', err)
  }
}

function recordPv(payload = {}) {
  const path = payload.path || (typeof window !== 'undefined' ? window.location.pathname : 'unknown')
  buffer.pv.total += 1
  buffer.pv.paths[path] = (buffer.pv.paths[path] || 0) + 1
}

function recordSearchOpen() {
  buffer.meta.searchOpen = (buffer.meta.searchOpen || 0) + 1
}

function recordSearchQuery(payload = {}) {
  const hash = payload.qHash || payload.hash
  if (!hash) return
  const len = Number(payload.len || 0)
  const entry = buffer.search.queries[hash] || { count: 0, lenSum: 0 }
  entry.count += 1
  entry.lenSum += len
  buffer.search.queries[hash] = entry
}

function recordSearchClick(payload = {}) {
  const hash = payload.qHash || payload.hash
  const url = payload.url
  if (!hash || !url) return
  const key = `${hash}|${url}`
  const entry = buffer.search.clicks[key] || { hash, url, count: 0, rankSum: 0 }
  entry.count += 1
  entry.rankSum += Number(payload.rank || 0)
  buffer.search.clicks[key] = entry
}

export async function track(eventName, payload = {}) {
  if (typeof window === 'undefined') return
  try {
    switch (eventName) {
      case 'pv':
        recordPv(payload)
        break
      case 'search_open':
        recordSearchOpen()
        break
      case 'search_query':
        recordSearchQuery(payload)
        break
      case 'search_click':
        recordSearchClick(payload)
        break
      default:
        break
    }
    persist()
  } catch (err) {
    console.warn('[telemetry] track error', err)
  }
}

export async function hashQuery(value) {
  if (typeof window === 'undefined' || !value) return ''
  try {
    const data = new TextEncoder().encode(value)
    const digest = await crypto.subtle.digest('SHA-1', data)
    const bytes = Array.from(new Uint8Array(digest))
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (err) {
    console.warn('[telemetry] sha1 failed', err)
    return ''
  }
}

export function exportBuffer({ clear = false } = {}) {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    pv: {
      total: buffer.pv.total,
      paths: { ...buffer.pv.paths }
    },
    search: {
      queries: JSON.parse(JSON.stringify(buffer.search.queries)),
      clicks: JSON.parse(JSON.stringify(buffer.search.clicks))
    },
    meta: { ...buffer.meta }
  }
  if (typeof window !== 'undefined') {
    console.log('[telemetry export]', snapshot)
  }
  if (clear) {
    buffer = createDefaultBuffer()
    persist()
  }
  return snapshot
}

if (typeof window !== 'undefined') {
  window.__telemetry = {
    track,
    hashQuery,
    export: exportBuffer,
    clear() {
      buffer = createDefaultBuffer()
      persist()
    }
  }
}
