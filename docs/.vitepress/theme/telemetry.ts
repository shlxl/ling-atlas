import { getActiveBase } from './base'

let telemetryModulePromise: Promise<any> | null = null

function normalizeBase(base: string) {
  let value = base || '/'
  if (!value.startsWith('/')) value = `/${value}`
  if (!value.endsWith('/')) value = `${value}/`
  return value
}

export function resolveAsset(path: string) {
  const cleaned = path.replace(/^\/+/, '')
  const base = normalizeBase(getActiveBase())
  const href = base === '/' ? `/${cleaned}` : `${base}${cleaned}`
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1'
  return new URL(href, origin)
}
let initialized = false

async function ensureModule() {
  if (typeof window === 'undefined') return null
  if (!telemetryModulePromise) {
    const url = resolveAsset('telemetry.js').href
    telemetryModulePromise = import(/* @vite-ignore */ url).catch(err => {
      console.warn('[telemetry] failed to load module', err)
      return null
    })
  }
  return telemetryModulePromise
}

export async function initTelemetry() {
  if (initialized || typeof window === 'undefined') return
  const mod = await ensureModule()
  if (mod && typeof mod.track === 'function') {
    try {
      await mod.track('pv', { path: window.location.pathname + window.location.search, ts: Date.now() })
    } catch (err) {
      console.warn('[telemetry] pv track failed', err)
    }
  }
  initialized = true
}

export async function trackEvent(event: string, payload: Record<string, any> = {}) {
  const mod = await ensureModule()
  if (!mod || typeof mod.track !== 'function') return
  try {
    await mod.track(event, { ...payload, ts: payload.ts ?? Date.now() })
  } catch (err) {
    console.warn('[telemetry] track failed', err)
  }
}

export async function hashQuery(value: string) {
  const mod = await ensureModule()
  if (!mod || typeof mod.hashQuery !== 'function') return ''
  try {
    return await mod.hashQuery(value)
  } catch (err) {
    console.warn('[telemetry] hash failed', err)
    return ''
  }
}

export function setupTelemetryRouterHook(router: { onAfterRouteChanged: (cb: (to: string, from?: string) => void) => void }) {
  if (typeof window === 'undefined' || !router?.onAfterRouteChanged) return
  router.onAfterRouteChanged((to: string) => {
    trackEvent('pv', { path: to, ts: Date.now() })
  })
}
