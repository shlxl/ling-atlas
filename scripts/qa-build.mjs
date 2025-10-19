#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLocaleDocuments } from './ai/content.mjs'
import {
  ensureDir,
  flushAIEvents,
  logStructured,
  readJSONIfExists,
  resolveAdapterSpec
} from './ai/utils.mjs'
import { loadQAAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'qa.json')

async function main() {
  const scriptStartedAt = Date.now()
  const preferredLocale = getPreferredLocale()
  const preferredLocaleConfig =
    LOCALE_REGISTRY.find(locale => locale.code === preferredLocale) || LOCALE_REGISTRY[0]

  if (!preferredLocaleConfig) {
    console.warn('[qa-build] no locale configuration available, skipping generation')
    return
  }

  const documents = await collectLocaleDocuments(preferredLocaleConfig)
  await ensureDir(OUTPUT_DIR)

  const cliSpec = resolveAdapterSpec({ envKey: null, cliFlag: 'adapter' })
  const spec = cliSpec || process.env.AI_QA_MODEL || process.env.AI_SUMMARY_MODEL
  const previous = await readJSONIfExists(OUTPUT_FILE)

  const events = []

  events.push(
    logStructured(
      'ai.qa.start',
      {
        locale: preferredLocaleConfig.code,
        inputCount: documents.length,
        requestedAdapter: spec || 'placeholder'
      },
      console
    )
  )

  const adapterInfo = await loadQAAdapter(spec, console)
  events.push(
    logStructured(
      'ai.qa.adapter.resolved',
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
    result = await adapterModule.buildQA({ documents, model: usedModel, logger: console })
  } catch (error) {
    const message = error?.message || String(error)
    events.push(
      logStructured(
        'ai.qa.adapter.error',
        { adapter: usedName, model: usedModel, message },
        console
      )
    )
    console.warn(`[qa-build] adapter "${usedName}" 执行失败：${message}，已降级至 placeholder`)
    const fallback = await loadQAAdapter('placeholder', console)
    adapterModule = fallback.adapter
    usedName = 'placeholder'
    usedModel = null
    usedFallback = true
    retries += 1
    result = await adapterModule.buildQA({ documents, model: null, logger: console })
  }

  const inferenceDurationMs = Date.now() - inferenceStartedAt

  let finalItems = Array.isArray(result?.items) ? result.items : []
  let reusedCache = false

  if ((!Array.isArray(finalItems) || finalItems.length === 0) && Array.isArray(previous?.items) && previous.items.length > 0) {
    finalItems = previous.items
    reusedCache = true
    console.warn('[qa-build] 本次未生成问答对，已沿用缓存结果')
  }

  const sortedItems = finalItems.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))

  const payload = {
    generatedAt: new Date().toISOString(),
    items: sortedItems
  }
  const serialized = JSON.stringify(payload, null, 2)
  const writeStartedAt = Date.now()
  await fs.writeFile(OUTPUT_FILE, serialized, 'utf8')
  const writeDurationMs = Date.now() - writeStartedAt

  const relativeTarget = path.relative(ROOT, OUTPUT_FILE)
  const successRate = documents.length === 0 ? 1 : Number((sortedItems.length / documents.length).toFixed(4))
  const batchCount = 1

  events.push(
    logStructured(
      'ai.qa.batch',
      {
        index: 0,
        durationMs: inferenceDurationMs,
        inputCount: documents.length,
        outputCount: sortedItems.length,
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
      'ai.qa.write',
      {
        target: relativeTarget,
        bytes: Buffer.byteLength(serialized, 'utf8'),
        durationMs: writeDurationMs,
        items: sortedItems.length,
        cacheReuse: reusedCache
      },
      console
    )
  )

  const mode = usedFallback
    ? '占位模式'
    : `adapter: ${usedName}${usedModel ? ` (${usedModel})` : ''}`
  events.push(
    logStructured(
      'ai.qa.complete',
      {
        adapter: usedName,
        model: usedModel,
        fallback: usedFallback,
        cacheReuse: reusedCache,
        count: sortedItems.length,
        inputCount: documents.length,
        outputCount: sortedItems.length,
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
  await flushAIEvents('qa', events, console)
  console.log(`[qa-build] qa.json 写入 ${sortedItems.length} 篇文档的问答对（${mode}${reusedCache ? '，命中缓存' : ''}）`)
}

main().catch(err => {
  console.error('[qa-build] failed:', err)
  process.exitCode = 1
})
