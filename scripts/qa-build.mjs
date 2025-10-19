#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLocaleDocuments } from './ai/content.mjs'
import { ensureDir, logStructured, readJSONIfExists, resolveAdapterSpec } from './ai/utils.mjs'
import { loadQAAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'qa.json')

async function main() {
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

  const adapterInfo = await loadQAAdapter(spec, console)
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

  let adapterModule = adapterInfo.adapter
  let usedName = adapterInfo.adapterName
  let usedModel = adapterInfo.model
  let usedFallback = adapterInfo.isFallback
  let result

  try {
    result = await adapterModule.buildQA({ documents, model: usedModel, logger: console })
  } catch (error) {
    const message = error?.message || String(error)
    logStructured(
      'ai.qa.adapter.error',
      { adapter: usedName, model: usedModel, message },
      console
    )
    console.warn(`[qa-build] adapter "${usedName}" 执行失败：${message}，已降级至 placeholder`)
    const fallback = await loadQAAdapter('placeholder', console)
    adapterModule = fallback.adapter
    usedName = 'placeholder'
    usedModel = null
    usedFallback = true
    result = await adapterModule.buildQA({ documents, model: null, logger: console })
  }

  let finalItems = Array.isArray(result?.items) ? result.items : []
  let reusedCache = false

  if ((!Array.isArray(finalItems) || finalItems.length === 0) && Array.isArray(previous?.items) && previous.items.length > 0) {
    finalItems = previous.items
    reusedCache = true
    console.warn('[qa-build] 本次未生成问答对，已沿用缓存结果')
  }

  const sortedItems = finalItems.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        items: sortedItems
      },
      null,
      2
    ),
    'utf8'
  )

  const mode = usedFallback
    ? '占位模式'
    : `adapter: ${usedName}${usedModel ? ` (${usedModel})` : ''}`
  logStructured(
    'ai.qa.completed',
    {
      adapter: usedName,
      model: usedModel,
      fallback: usedFallback,
      cacheReuse: reusedCache,
      count: sortedItems.length
    },
    console
  )
  console.log(`[qa-build] qa.json 写入 ${sortedItems.length} 篇文档的问答对（${mode}${reusedCache ? '，命中缓存' : ''}）`)
}

main().catch(err => {
  console.error('[qa-build] failed:', err)
  process.exitCode = 1
})
