#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { resolveNeo4jConfig, getScriptName } from './config.mjs'
import { createDriver, verifyConnectivity } from './neo4j-client.mjs'
import { searchHybrid } from './vector-search.mjs'
import { fetchSubgraph } from './retrieval/subgraph.mjs'
import { fetchTopN } from './retrieval/topn.mjs'
import { appendGraphragMetric } from './telemetry.mjs'

const VALUE_OPTIONS = new Map([
  ['--input', 'input'],
  ['--output', 'output'],
  ['--kind', 'kind'],
  ['--value', 'value'],
  ['--question', 'value'],
  ['--doc-id', 'docId'],
  ['--max-hops', 'maxHops'],
  ['--limit', 'limit'],
  ['--node-limit', 'nodeLimit'],
  ['--edge-limit', 'edgeLimit']
])

const BOOLEAN_OPTIONS = new Map([['--pretty', 'pretty']])

function collectMultiArgs(args, key) {
  const values = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === key) {
      const next = args[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`参数 ${key} 需要显式取值`)
      }
      values.push(next)
      i += 1
    }
  }
  return values
}

function parseArgs(rawArgs) {
  const options = {
    pretty: false
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index]

    if (VALUE_OPTIONS.has(token)) {
      const key = VALUE_OPTIONS.get(token)
      const next = rawArgs[index + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`参数 ${token} 需要显式取值`)
      }
      options[key] = next
      index += 1
      continue
    }

    if (BOOLEAN_OPTIONS.has(token)) {
      const key = BOOLEAN_OPTIONS.get(token)
      options[key] = true
      continue
    }
  }

  options.includeLabels = collectMultiArgs(rawArgs, '--include-label')
  options.includeEdgeTypes = collectMultiArgs(rawArgs, '--include-edge-type')

  return options
}

async function readJson(source) {
  if (!source || source === '-') {
    const chunks = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk)
    }
    if (!chunks.length) return null
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  const content = await readFile(source, 'utf8')
  return JSON.parse(content)
}

function docIdToUrl(docId, fallbackUrl = null) {
  if (fallbackUrl) return fallbackUrl
  if (!docId) return null
  const normalized = docId.replace(/^\/+/, '')
  if (normalized.endsWith('.html')) {
    return `/${normalized}`
  }
  return `/${normalized}.html`
}

function normalizeNumber(value, precision = 4) {
  if (!Number.isFinite(value)) return null
  return Number(value.toFixed(precision))
}

function uniquePush(map, doc) {
  if (!doc || !doc.id) return
  if (!map.has(doc.id)) {
    map.set(doc.id, doc)
  } else {
    const existing = map.get(doc.id)
    const mergedReasons = new Set([...(existing.reasons ?? []), ...(doc.reasons ?? [])])
    existing.reasons = Array.from(mergedReasons)
    if (doc.source && !existing.source) existing.source = doc.source
    if (doc.rank != null && existing.rank == null) existing.rank = doc.rank
    if (doc.score != null) {
      existing.score = existing.score != null ? Math.max(existing.score, doc.score) : doc.score
    }
  }
}

function mapHybridDocs(items = []) {
  return items.map((item, index) => ({
    id: item.doc_id,
    title: item.title ?? item.doc_id,
    url: docIdToUrl(item.doc_id, item.url),
    locale: item.locale ?? null,
    score: normalizeNumber(item.score),
    rank: index + 1,
    vectorScore: normalizeNumber(item.vector_score),
    structureScore: normalizeNumber(item.structure_score),
    scoreComponents: item.score_components ?? null,
    tags: item.tags ?? [],
    categories: item.categories ?? [],
    updatedAt: item.updated_at ?? null,
    reasons: Array.isArray(item.reasons) ? item.reasons : [],
    structureDetail: item.structure_detail ?? null,
    source: 'hybrid'
  }))
}

function mapTopnDocs(items = []) {
  return items.map((item, index) => ({
    id: item.doc_id,
    title: item.title ?? item.doc_id,
    url: docIdToUrl(item.doc_id),
    score: normalizeNumber(item.score),
    rank: index + 1,
    tags: item.tags ?? [],
    categories: item.categories ?? [],
    updatedAt: item.updated_at ?? null,
    reasons: Array.isArray(item.reasons) ? item.reasons : [],
    source: 'topn'
  }))
}

function extractStructureScores(data = {}) {
  const result = {}
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('gnn_')) continue
    const num = Number(value)
    if (Number.isFinite(num)) {
      result[key] = num
    }
  }
  return result
}

