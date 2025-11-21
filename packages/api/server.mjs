import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDataPath } from '@ling-atlas/shared/contracts/manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DATA_ROOT = toPosix(process.env.DATA_ROOT || path.join(ROOT, 'packages', 'backend', 'dist', 'data'))
const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 8787)
const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE || 'zh'
const DEFAULT_VERSION = process.env.MANIFEST_VERSION || null
let manifestCache = null

const routes = [
  { method: 'GET', pattern: /^\/api\/nav\/([^/]+)$/, handler: handleNav },
  { method: 'GET', pattern: /^\/api\/i18n-map$/, handler: handleI18nMap },
  { method: 'GET', pattern: /^\/api\/i18n$/, handler: handleI18n },
  { method: 'GET', pattern: /^\/api\/telemetry$/, handler: handleTelemetry },
  { method: 'GET', pattern: /^\/api\/manifest$/, handler: handleManifest },
  { method: 'GET', pattern: /^\/api\/search\/embeddings-texts$/, handler: handleSearchEmbeddings },
  { method: 'GET', pattern: /^\/api\/search$/, handler: handleSearchQuery },
  { method: 'GET', pattern: /^\/api\/search\/pagefind$/, handler: handlePagefindInfo },
  { method: 'GET', pattern: /^\/api\/search\/pagefind\/(.+)$/, handler: handlePagefindAsset },
  { method: 'GET', pattern: /^\/api\/graph$/, handler: handleGraphIndex },
  { method: 'GET', pattern: /^\/api\/graph\/topn$/, handler: handleGraphTopN },
  { method: 'GET', pattern: /^\/api\/graph\/doc$/, handler: handleGraphDoc },
  { method: 'GET', pattern: /^\/api\/graph\/subgraph$/, handler: handleGraphSubgraph },
  { method: 'GET', pattern: /^\/api\/graph\/(.+)$/, handler: handleGraphAsset }
]

function toPosix(input) {
  return typeof input === 'string' ? input.replace(/\\/g, '/') : ''
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  })
  res.end(body)
}

async function sendFile(res, target, { cacheControl = 'no-store', ifNoneMatch } = {}) {
  const stat = await fs.stat(target)
  const etag = computeEtag(stat)
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.writeHead(304, { etag, 'cache-control': cacheControl })
    res.end()
    return
  }
  const body = await fs.readFile(target, 'utf8')
  sendJson(res, 200, JSON.parse(body), {
    'last-modified': stat.mtime.toUTCString(),
    etag,
    'cache-control': cacheControl
  })
}

async function handleNav(req, res, locale) {
  const ifNoneMatch = req.headers['if-none-match']
  const baseName = `nav.manifest.${locale}.json`
  const candidates = [
    getDataPath('nav', locale, { dataRoot: DATA_ROOT, filename: baseName }),
    getDataPath('nav', DEFAULT_LOCALE, { dataRoot: DATA_ROOT, filename: `nav.manifest.${DEFAULT_LOCALE}.json` })
  ]
  for (const candidate of candidates) {
    try {
      await sendFile(res, candidate, { ifNoneMatch, cacheControl: 'public, max-age=300' })
      return
    } catch {}
  }
  sendJson(res, 404, { error: 'nav manifest not found', locale })
}

async function handleI18nMap(req, res) {
  const ifNoneMatch = req.headers['if-none-match']
  try {
    const target = getDataPath('i18n', undefined, { dataRoot: DATA_ROOT, filename: 'i18n-map.json' })
    await sendFile(res, target, { ifNoneMatch, cacheControl: 'public, max-age=300' })
  } catch {
    sendJson(res, 404, { error: 'i18n-map not found' })
  }
}

async function handleI18n(req, res) {
  const ifNoneMatch = req.headers['if-none-match']
  const target = getDataPath('i18n', undefined, { dataRoot: DATA_ROOT, filename: '.vitepress/i18n.json' })
  try {
    await sendFile(res, target, { ifNoneMatch, cacheControl: 'public, max-age=300' })
  } catch {
    sendJson(res, 404, { error: 'i18n definitions not found' })
  }
}

async function handleTelemetry(req, res) {
  const ifNoneMatch = req.headers['if-none-match']
  const target = getDataPath('telemetry', undefined, { dataRoot: DATA_ROOT, filename: 'telemetry.json' })
  try {
    await sendFile(res, target, { ifNoneMatch })
  } catch {
    sendJson(res, 404, { error: 'telemetry not found' })
  }
}

