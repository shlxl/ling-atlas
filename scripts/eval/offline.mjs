#!/usr/bin/env node

/**
 * 离线检索评测
 * - 读取 data/gold.jsonl 的查询-相关文档标注
 * - 基于 docs/public/api/knowledge.json 构建检索候选
 * - 计算 nDCG@10 / MRR / Recall@10
 * - 与 scripts/eval/baseline.json 对比，低于基线则退出码 1
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const GOLD_PATH = path.join(ROOT, 'data', 'gold.jsonl')
const KNOWLEDGE_PATH = path.join(ROOT, 'docs', 'public', 'api', 'knowledge.json')
const BASELINE_PATH = path.join(__dirname, 'baseline.json')

const VARIANTS = ['lex', 'rrf', 'rrf-mmr']
const DEFAULT_TOP_K = 10
const RRF_K = 60

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s，。；、,.!?？!()（）：:]+/)
    .map(t => t.trim())
    .filter(Boolean)
}

function escapeRegex(token) {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function chunkScore(text, query, tokens) {
  if (!text) return 0
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let score = 0

  if (lowerText.includes(lowerQuery)) score += 8

  for (const token of tokens) {
    if (!token) continue
    const regex = new RegExp(escapeRegex(token), 'gi')
    const matches = lowerText.match(regex)
    if (matches) score += matches.length * 3
  }

  return score
}

function vectorize(text) {
  const vec = new Map()
  const tokens = tokenize(text)
  for (const token of tokens) {
    vec.set(token, (vec.get(token) || 0) + 1)
  }
  return vec
}

function cosine(vecA, vecB) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [, value] of vecA) {
    normA += value * value
  }
  for (const [, value] of vecB) {
    normB += value * value
  }
  if (!normA || !normB) return 0

  const keys = new Set([...vecA.keys(), ...vecB.keys()])
  for (const key of keys) {
    const a = vecA.get(key) || 0
    const b = vecB.get(key) || 0
    dot += a * b
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function rrfFuse(lexicalList, chunkList) {
  const combined = new Map()
  lexicalList.forEach((item, idx) => {
    const existing = combined.get(item.url) || { ...item, score: 0 }
    existing.score += 1 / (RRF_K + idx + 1)
    combined.set(item.url, existing)
  })
  chunkList.forEach((item, idx) => {
    const existing = combined.get(item.url) || { ...item, score: 0 }
    existing.score += 1 / (RRF_K + idx + 1)
    combined.set(item.url, existing)
  })
  return Array.from(combined.values()).sort((a, b) => b.score - a.score)
}

function mmrSelect(candidates, queryVec, top = DEFAULT_TOP_K, lambda = 0.7) {
  const pool = candidates.slice()
  const selected = []

  while (pool.length && selected.length < top) {
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i]
      const relevance = cand.score
      let diversity = 0
      if (cand.vector && selected.length) {
        for (const chosen of selected) {
          if (!chosen.vector) continue
          const sim = cosine(cand.vector, chosen.vector)
          if (sim > diversity) diversity = sim
        }
      }
      const mmrScore = lambda * relevance - (1 - lambda) * diversity
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }
    selected.push(pool.splice(bestIdx, 1)[0])
  }

  return selected
}

async function loadKnowledge() {
  const raw = await fs.readFile(KNOWLEDGE_PATH, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data?.items)) throw new Error('knowledge.json invalid format')
  return data.items
}

async function loadGold() {
  const raw = await fs.readFile(GOLD_PATH, 'utf8')
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

function buildScoredLists(query, knowledgeItems) {
  const tokens = tokenize(query)
  const entriesByUrl = new Map()

  for (const item of knowledgeItems) {
    const score = chunkScore(item.chunk, query, tokens)
    if (score <= 0) continue

    const info = entriesByUrl.get(item.url) || {
      url: item.url,
      title: item.title,
      excerpt: item.chunk,
      totalScore: 0,
      bestScore: 0,
      bestChunk: item.chunk,
      vector: null
    }

    info.totalScore += score
    if (score > info.bestScore) {
      info.bestScore = score
      info.bestChunk = item.chunk
      info.vector = vectorize(item.chunk)
      info.excerpt = item.chunk.length > 160 ? `${item.chunk.slice(0, 157)}…` : item.chunk
    }

    entriesByUrl.set(item.url, info)
  }

  const lexical = Array.from(entriesByUrl.values())
    .map(entry => ({
      url: entry.url,
      title: entry.title,
      excerpt: entry.excerpt,
      score: entry.totalScore,
      vector: entry.vector
    }))
    .sort((a, b) => b.score - a.score)

  const chunkList = Array.from(entriesByUrl.values())
    .map(entry => ({
      url: entry.url,
      title: entry.title,
      excerpt: entry.bestChunk.length > 160 ? `${entry.bestChunk.slice(0, 157)}…` : entry.bestChunk,
      score: entry.bestScore,
      vector: entry.vector
    }))
    .sort((a, b) => b.score - a.score)

  return { lexical, chunkList }
}

function getRanking(query, variant, knowledgeItems) {
  const { lexical, chunkList } = buildScoredLists(query, knowledgeItems)
  if (!lexical.length) return []

  if (variant === 'lex') {
    return lexical.slice(0, DEFAULT_TOP_K).map(item => item.url)
  }

  const fused = rrfFuse(lexical, chunkList)
  if (variant === 'rrf') {
    return fused.slice(0, DEFAULT_TOP_K).map(item => item.url)
  }

  const queryVec = vectorize(query)
  const mmr = mmrSelect(fused, queryVec, DEFAULT_TOP_K)
  return mmr.map(item => item.url)
}

function evaluateRanking(ranking, positives, k = DEFAULT_TOP_K) {
  const top = ranking.slice(0, k)
  const positiveSet = new Set(positives)
  if (!positiveSet.size) {
    return { ndcg: 0, mrr: 0, recall: 0 }
  }

  let dcg = 0
  let mrr = 0
  let hits = 0

  top.forEach((url, idx) => {
    if (!positiveSet.has(url)) return
    const rel = 1
    dcg += rel / Math.log2(idx + 2)
    hits += 1
    if (!mrr) {
      mrr = 1 / (idx + 1)
    }
  })

  const idealHits = Math.min(positiveSet.size, k)
  let idealDCG = 0
  for (let i = 0; i < idealHits; i++) {
    idealDCG += 1 / Math.log2(i + 2)
  }

  const ndcg = idealDCG ? dcg / idealDCG : 0
  const recall = hits / positiveSet.size
  return { ndcg, mrr, recall }
}

function aggregateMetrics(metricsList) {
  const total = metricsList.reduce(
    (acc, cur) => {
      acc.ndcg += cur.ndcg
      acc.mrr += cur.mrr
      acc.recall += cur.recall
      acc.count += 1
      return acc
    },
    { ndcg: 0, mrr: 0, recall: 0, count: 0 }
  )
  if (!total.count) return { ndcg: 0, mrr: 0, recall: 0 }
  return {
    ndcg: total.ndcg / total.count,
    mrr: total.mrr / total.count,
    recall: total.recall / total.count
  }
}

async function loadBaseline() {
  try {
    const raw = await fs.readFile(BASELINE_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function main() {
  const tolerance = Number(process.env.EVAL_TOLERANCE ?? '0')
  const knowledgeItems = await loadKnowledge()
  const gold = await loadGold()
  const baseline = await loadBaseline()

  const variantMetrics = {}
  for (const variant of VARIANTS) {
    const perQuery = []
    for (const item of gold) {
      const ranking = getRanking(item.q, variant, knowledgeItems)
      perQuery.push(evaluateRanking(ranking, item.positives || []))
    }
    variantMetrics[variant] = aggregateMetrics(perQuery)
  }

  console.log('Offline metrics (averaged):')
  console.table(
    Object.entries(variantMetrics).map(([variant, scores]) => ({
      variant,
      'nDCG@10': scores.ndcg.toFixed(4),
      MRR: scores.mrr.toFixed(4),
      'Recall@10': scores.recall.toFixed(4)
    }))
  )

  let passed = true
  for (const [variant, baselineScores] of Object.entries(baseline)) {
    const actual = variantMetrics[variant]
    if (!actual) continue
    for (const metric of ['ndcg', 'mrr', 'recall']) {
      const baselineValue = baselineScores[metric]
      if (typeof baselineValue !== 'number') continue
      if (actual[metric] + tolerance < baselineValue) {
        console.error(
          `[eval] ${variant} ${metric}=${actual[metric].toFixed(4)} fell below baseline ${baselineValue.toFixed(4)} (tol=${tolerance})`
        )
        passed = false
      }
    }
  }

  if (!passed) {
    process.exitCode = 1
    return
  }

  console.log('[eval] metrics meet or exceed baseline thresholds.')
}

main().catch(err => {
  console.error('[eval] failed:', err)
  process.exitCode = 1
})
