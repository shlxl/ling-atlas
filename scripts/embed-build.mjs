#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectEmbeddableItems } from './ai/content.mjs'
import { ensureDir } from './ai/utils.mjs'
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

  const adapterInfo = await loadEmbeddingAdapter(process.env.AI_EMBED_MODEL, console)
  let adapterModule = adapterInfo.adapter
  let usedName = adapterInfo.adapterName
  let usedModel = adapterInfo.model
  let usedFallback = adapterInfo.isFallback
  let result

  try {
    result = await adapterModule.generateEmbeddings({ items, model: usedModel, logger: console })
  } catch (error) {
    const message = error?.message || String(error)
    console.warn(`[embed-build] adapter "${usedName}" 执行失败：${message}，已降级至 placeholder`)
    const fallback = await loadEmbeddingAdapter('placeholder', console)
    adapterModule = fallback.adapter
    usedName = 'placeholder'
    usedModel = null
    usedFallback = true
    result = await adapterModule.generateEmbeddings({ items, model: null, logger: console })
  }

  const finalItems = Array.isArray(result?.items) ? result.items : items
  const payload = {
    generatedAt: new Date().toISOString(),
    items: finalItems
  }
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8')

  const mode = usedFallback
    ? '占位文本模式'
    : `adapter: ${usedName}${usedModel ? ` (${usedModel})` : ''}`
  console.log(`[embed-build] embeddings.json 写入 ${finalItems.length} 条（${mode}）`)
}

main().catch(err => {
  console.error('[embed-build] failed:', err)
  process.exitCode = 1
})