async function handleManifest(req, res) {
  const ifNoneMatch = req.headers['if-none-match']
  const targetVersion = req.url && new URL(req.url, 'http://localhost').searchParams.get('version')
  const manifestVersion = targetVersion || DEFAULT_VERSION
  const target = manifestVersion
    ? path.join(DATA_ROOT, manifestVersion, 'manifest.json')
    : path.join(DATA_ROOT, 'manifest.json')
  try {
    await sendFile(res, target, { ifNoneMatch })
  } catch {
    if (manifestVersion && manifestVersion !== 'latest') {
      try {
        await sendFile(res, path.join(DATA_ROOT, 'manifest.json'), { ifNoneMatch })
        return
      } catch {}
    }
    sendJson(res, 404, { error: 'manifest not found' })
  }
}

async function handleSearchEmbeddings(req, res) {
  const ifNoneMatch = req.headers['if-none-match']
  const target = getDataPath('search', undefined, { dataRoot: DATA_ROOT, filename: 'embeddings-texts.json' })
  try {
    await sendFile(res, target, { ifNoneMatch, cacheControl: 'public, max-age=300' })
  } catch {
    sendJson(res, 404, { error: 'embeddings-texts not found' })
  }
}

async function handleSearchQuery(req, res) {
  const searchParams = req.url ? new URL(req.url, 'http://localhost').searchParams : new URLSearchParams()
  const query = (searchParams.get('q') || '').trim()
  const limit = Number(searchParams.get('limit') || 10)
  const offset = Number(searchParams.get('offset') || 0)
  const highlight = searchParams.get('highlight') !== '0'
  try {
    const manifest = await getManifest()
    const pagefindItem = manifest.items.find(item => item.kind === 'search' && item.path.includes('pagefind'))
    const embeddingsItem = manifest.items.find(item => item.kind === 'search' && item.path.endsWith('embeddings-texts.json'))
    const summary = {
      pagefind: pagefindItem ? { path: pagefindItem.path } : null,
      embeddingsTexts: embeddingsItem ? { path: embeddingsItem.path } : null
    }

    if (!query) {
      sendJson(res, 200, summary)
      return
    }

    const embeddingsPath = embeddingsItem ? path.join(DATA_ROOT, embeddingsItem.path) : null
    const matches = embeddingsPath ? await searchEmbeddings(embeddingsPath, query, limit, offset, { highlight }) : []
    sendJson(res, 200, { ...summary, query, limit, offset, highlight, results: matches })
  } catch (error) {
    sendJson(res, 500, { error: 'search manifest not available', detail: error?.message })
  }
}

async function handlePagefindInfo(req, res) {
  try {
    const manifest = await getManifest()
    const pagefindItem = manifest.items.find(item => item.kind === 'search' && item.path.includes('pagefind.js'))
    if (!pagefindItem) {
      sendJson(res, 404, { error: 'pagefind manifest not found' })
      return
    }
    const baseDir = path.posix.dirname(pagefindItem.path)
    sendJson(res, 200, { base: baseDir })
  } catch {
    sendJson(res, 404, { error: 'pagefind manifest not found' })
  }
}

async function handleGraphIndex(req, res) {
  try {
    const manifest = await getManifest()
    const graphItems = (manifest.items || []).filter(item => item.kind === 'graphrag' && item.path.startsWith('docs/graph/'))
    sendJson(res, 200, { items: graphItems })
  } catch (error) {
    sendJson(res, 500, { error: 'graph manifest not available', detail: error?.message })
  }
}

async function handleGraphTopN(req, res) {
  try {
    const manifest = await getManifest()
    const graphItems = (manifest.items || []).filter(item => item.kind === 'graphrag' && item.path.startsWith('docs/graph/'))
    const limited = graphItems.slice(0, 20)
    sendJson(res, 200, { items: limited })
  } catch (error) {
    sendJson(res, 500, { error: 'graph manifest not available', detail: error?.message })
  }
}

async function handleGraphDoc(req, res) {
  const searchParams = req.url ? new URL(req.url, 'http://localhost').searchParams : new URLSearchParams()
  const id = (searchParams.get('id') || '').trim()
  if (!id) return sendJson(res, 400, { error: 'missing id' })
  const manifest = await getManifest()
  const prefixes = [`docs/graph/${id}`, `graphrag/docs/graph/${id}`]
  const candidates = (manifest.items || []).filter(
    item => item.kind === 'graphrag' && prefixes.some(prefix => item.path.startsWith(prefix))
  )
  if (!candidates.length) return sendJson(res, 404, { error: 'graph doc not found', id })
  const payload = {}
  const merged = { metadata: null, subgraph: null, context: null, index: null }
  for (const item of candidates) {
    const key = path.posix.basename(item.path)
    try {
      const content = await fs.readFile(path.join(DATA_ROOT, item.path), 'utf8')
      let parsed = item.format === 'json' ? JSON.parse(content) : content
      if (key === 'subgraph.mmd') {
        parsed = parseMermaidSubgraph(parsed)
      }
      payload[key] = parsed
      if (key === 'metadata.json') merged.metadata = parsed
      if (key === 'subgraph.mmd') merged.subgraph = parsed
      if (key === 'context.md') merged.context = parsed
      if (key === 'index.md') merged.index = parsed
    } catch (error) {
      payload[key] = { error: error?.message || 'read error' }
    }
  }
  sendJson(res, 200, { id, files: payload, merged })
}

