#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectEmbeddableItems } from './ai/content.mjs'
import { ensureDir, logStructured, readJSONIfExists, resolveAdapterSpec } from './ai/utils.mjs'
import { loadEmbeddingAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'embeddings.json')

async function main() {
  const preferredLocale = getPreferredLocale()
  const items = await collectEmbeddableItems(LOCALE_REGISTRY, preferredLocale)
  await ensureDir(OUTPUT_DIR)

  const spec = resolveAdapterSpec({ envKey: 'AI_EMBED_MODEL', cliFlag: 'adapter' })
  const previous = await readJSONIfExists(OUTPUT_FILE)

  const adapterInfo = await loadEmbeddingAdapter(spec, console)
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

  let adapterModule = adapterInfo.adapter
  let usedName = adapterInfo.adapterName
  let usedModel = adapterInfo.model
  let usedFallback = adapterInfo.isFallback
  let result

  try {
    result = await adapterModule.generateEmbeddings({ items, model: usedModel, logger: console })
  } catch (error) {
    const message = error?.message || String(error)
    logStructured(
      'ai.embed.adapter.error',
      { adapter: usedName, model: usedModel, message },
      console
    )
    console.warn(`[embed-build] adapter "${usedName}" 执行失败：${message}，已降级至 placeholder`)
    const fallback = await loadEmbeddingAdapter('placeholder', console)
    adapterModule = fallback.adapter
    usedName = 'placeholder'
    usedModel = null
    usedFallback = true
    result = await adapterModule.generateEmbeddings({ items, model: null, logger: console })
  }

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
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8')

  const mode = usedFallback
    ? '占位文本模式'
    : `adapter: ${usedName}${usedModel ? ` (${usedModel})` : ''}`
  logStructured(
    'ai.embed.completed',
    {
      adapter: usedName,
      model: usedModel,
      fallback: usedFallback,
      cacheReuse: reusedCache,
      count: finalItems.length
    },
    console
  )
  console.log(`[embed-build] embeddings.json 写入 ${finalItems.length} 条（${mode}${reusedCache ? '，命中缓存' : ''}）`)
}

main().catch(err => {
  console.error('[embed-build] failed:', err)
  process.exitCode = 1
})
