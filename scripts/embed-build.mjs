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
  resolveAdapterSpec,
  installEpipeHandlers,
  configureOrtLogging
} from './ai/utils.mjs'
import { loadEmbeddingAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'embeddings.json')

async function main() {
  installEpipeHandlers()
  configureOrtLogging('3')
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

  const inferenceDurationMs = Date.now() - inferenceStartedAt

  let finalItems = Array.isArray(result?.items) ? result.items : items
  let reusedCache = false

  if ((!Array.isArray(finalItems) || finalItems.length === 0) && Array.isArray(previous?.items) && previous.items.length > 0) {
    finalItems = previous.items
    reusedCache = true
    console.warn('[embed-build] 本次生成为空，已沿用缓存文件中的向量结果')
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    items: finalItems
  }
  const serialized = JSON.stringify(payload, null, 2)
  const writeStartedAt = Date.now()
  await fs.writeFile(OUTPUT_FILE, serialized, 'utf8')
  const writeDurationMs = Date.now() - writeStartedAt
  const relativeTarget = path.relative(ROOT, OUTPUT_FILE)
  const batchCount = 1
  const successRate = items.length === 0
    ? 1
    : Number((finalItems.length / items.length).toFixed(4))

  events.push(
    logStructured(
      'ai.embed.batch',
      {
        index: 0,
        durationMs: inferenceDurationMs,
        inputCount: items.length,
        outputCount: finalItems.length,
        successRate,
        adapter: usedName,
        model: usedModel,
        fallback: usedFallback,
        retries
      },
      console
    )
  )

  events.push(
    logStructured(
      'ai.embed.write',
      {
        target: relativeTarget,
        bytes: Buffer.byteLength(serialized, 'utf8'),
        durationMs: writeDurationMs,
        items: finalItems.length,
        cacheReuse: reusedCache
      },
      console
    )
  )

  const mode = usedFallback
    ? '占位文本模式'
    : `adapter: ${usedName}${usedModel ? ` (${usedModel})` : ''}`
  events.push(
    logStructured(
      'ai.embed.complete',
      {
        adapter: usedName,
        model: usedModel,
        fallback: usedFallback,
        cacheReuse: reusedCache,
        count: finalItems.length,
        inputCount: items.length,
        outputCount: finalItems.length,
        successRate,
        totalMs: Date.now() - scriptStartedAt,
        inferenceMs: inferenceDurationMs,
        writeMs: writeDurationMs,
        batchCount,
        target: relativeTarget,
        retries
      },
      console
    )
  )
  await flushAIEvents('embed', events, console)
  console.log(`[embed-build] embeddings.json 写入 ${finalItems.length} 条（${mode}${reusedCache ? '，命中缓存' : ''}）`)
}

main().catch(err => {
  console.error('[embed-build] failed:', err)
  process.exitCode = 1
})