async function handlePagefindAsset(req, res, assetPath) {
  const sanitized = assetPath.replace(/\\/g, '/').replace(/^\//, '')
  const manifest = await getManifest()
  const pagefindItem = manifest.items.find(item => item.kind === 'search' && item.path.includes('pagefind.js'))
  const baseDir = pagefindItem ? path.posix.dirname(pagefindItem.path) : 'search/docs/.vitepress/dist/pagefind'
  const target = path.join(DATA_ROOT, baseDir, sanitized)
  try {
    const stat = await fs.stat(target)
    const body = await fs.readFile(target)
    res.writeHead(200, {
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${stat.size}-${Number(stat.mtimeMs).toString(16)}"`
    })
    res.end(body)
  } catch {
    sendJson(res, 404, { error: 'pagefind asset not found' })
  }
}

async function handleGraphAsset(req, res, assetPath) {
  const sanitized = assetPath.replace(/\\/g, '/').replace(/^\//, '')
  const manifest = await getManifest()
  const match = (manifest.items || []).find(
    item => item.kind === 'graphrag' && item.path.includes('/graph/') && item.path.endsWith(sanitized)
  )
  const target = match
    ? path.join(DATA_ROOT, match.path)
    : getDataPath('graphrag', undefined, { dataRoot: DATA_ROOT, filename: `graphrag/docs/graph/${sanitized}` })
  try {
    const stat = await fs.stat(target)
    const body = await fs.readFile(target, 'utf8')
    const etag = computeEtag(stat)
    if (req.headers['if-none-match'] && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, 'cache-control': 'public, max-age=300' })
      res.end()
      return
    }
    res.writeHead(200, {
      'content-type': guessContentType(sanitized),
      'cache-control': 'public, max-age=300',
      etag
    })
    res.end(body)
  } catch {
    sendJson(res, 404, { error: 'graph asset not found' })
  }
}

async function handleGraphSubgraph(req, res) {
  const searchParams = req.url ? new URL(req.url, 'http://localhost').searchParams : new URLSearchParams()
  const id = (searchParams.get('id') || '').trim()
  const node = (searchParams.get('node') || '').trim()
  if (!id) return sendJson(res, 400, { error: 'missing id' })
  const doc = await loadGraphDoc(id)
  if (!doc) return sendJson(res, 404, { error: 'graph doc not found', id })
  const subgraph = doc.merged?.subgraph
  if (!subgraph) return sendJson(res, 404, { error: 'subgraph not found', id })
  if (!node) return sendJson(res, 200, { id, subgraph })
  const edges = (subgraph.edges || []).filter(e => e && (e.from === node || e.to === node))
  const related = new Set([node])
  edges.forEach(e => {
    if (e.from) related.add(e.from)
    if (e.to) related.add(e.to)
  })
  const getNodeId = n => (typeof n === 'string' ? n : n?.id)
  const filtered = {
    nodes: (subgraph.nodes || []).filter(n => related.has(getNodeId(n))),
    edges,
    raw: subgraph.raw
  }
  sendJson(res, 200, { id, node, subgraph: filtered })
}