function mapGraph(subgraph) {
  if (!subgraph || !Array.isArray(subgraph.nodes)) {
    return { nodes: [], edges: [], stats: null, constraints: null, docNode: null }
  }

  const nodes = subgraph.nodes.map((node) => {
    const labels = Array.isArray(node.labels) ? node.labels : []
    const data = node.properties ?? {}
    const base = {
      id: node.identity,
      labels,
      hop: Number.isFinite(node.hop) ? node.hop : 0,
      properties: data
    }

    if (labels.includes('Doc')) {
      base.type = 'doc'
      base.title = data.title ?? data.id ?? node.identity
      base.locale = data.locale ?? null
      base.updatedAt = data.updated_at ?? data.updated ?? null
      base.structure = extractStructureScores(data)
      base.id = data.id ?? node.identity
    } else if (labels.includes('Entity')) {
      base.type = data.type ?? 'Entity'
      base.name = data.name ?? data.id ?? node.identity
      base.salience = Number.isFinite(data.salience) ? data.salience : null
      base.structure = extractStructureScores(data)
    } else if (labels.includes('Category')) {
      base.type = 'category'
      base.name = data.name ?? null
    } else if (labels.includes('Tag')) {
      base.type = 'tag'
      base.name = data.name ?? null
    } else {
      base.type = labels[0] ?? 'node'
      base.name = data.name ?? data.title ?? null
    }

    return base
  })

  const docNode = nodes.find((node) => (node.labels ?? []).includes('Doc')) ?? null

  const edges = Array.isArray(subgraph.edges)
    ? subgraph.edges.map((edge) => ({
        id: edge.identity,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        properties: edge.properties ?? {}
      }))
    : []

  return {
    nodes,
    edges,
    stats: subgraph.stats ?? null,
    constraints: subgraph.constraints ?? null,
    docNode
  }
}

function buildEvidence(docs = []) {
  return docs.slice(0, 5).map((doc) => ({
    docId: doc.id,
    title: doc.title,
    reason: doc.reasons?.[0] ?? null,
    score: doc.score ?? null,
    source: doc.source ?? 'unknown'
  }))
}

function summarizeTelemetry({ kind, question, docs, graph, durationMs, sources }) {
  const nodes = graph?.nodes?.length ?? 0
  const edges = graph?.edges?.length ?? 0
  const truncatedNodes = Boolean(graph?.stats?.nodes?.truncated)
  const truncatedEdges = Boolean(graph?.stats?.edges?.truncated)
  return {
    type: 'explore',
    mode: kind,
    question: kind === 'question' ? question ?? null : null,
    docId: graph?.docNode?.properties?.id ?? null,
    docs: docs.length,
    nodes,
    edges,
    truncatedNodes,
    truncatedEdges,
    durationMs,
    sources: sources ?? []
  }
}

async function writeOutput(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
  console.log(`已写入 ${filePath}`)
}

async function explore({ kind, question, docId, params, limit, driver, database }) {
  const docsMap = new Map()
  let hybridMeta = null
  let pivotDocId = docId ?? null

  if (kind === 'question') {
    if (!question) {
      throw new Error('question 模式需要提供问题文本 (--value 或 payload.question)')
    }
    const hybrid = await searchHybrid(driver, database, {
      question,
      limit,
      sources: params.sources,
      alpha: params.alpha
    })
    hybridMeta = hybrid.meta ?? null
    const hybridDocs = mapHybridDocs(hybrid.items ?? [])
    for (const doc of hybridDocs) {
      uniquePush(docsMap, doc)
    }
    if (!pivotDocId && hybridDocs.length) {
      pivotDocId = hybridDocs[0].id
    }
  } else if (kind === 'doc') {
    if (!pivotDocId) {
      throw new Error('doc 模式需要通过 --doc-id 或 payload.docId 指定文档')
    }
  } else {
    throw new Error(`暂不支持的 kind：${kind}`)
  }

  let graph = null
  let subgraph = null

  if (pivotDocId) {
    subgraph = await fetchSubgraph(driver, database, {
      docId: pivotDocId,
      entityNames: params.entityNames?.length ? params.entityNames : undefined,
      allowedLabels: params.includeLabels?.length ? params.includeLabels : undefined,
      relationshipTypes: params.includeEdgeTypes?.length ? params.includeEdgeTypes : undefined,
      maxHops: params.maxHops,
      nodeLimit: params.nodeLimit,
      edgeLimit: params.edgeLimit
    })
    graph = mapGraph(subgraph)

    if (graph.docNode) {
      const baseDoc = {
        id: graph.docNode.properties?.id ?? pivotDocId,
        title: graph.docNode.title ?? graph.docNode.properties?.title ?? pivotDocId,
        url: docIdToUrl(graph.docNode.properties?.id ?? pivotDocId),
        locale: graph.docNode.locale ?? null,
        updatedAt: graph.docNode.updatedAt ?? null,
        tags: [],
        categories: [],
        reasons: [],
        source: kind === 'doc' ? 'seed' : 'subgraph'
      }
      uniquePush(docsMap, baseDoc)
    }
  }

  const entityNamesFromGraph = graph
    ? graph.nodes
        .filter((node) => Array.isArray(node.labels) && node.labels.includes('Entity'))
        .map((node) => node.properties?.name ?? node.properties?.id ?? node.name)
        .filter(Boolean)
    : []

  if (entityNamesFromGraph.length) {
    const topn = await fetchTopN(driver, database, {
      entityNames: entityNamesFromGraph.slice(0, 12),
      category: params.category ?? null,
      language: params.language ?? null,
      limit: Math.max(limit ?? 5, 5)
    })
    const topnDocs = mapTopnDocs(topn.items ?? [])
    for (const doc of topnDocs) {
      if (doc.id === pivotDocId) continue
      uniquePush(docsMap, doc)
    }
  }

  const docs = Array.from(docsMap.values()).sort((a, b) => {
    if (a.rank != null && b.rank != null) {
      return a.rank - b.rank
    }
    if (a.rank != null) return -1
    if (b.rank != null) return 1
    const aScore = Number.isFinite(a.score) ? a.score : -Infinity
    const bScore = Number.isFinite(b.score) ? b.score : -Infinity
    return bScore - aScore
  })

  const evidence = buildEvidence(docs)

  const response = {
    query: {
      kind,
      value: kind === 'question' ? question : graph?.docNode?.title ?? pivotDocId ?? null,
      docId: pivotDocId ?? null,
      params: {
        maxHops: params.maxHops,
        nodeLimit: params.nodeLimit,
        edgeLimit: params.edgeLimit,
        includeLabels: params.includeLabels ?? [],
        includeEdgeTypes: params.includeEdgeTypes ?? []
      },
      timestamp: new Date().toISOString()
    },
    docs,
    graph: graph
      ? {
          nodes: graph.nodes,
          edges: graph.edges,
          stats: graph.stats,
          constraints: graph.constraints
        }
      : null,
    evidence,
    telemetry: {
      hybrid: hybridMeta,
      durationMs: null,
      sources: hybridMeta?.sources ?? ['vector']
    }
  }

  return { response, graph }
}

