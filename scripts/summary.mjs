#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLocaleDocuments } from './ai/content.mjs'
import { ensureDir } from './ai/utils.mjs'
import { loadSummaryAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'summaries.json')

async function main() {
  const preferredLocale = getPreferredLocale()
  const preferredLocaleConfig =
    LOCALE_REGISTRY.find(locale => locale.code === preferredLocale) || LOCALE_REGISTRY[0]

  if (!preferredLocaleConfig) {
    console.warn('[summary] no locale configuration available, skipping generation')
    return
  }

  const documents = await collectLocaleDocuments(preferredLocaleConfig)
  await ensureDir(OUTPUT_DIR)

  const adapterInfo = await loadSummaryAdapter(process.env.AI_SUMMARY_MODEL, console)
  let adapterModule = adapterInfo.adapter
  let usedName = adapterInfo.adapterName
  let usedModel = adapterInfo.model
  let usedFallback = adapterInfo.isFallback
  let result

  try {
    result = await adapterModule.summarize({ documents, model: usedModel, logger: console })
  } catch (error) {
    const message = error?.message || String(error)
    console.warn(`[summary] adapter "${usedName}" 执行失败：${message}，已降级至 placeholder`)
    const fallback = await loadSummaryAdapter('placeholder', console)
    adapterModule = fallback.adapter
    usedName = 'placeholder'
    usedModel = null
    usedFallback = true
    result = await adapterModule.summarize({ documents, model: null, logger: console })
  }

  const finalItems = Array.isArray(result?.items) ? result.items : []
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
  console.log(`[summary] summaries.json 写入 ${sortedItems.length} 条（${mode}）`)
}

main().catch(err => {
  console.error('[summary] failed:', err)
  process.exitCode = 1
})
