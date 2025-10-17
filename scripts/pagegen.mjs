import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'url'
import {
  DOCS_DIR as DOCS,
  GENERATED_ROOT as GEN,
  PUBLIC_ROOT as PUB,
  LANG_CONFIG,
  LANGUAGES,
  getPreferredLocale
} from './pagegen.locales.mjs'
import { collectPosts } from './pagegen/collect.mjs'
import { syncLocaleContent } from './pagegen/sync.mjs'
import { writeCollections } from './pagegen/collections.mjs'
import { generateRss, generateSitemap } from './pagegen/feeds.mjs'
import { createI18nRegistry } from './pagegen/i18n-registry.mjs'
import { createWriter } from './pagegen/writer.mjs'

export {
  LOCALE_REGISTRY,
  LANG_CONFIG,
  LANGUAGES,
  ROOT_DIR,
  DOCS_DIR,
  GENERATED_ROOT,
  PUBLIC_ROOT,
  getLocaleConfig,
  getPreferredLocale
} from './pagegen.locales.mjs'

await (async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const DOCS_DIR = path.join(__dirname, '..', 'docs')
  const GENERATED_DIR = path.join(DOCS_DIR, '_generated')
  const PUBLIC_DIR = path.join(DOCS_DIR, 'public')

  await fs.mkdir(GENERATED_DIR, { recursive: true })
  await fs.mkdir(PUBLIC_DIR, { recursive: true })

  const LOCALE_CONFIG = LANGUAGES
  const argv = process.argv.slice(2)
  const forceFullSync = argv.includes('--full-sync') || process.env.PAGEGEN_FULL_SYNC === '1'
  const disableCache = argv.includes('--no-cache') || process.env.PAGEGEN_DISABLE_CACHE === '1'
  const batchingDisabled = argv.includes('--no-batch') || process.env.PAGEGEN_DISABLE_BATCH === '1'
  const collectConcurrency = Number(process.env.PAGEGEN_CONCURRENCY || 8)
  const writer = batchingDisabled ? null : createWriter()

  for (const lang of LOCALE_CONFIG) {
    if (lang.generatedDir) {
      await fs.mkdir(lang.generatedDir, { recursive: true })
    }
    if (lang.outMeta) {
      await fs.mkdir(path.dirname(lang.outMeta), { recursive: true })
    }
    if (lang.navManifestPath) {
      await fs.mkdir(path.dirname(lang.navManifestPath), { recursive: true })
    }
  }

  const preferredLocaleCode = getPreferredLocale()
  const stageTimings = []
  const metricsLogPath = path.join(__dirname, '..', 'data', 'pagegen-metrics.json')

  function recordStage(name, durationMs) {
    stageTimings.push({ name, durationMs })
    console.log(`[pagegen] ${name} ${durationMs.toFixed(1)}ms`)
  }

  async function measureStage(name, fn) {
    const start = performance.now()
    try {
      return await fn()
    } finally {
      recordStage(name, performance.now() - start)
    }
  }

  function flushStageSummary() {
    const total = stageTimings.reduce((sum, item) => sum + item.durationMs, 0)
    console.log(`[pagegen] total ${total.toFixed(1)}ms`)
    return total
  }

  const tagAlias = await loadTagAlias(__dirname)
  const registry = createI18nRegistry(LOCALE_CONFIG, { tagAlias })

  const syncMetrics = await measureStage('syncLocaleContent', () =>
    syncLocaleContent(LOCALE_CONFIG, {
      fullSync: forceFullSync,
      cacheDir: path.join(__dirname, '..', 'data')
    })
  )
  for (const metric of syncMetrics || []) {
    const copied = metric.copied ? 'copied' : 'skipped'
    const sizeMb = metric.bytes ? (metric.bytes / (1024 * 1024)).toFixed(2) : '0.00'
    console.log(
      `[pagegen] sync:${metric.locale} ${copied} mode=${metric.mode} files=${metric.files}` +
        ` copied=${metric.copiedFiles} removed=${metric.removedFiles} size=${sizeMb}MB`
    )
  }

  const siteOrigin = process.env.SITE_ORIGIN || 'https://example.com'
  const collectMetrics = {}

  for (const lang of LOCALE_CONFIG) {
    const posts = await measureStage(`collect:${lang.manifestLocale}`, () =>
      collectPosts(lang, {
        cacheDir: path.join(__dirname, '..', 'data'),
        disableCache,
        concurrency: collectConcurrency
      })
    )
    if (posts.stats) {
      collectMetrics[lang.code || lang.manifestLocale] = posts.stats
      console.log(
        `[pagegen] cache:${lang.manifestLocale} hits=${posts.stats.cacheHits} misses=${posts.stats.cacheMisses}` +
          ` parsed=${posts.stats.parsedFiles} total=${posts.stats.totalFiles}`
      )
    }
    await measureStage(`meta:${lang.manifestLocale}`, async () => {
      const payload = `${JSON.stringify(posts.meta, null, 2)}\n`
      if (writer) {
        writer.addFileTask({
          stage: 'meta',
          locale: lang.manifestLocale,
          target: lang.outMeta,
          content: payload
        })
      } else {
        await fs.writeFile(lang.outMeta, payload)
      }
    })

    const navEntries = await measureStage(`collections:${lang.manifestLocale}`, () =>
      writeCollections(lang, posts.meta, writer)
    )
    registry.addNavEntries(lang, navEntries)
    await measureStage(`rss:${lang.manifestLocale}`, () =>
      generateRss(lang, posts.list, {
        publicDir: PUBLIC_DIR,
        siteOrigin,
        preferredLocale: preferredLocaleCode,
        writer
      })
    )
    await measureStage(`sitemap:${lang.manifestLocale}`, () =>
      generateSitemap(lang, posts.list, { publicDir: PUBLIC_DIR, siteOrigin, writer })
    )

    for (const post of posts.list) {
      registry.registerPost(post, lang)
    }
  }

  const i18nMap = registry.getI18nMap()
  await measureStage('scheduleI18nMap', () => writeI18nMap(i18nMap, writer))

  const navPayloads = registry.getNavManifestPayloads()
  await measureStage('scheduleNavManifests', () => writeNavManifests(navPayloads, writer))

  let writeResults = {
    total: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    disabled: batchingDisabled
  }

  if (writer) {
    writeResults = await measureStage('flushWrites', () => writer.flush())
    if (writeResults.failed > 0) {
      for (const err of writeResults.errors || []) {
        console.error(
          `[pagegen] write failed stage=${err.stage || 'unknown'} locale=${err.locale || 'n/a'} target=${err.target || 'n/a'}: ${
            err.message || 'unknown error'
          }`
        )
      }
      throw new Error(`pagegen write failures: ${writeResults.failed}`)
    }
  }

  const totalDuration = flushStageSummary()

  console.log('✔ pagegen 完成')

  await appendMetricsLog({
    timestamp: new Date().toISOString(),
    totalMs: Number(totalDuration.toFixed(3)),
    sync: syncMetrics,
    stages: stageTimings.map(item => ({
      name: item.name,
      ms: Number(item.durationMs.toFixed(3))
    })),
    collect: collectMetrics,
    write: writeResults
  })

  async function writeI18nMap(map, currentWriter) {
    const json = `${JSON.stringify(map, null, 2)}\n`
    if (currentWriter) {
      currentWriter.addFileTask({
        stage: 'i18n-map',
        locale: 'root',
        target: path.join(PUBLIC_DIR, 'i18n-map.json'),
        content: json
      })
    } else {
      await fs.writeFile(path.join(PUBLIC_DIR, 'i18n-map.json'), json)
    }
  }

  async function writeNavManifests(entries, currentWriter) {
    for (const { lang, payload } of entries) {
      const json = `${JSON.stringify(payload, null, 2)}\n`
      const file = lang.navManifestFile || `nav.manifest.${lang.manifestLocale}.json`
      const generatedTarget = lang.navManifestPath || path.join(GENERATED_DIR, file)
      if (currentWriter) {
        currentWriter.addFileTask({
          stage: 'nav-manifest',
          locale: lang.manifestLocale,
          target: generatedTarget,
          content: json
        })
        currentWriter.addFileTask({
          stage: 'nav-manifest',
          locale: lang.manifestLocale,
          target: path.join(PUBLIC_DIR, file),
          content: json
        })
      } else {
        await fs.mkdir(path.dirname(generatedTarget), { recursive: true })
        await fs.writeFile(generatedTarget, json)
        await fs.writeFile(path.join(PUBLIC_DIR, file), json)
      }
    }
  }

  async function loadTagAlias(baseDir) {
    try {
      const raw = await fs.readFile(path.join(baseDir, '..', 'schema', 'tag-alias.json'), 'utf8')
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  async function appendMetricsLog(entry) {
    try {
      await fs.mkdir(path.dirname(metricsLogPath), { recursive: true })
      const existingRaw = await fs.readFile(metricsLogPath, 'utf8').catch(() => '[]')
      const existing = JSON.parse(existingRaw || '[]')
      existing.push(entry)
      const limited = existing.slice(-100)
      await fs.writeFile(metricsLogPath, JSON.stringify(limited, null, 2))
    } catch (error) {
      console.warn('[pagegen] failed to write metrics log:', error.message)
    }
  }
})();
