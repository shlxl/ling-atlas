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
import { loadSummaryAdapter } from './ai/adapters/index.mjs'
import { LOCALE_REGISTRY, getPreferredLocale } from './pagegen.locales.mjs'
import { createAiEventRecorder } from './ai/event-logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const preferredLocale = getPreferredLocale()
const preferredLocaleConfig =
  LOCALE_REGISTRY.find(locale => locale.code === preferredLocale) || LOCALE_REGISTRY[0]

const SUMMARY_ADAPTER = process.env.AI_SUMMARY_ADAPTER || 'placeholder'

const CONTENT_DIR = preferredLocaleConfig?.contentDir
const BASE_PATH = preferredLocaleConfig?.basePath
const OUTPUT_DIR = path.join(ROOT, 'docs', 'public', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'summaries.json')

async function main() {
  const scriptStartedAt = Date.now()
  const preferredLocale = getPreferredLocale()
  const preferredLocaleConfig =
    LOCALE_REGISTRY.find(locale => locale.code === preferredLocale) || LOCALE_REGISTRY[0]

  if (!preferredLocaleConfig) {
    console.warn('[summary] no locale configuration available, skipping generation')
    return
  }

  const documents = await collectLocaleDocuments(preferredLocaleConfig)
  await ensureDir(OUTPUT_DIR)

  const spec = resolveAdapterSpec({ envKey: 'AI_SUMMARY_MODEL', cliFlag: 'adapter' })
  const previous = await readJSONIfExists(OUTPUT_FILE)

  const events = []

  events.push(
    logStructured(
      'ai.summary.start',
      {
        locale: preferredLocaleConfig.code,
        inputCount: documents.length,
        requestedAdapter: spec || 'placeholder'
      },
      console
    )
  )

function durationFrom(start) {
  const diff = process.hrtime.bigint() - start
  return Number(diff / 1000000n)
}

async function main() {
  const runLogger = createAiEventRecorder({ script: 'summary', namespace: 'ai.summary' })
  const started = process.hrtime.bigint()
  runLogger.record('ai.summary.started', {
    status: 'running',
    adapter: SUMMARY_ADAPTER,
    preferredLocale,
    hasLocaleConfig: Boolean(preferredLocaleConfig)
  })

  if (!preferredLocaleConfig || !CONTENT_DIR || !BASE_PATH) {
    runLogger.record('ai.summary.skipped', {
      status: 'skipped',
      adapter: SUMMARY_ADAPTER,
      reason: 'missing-locale-config'
    })
    await runLogger.flush()
    console.warn('[summary] no locale configuration available, skipping generation')
    return
  }

  try {
    const files = await globby('**/index.md', { cwd: CONTENT_DIR, absolute: true })
    const items = []
    let draftsSkipped = 0

    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8')
      const { data, content } = matter(raw)
      if (isDraft(data)) {
        draftsSkipped += 1
        continue
      }
      const summary = generateSummary(data, content)
      if (!summary) continue
      const title = String(data.title || '').trim()
      if (!title) continue
      const url = buildUrl(file)
      items.push({ url, title, summary })
    }

    await ensureDir(OUTPUT_DIR)
    await fs.writeFile(
      OUTPUT_FILE,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          items: items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
        },
        null,
        2
      ),
      'utf8'
    )
    const durationMs = durationFrom(started)
    runLogger.record('ai.summary.completed', {
      status: 'success',
      adapter: SUMMARY_ADAPTER,
      durationMs,
      itemsProcessed: items.length,
      filesScanned: files.length,
      draftsSkipped,
      outputPath: OUTPUT_FILE,
      locale: preferredLocaleConfig.code
    })
    console.log(`summaries.json 写入 ${items.length} 条`)
  } catch (error) {
    runLogger.record('ai.summary.failed', {
      status: 'failed',
      adapter: SUMMARY_ADAPTER,
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
  console.error('[summary] failed:', err)
  process.exitCode = 1
})
