let telemetryModulePromise: Promise<any> | null = null

function resolveAssetPath(path: string) {
  const base = (import.meta as any).env?.BASE_URL || '/'
  const cleaned = path.replace(/^\/+/, '')
  if (base.endsWith('/')) return base + cleaned
  return base + '/' + cleaned
}
let initialized = false

async function ensureModule() {
  if (typeof window === 'undefined') return null
  if (!telemetryModulePromise) {
    const url = resolveAssetPath('telemetry.js')
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
