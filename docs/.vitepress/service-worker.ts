/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { cacheNames, clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }

clientsClaim()
self.skipWaiting()

const manifestEntries = self.__WB_MANIFEST ?? []
precacheAndRoute(manifestEntries)
cleanupOutdatedCaches()

const HTML_CACHE = 'html-cache'
const PAGEFIND_CACHE = 'pagefind-cache'
const EMBEDDINGS_CACHE = 'embeddings-cache'
const EMBEDDINGS_WORKER_CACHE = 'embeddings-worker-cache'

function normalizedBasePath(): string {
  const scopePath = new URL(self.registration.scope).pathname
  return scopePath.endsWith('/') ? scopePath : `${scopePath}/`
}

const basePath = normalizedBasePath()
const fallbackCandidates = new Set([basePath, `${basePath}index.html`])

const navigationStrategy = new NetworkFirst({
  cacheName: HTML_CACHE,
  networkTimeoutSeconds: 5,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })
  ]
})

registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ request, url, event }) => {
    try {
      const response = await navigationStrategy.handle({ request, event })
      if (response) return response
    } catch (error) {
      // Ignore network failures and fall back to cached entries below.
    }

    const cachedResponse = await caches.match(request)
    if (cachedResponse) return cachedResponse

    if (fallbackCandidates.has(url.pathname)) {
      const fallbackUrl = new URL('index.html', self.registration.scope)
      const fallback = await caches.match(fallbackUrl.href)
      if (fallback) return fallback
    }

    return Response.error()
  }
)

registerRoute(
  ({ url }) => url.pathname.startsWith(`${basePath}pagefind/`),
  new StaleWhileRevalidate({
    cacheName: PAGEFIND_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 })]
  })
)

registerRoute(
  ({ url }) => url.pathname.endsWith('embeddings-texts.json'),
  new StaleWhileRevalidate({
    cacheName: EMBEDDINGS_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 3 })]
  })
)

registerRoute(
  ({ url }) => url.pathname.endsWith('worker/embeddings.worker.js'),
  new CacheFirst({
    cacheName: EMBEDDINGS_WORKER_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 })]
  })
)

self.addEventListener('activate', event => {
  const allowedCaches = new Set([
    cacheNames.precache,
    HTML_CACHE,
    PAGEFIND_CACHE,
    EMBEDDINGS_CACHE,
    EMBEDDINGS_WORKER_CACHE
  ])

  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => !allowedCaches.has(key)).map(key => caches.delete(key))))
  )
})