function guessContentType(file) {
  if (file.endsWith('.json')) return 'application/json; charset=utf-8'
  if (file.endsWith('.md') || file.endsWith('.mmd')) return 'text/markdown; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

async function getManifest(version) {
  if (!version && manifestCache) return manifestCache
  const target = version
    ? path.join(DATA_ROOT, version, 'manifest.json')
    : path.join(DATA_ROOT, 'manifest.json')
  try {
    const raw = await fs.readFile(target, 'utf8')
    const parsed = JSON.parse(raw)
    if (!version) manifestCache = parsed
    return parsed
  } catch (error) {
    if (version) {
      return getManifest(null) // fallback to default
    }
    throw error
  }
}

function parseMermaidSubgraph(content) {
  // 将 mermaid graph LR 子图解析为结构化 JSON，抽取节点/边/标签。
  const lines = String(content || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('%') && !line.startsWith('graph '))

  const nodes = new Map()
  const edges = []
  const classMap = new Map()

  const ensureNode = (id, attrs = {}) => {
    if (!id) return
    const existing = nodes.get(id) || { id }
    nodes.set(id, { ...existing, ...attrs })
  }

  const splitLabel = rawLabel => {
    const label = (rawLabel || '').trim()
    if (!label) return { label: null, type: null }
    const parts = label.split(/｜|\|/)
    if (parts.length > 1) {
      const [type, ...rest] = parts
      return { type: type?.trim() || null, label: rest.join('｜').trim() || null }
    }
    return { label, type: null }
  }

  for (const line of lines) {
    const classMatch = line.match(/^class\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_-]+);?/)
    if (classMatch) {
      classMap.set(classMatch[1], classMatch[2])
      continue
    }

    const edgeWithLabel = line.match(/^([A-Za-z0-9_]+)\s*--\s*([^>-]+?)\s*-->\s*([A-Za-z0-9_]+)/)
    if (edgeWithLabel) {
      const [, from, label, to] = edgeWithLabel
      ensureNode(from)
      ensureNode(to)
      edges.push({ from, to, label: label?.trim() || null, raw: line })
      continue
    }

    const edge = line.match(/^([A-Za-z0-9_]+)\s*[-.]+>\s*([A-Za-z0-9_]+)/)
    if (edge) {
      const [, from, to] = edge
      ensureNode(from)
      ensureNode(to)
      edges.push({ from, to, label: null, raw: line })
      continue
    }

    const nodeMatch = line.match(
      /^([A-Za-z0-9_]+)\s*(?:\[\s*\"?([^"]+?)\"?\s*\]|\(\(\s*\"?([^"]+?)\"?\s*\)\)|\(\s*\"?([^"]+?)\"?\s*\)|\{\s*\"?([^"]+?)\"?\s*\})/
    )
    if (nodeMatch) {
      const id = nodeMatch[1]
      const rawLabel = nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || ''
      const { label, type } = splitLabel(rawLabel)
      ensureNode(id, { label: label || null, type, rawLabel: rawLabel || null })
      continue
    }

    const standalone = line.match(/^([A-Za-z0-9_]+)/)
    if (standalone) ensureNode(standalone[1])
  }

  for (const [id, className] of classMap) {
    const node = nodes.get(id)
    if (node) node.className = className
    else nodes.set(id, { id, className })
  }

  return {
    raw: content,
    nodes: Array.from(nodes.values()),
    edges
  }
}

async function searchEmbeddings(embeddingsPath, query, limit = 10, offset = 0, { highlight = false } = {}) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
  if (!tokens.length) return []
  const raw = await fs.readFile(embeddingsPath, 'utf8')
  const payload = JSON.parse(raw)
  const items = Array.isArray(payload?.items) ? payload.items : []
  const scored = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const title = item.title || ''
    const text = item.text || ''
    const haystackTitle = title.toLowerCase()
    const haystackText = text.toLowerCase()
    let score = 0
    let bestHit = Number.POSITIVE_INFINITY

    for (const token of tokens) {
      const titleIdx = haystackTitle.indexOf(token)
      if (titleIdx !== -1) {
        score += 5 / (titleIdx + 1) // 标题命中权重更高
        bestHit = Math.min(bestHit, titleIdx)
      }
      const bodyIdx = haystackText.indexOf(token)
      if (bodyIdx !== -1) {
        score += 1.5 / (bodyIdx + 1)
        bestHit = Math.min(bestHit, title.length + 1 + bodyIdx)
      }
    }
    if (!score) continue
    const preview = text.slice(0, 200)
    const result = {
      url: item.url,
      title,
      lang: item.lang || '',
      preview,
      score
    }
    if (highlight) {
      const firstBodyMatch = tokens
        .map(token => haystackText.indexOf(token))
        .filter(idx => idx >= 0)
        .sort((a, b) => a - b)[0]
      const idx = firstBodyMatch ?? 0
      const start = Math.max(0, idx - 30)
      const end = Math.min(text.length, idx + (tokens[0]?.length || 0) + 80)
      result.highlight = text.slice(start, end) || preview
      result.tokens = tokens
    }
    scored.push(result)
  }
  scored.sort((a, b) => b.score - a.score)
  const sliced = scored.slice(offset, offset + limit)
  return sliced
}

const server = http.createServer(async (req, res) => {
if (!req.url || !req.method) return sendJson(res, 400, { error: 'bad request' })
  const pathname = new URL(req.url, 'http://localhost').pathname
  for (const route of routes) {
    if (route.method !== req.method) continue
    const match = pathname.match(route.pattern)
    if (!match) continue
    try {
      await route.handler(req, res, ...match.slice(1))
    } catch (error) {
      console.error('[api] route error', error)
      sendJson(res, 500, { error: 'internal error' })
    }
    return
  }
  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT} (DATA_ROOT=${DATA_ROOT})`)
})
function computeEtag(stat) {
  return `"${stat.size}-${Number(stat.mtimeMs).toString(16)}"`
}