async function main() {
  const scriptName = getScriptName(import.meta.url)
  const rawArgs = process.argv.slice(2)
  const options = parseArgs(rawArgs)

  const payload = options.input ? await readJson(options.input) : null
  const payloadParams = payload?.params ?? {}

  const kind = (options.kind ?? payload?.kind ?? (options.docId || payload?.docId ? 'doc' : 'question')).toLowerCase()
  const question = options.value ?? payload?.value ?? payload?.question ?? null
  const docId = options.docId ?? payload?.docId ?? payload?.targetDocId ?? null
  const limit = options.limit ? Number.parseInt(options.limit, 10) : payload?.limit ?? 5

  const params = {
    maxHops: options.maxHops ?? payloadParams.maxHops ?? undefined,
    nodeLimit: options.nodeLimit ?? payloadParams.nodeLimit ?? undefined,
    edgeLimit: options.edgeLimit ?? payloadParams.edgeLimit ?? undefined,
    includeLabels: options.includeLabels?.length ? options.includeLabels : payloadParams.includeLabels ?? [],
    includeEdgeTypes: options.includeEdgeTypes?.length ? options.includeEdgeTypes : payloadParams.includeEdgeTypes ?? [],
    entityNames: payloadParams.entityNames ?? [],
    sources: payloadParams.sources ?? undefined,
    alpha: payloadParams.alpha ?? undefined,
    category: payloadParams.category ?? null,
    language: payloadParams.language ?? payloadParams.locale ?? null
  }

  if (typeof params.maxHops === 'string') {
    const parsed = Number.parseInt(params.maxHops, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error('`maxHops` 需要大于 0 的整数')
    }
    params.maxHops = parsed
  }
  if (typeof params.nodeLimit === 'string') {
    const parsed = Number.parseInt(params.nodeLimit, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error('`nodeLimit` 需要大于 0 的整数')
    }
    params.nodeLimit = parsed
  }
  if (typeof params.edgeLimit === 'string') {
    const parsed = Number.parseInt(params.edgeLimit, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error('`edgeLimit` 需要大于 0 的整数')
    }
    params.edgeLimit = parsed
  }

  const neo4jConfig = resolveNeo4jConfig(rawArgs, { requirePassword: true })
  const driver = createDriver(neo4jConfig)
  const startedAt = Date.now()
  let telemetryRecord = null

  try {
    await verifyConnectivity(driver)
    const { response, graph } = await explore({
      kind,
      question,
      docId,
      params,
      limit,
      driver,
      database: neo4jConfig.database
    })

    const durationMs = Date.now() - startedAt
    response.telemetry.durationMs = durationMs

    telemetryRecord = summarizeTelemetry({
      kind,
      question,
      docs: response.docs,
      graph,
      durationMs,
      sources: response.telemetry.sources
    })

    const serialized = JSON.stringify(response, null, options.pretty ? 2 : undefined)
    if (options.output) {
      await writeOutput(path.resolve(options.output), `${serialized}\n`)
    } else {
      process.stdout.write(`${serialized}\n`)
    }
  } finally {
    await driver.close()
    if (telemetryRecord) {
      await appendGraphragMetric(telemetryRecord, { limit: 200 }).catch((error) => {
        console.warn(`[${scriptName}] telemetry 写入失败：${error?.message || error}`)
      })
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
