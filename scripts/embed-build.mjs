#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectEmbeddableItems } from './ai/content.mjs'
import {
  ensureDir,
  flushAIEvents,
  logStructured,
  readJSONIfExists,
  resolveAdapterSpec
} from './ai/utils.mjs'
import { loadEmbeddingAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'
import { createAiEventRecorder } from './ai/event-logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'embeddings.json')

async function main() {
  const scriptStartedAt = Date.now()
  const preferredLocale = getPreferredLocale()
  const items = await collectEmbeddableItems(LOCALE_REGISTRY, preferredLocale)
  await ensureDir(OUTPUT_DIR)

  const spec = resolveAdapterSpec({ envKey: 'AI_EMBED_MODEL', cliFlag: 'adapter' })
  const previous = await readJSONIfExists(OUTPUT_FILE)

  const events = []

  events.push(
    logStructured(
      'ai.embed.start',
      {
        inputCount: items.length,
        preferredLocale,
        localeCount: LOCALE_REGISTRY.length,
        requestedAdapter: spec || 'placeholder'
      },
      console
    )
  )

  const adapterInfo = await loadEmbeddingAdapter(spec, console)
  events.push(
    logStructured(
      'ai.embed.adapter.resolved',
      {
        requested: spec || 'placeholder',
        adapter: adapterInfo.adapterName,
        model: adapterInfo.model,
        fallback: adapterInfo.isFallback,
        reason: adapterInfo.reason || null
      },
      console
    )
  )

  let adapterModule = adapterInfo.adapter
  let usedName = adapterInfo.adapterName
  let usedModel = adapterInfo.model
  let usedFallback = adapterInfo.isFallback
  let result
  let retries = 0

  const inferenceStartedAt = Date.now()

  try {
    result = await adapterModule.generateEmbeddings({ items, model: usedModel, logger: console })
  } catch (error) {
    const message = error?.message || String(error)
    events.push(
      logStructured(
        'ai.embed.adapter.error',
        { adapter: usedName, model: usedModel, message },
        console
      )
    )
    console.warn(`[embed-build] adapter "${usedName}" 执行失败：${message}，已降级至 placeholder`)
    const fallback = await loadEmbeddingAdapter('placeholder', console)
    adapterModule = fallback.adapter
    usedName = 'placeholder'
    usedModel = null
    usedFallback = true
    retries += 1
    result = await adapterModule.generateEmbeddings({ items, model: null, logger: console })
  }

async function buildItems() {
  const items = []
  const localeSummaries = []

  for (const source of LANG_SOURCES) {
    if (!(await exists(source.dir))) {
      localeSummaries.push({ locale: source.code, status: 'missing', totalFiles: 0, included: 0 })
      continue
    }

    const files = await globby('**/index.md', { cwd: source.dir, absolute: true })
    let included = 0

    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8')
      const { data, content } = matter(raw)
      if (isDraft(data)) continue
      const url = buildUrl(file, source)
      const title = String(data.title || '').trim()
      if (!title) continue
      const text = extractText(data, content)
      if (!text) continue
      items.push({ url, title, text, lang: source.code })
      included += 1
    }

    localeSummaries.push({
      locale: source.code,
      status: included > 0 ? 'ok' : 'empty',
      totalFiles: files.length,
      included
    })
  }

  return {
    items: items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    locales: localeSummaries
  }
}

  if ((!Array.isArray(finalItems) || finalItems.length === 0) && Array.isArray(previous?.items) && previous.items.length > 0) {
    finalItems = previous.items
    reusedCache = true
    console.warn('[embed-build] 本次生成为空，已沿用缓存文件中的向量结果')
  }

const EMBED_ADAPTER = process.env.AI_EMBED_ADAPTER || 'placeholder'

function durationFrom(start) {
  const diff = process.hrtime.bigint() - start
  return Number(diff / 1000000n)
}

async function main() {
  const runLogger = createAiEventRecorder({ script: 'embed-build', namespace: 'ai.embed' })
  const started = process.hrtime.bigint()
  runLogger.record('ai.embed.started', {
    status: 'running',
    adapter: EMBED_ADAPTER,
    localesPlanned: LANG_SOURCES.length
  })

  try {
    const { items, locales } = await buildItems()
    await ensureDir(OUTPUT_DIR)
    const payload = {
      generatedAt: new Date().toISOString(),
      items
    }
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8')
    const durationMs = durationFrom(started)
    runLogger.record('ai.embed.completed', {
      status: 'success',
      adapter: EMBED_ADAPTER,
      durationMs,
      itemsProcessed: items.length,
      outputPath: OUTPUT_FILE,
      locales
    })
    console.log(`embeddings.json 写入 ${items.length} 条（占位文本模式）`)
  } catch (error) {
    runLogger.record('ai.embed.failed', {
      status: 'failed',
      adapter: EMBED_ADAPTER,
      durationMs: durationFrom(started),
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error)
    })
    throw error
  } finally {
    await runLogger.flush()
  }
}

main().catch(err => {
  console.error('[embed-build] failed:', err)
  process.exitCode = 1
})
