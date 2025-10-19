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
  NAVIGATION_CONFIG,
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
  NAVIGATION_CONFIG,
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
  const dryRunFlagIndex = argv.indexOf('--dry-run')
  const dryRunEnv = process.env.PAGEGEN_DRY_RUN === '1'
  const dryRun = dryRunFlagIndex !== -1 || dryRunEnv
  if (dryRunFlagIndex !== -1) {
    argv.splice(dryRunFlagIndex, 1)
  }
  const metricsOnlyFlagIndex = argv.indexOf('--metrics-only')
  const metricsOnlyEnv = process.env.PAGEGEN_METRICS_ONLY === '1'
  const metricsOnly = metricsOnlyFlagIndex !== -1 || metricsOnlyEnv
  if (metricsOnlyFlagIndex !== -1) {
    argv.splice(metricsOnlyFlagIndex, 1)
  }
  const metricsStdoutFlagIndex = argv.indexOf('--metrics-stdout')
  const metricsStdoutEnv = process.env.PAGEGEN_METRICS_STDOUT === '1'
  let metricsStdout = metricsStdoutFlagIndex !== -1 || metricsStdoutEnv
  if (metricsStdoutFlagIndex !== -1) {
    argv.splice(metricsStdoutFlagIndex, 1)
  }
  if (metricsOnly) metricsStdout = true
  let metricsOutputPath = process.env.PAGEGEN_METRICS_OUTPUT
  const metricsOutputFlagIndex = argv.indexOf('--metrics-output')
  if (metricsOutputFlagIndex !== -1) {
    const specified = argv[metricsOutputFlagIndex + 1]
    if (!specified) {
      console.error('pagegen: --metrics-output requires a file path')
      process.exit(1)
    }
    metricsOutputPath = specified
    argv.splice(metricsOutputFlagIndex, 2)
  }
  const forceFullSync = argv.includes('--full-sync') || process.env.PAGEGEN_FULL_SYNC === '1'
  const disableCache = argv.includes('--no-cache') || process.env.PAGEGEN_DISABLE_CACHE === '1'
  const batchingDisabled = argv.includes('--no-batch') || process.env.PAGEGEN_DISABLE_BATCH === '1'
  const collectConcurrency = Number(process.env.PAGEGEN_CONCURRENCY || 8)
  const effectiveDryRun = dryRun || metricsOnly
  const writer = effectiveDryRun || batchingDisabled ? null : createWriter()

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
  const defaultMetricsPath = path.join(__dirname, '..', 'data', 'pagegen-metrics.json')
  const metricsLogPath = metricsOutputPath ? path.resolve(metricsOutputPath) : defaultMetricsPath

  function logInfo(...args) {
    if (!metricsOnly) console.log(...args)
  }

  function recordStage(name, durationMs) {
    stageTimings.push({ name, durationMs })
    logInfo(`[pagegen] ${name} ${durationMs.toFixed(1)}ms`)
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
    logInfo(`[pagegen] total ${total.toFixed(1)}ms`)
    return total
  }

  const tagAlias = await loadTagAlias(__dirname)
  const registry = createI18nRegistry(LOCALE_CONFIG, { tagAlias, navConfig: NAVIGATION_CONFIG })

  if (metricsOutputPath && !metricsOnly) {
    logInfo(`[pagegen] metrics output: ${metricsLogPath}`)
  }
  if (effectiveDryRun) {
    logInfo('[pagegen] dry-run mode: file writes will be skipped')
  }
  if (metricsStdout && metricsOutputPath && !metricsOnly) {
    logInfo('[pagegen] metrics stdout mode enabled; file output will be skipped')
  }

  const syncMetrics = await measureStage('syncLocaleContent', () =>
    syncLocaleContent(LOCALE_CONFIG, {
      fullSync: forceFullSync,
      cacheDir: path.join(__dirname, '..', 'data')
    })
  )
  for (const metric of syncMetrics || []) {
    const copied = metric.copied ? 'copied' : 'skipped'
    const sizeMb = metric.bytes ? (metric.bytes / (1024 * 1024)).toFixed(2) : '0.00'
    logInfo(
      `[pagegen] sync:${metric.locale} ${copied} mode=${metric.mode} files=${metric.files}` +
        ` copied=${metric.copiedFiles} removed=${metric.removedFiles} size=${sizeMb}MB`
    )
  }

  const siteOrigin = process.env.SITE_ORIGIN || 'https://example.com'
  const collectMetrics = {}
  const feedMetrics = []

  for (const lang of LOCALE_CONFIG) {
    const posts = await measureStage(`collect:${lang.manifestLocale}`, () =>
      collectPosts(lang, {
        cacheDir: path.join(__dirname, '..', 'data'),
        disableCache,
        concurrency: collectConcurrency
      })
    )
    const stats = posts.stats || {}
    collectMetrics[lang.code || lang.manifestLocale] = stats
    const cacheHits = Number(stats.cacheHits || 0)
    const cacheMisses = Number(stats.cacheMisses || 0)
    const totalFiles = Number(stats.totalFiles || 0)
    const parsedFiles = Number(stats.parsedFiles || 0)
    const requests = cacheHits + cacheMisses
    const cacheSummary = stats.cacheDisabled ? 'disabled' : `${cacheHits}/${requests}`
    const hitRateText = stats.cacheDisabled
      ? 'disabled'
      : requests
        ? `${((cacheHits / requests) * 100).toFixed(1)}%`
        : 'n/a'
    const parseErrors = Number(stats.parseErrors || 0)
    logInfo(
      `[pagegen] collect:${lang.manifestLocale} total=${totalFiles} parsed=${parsedFiles}` +
        ` cache=${cacheSummary} hitRate=${hitRateText} errors=${parseErrors}`
    )

    const localeFeed = {
      locale: lang.manifestLocale,
      rssCount: 0,
      rssLimited: false,
      sitemapCount: 0
    }
    feedMetrics.push(localeFeed)
    await measureStage(`meta:${lang.manifestLocale}`, async () => {
      if (effectiveDryRun) return
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
      writeCollections(lang, posts.meta, writer, { dryRun: effectiveDryRun })
    )
    registry.addNavEntries(lang, navEntries)
    const rssStats = await measureStage(`rss:${lang.manifestLocale}`, () =>
      generateRss(lang, posts.list, {
        publicDir: PUBLIC_DIR,
        siteOrigin,
        preferredLocale: preferredLocaleCode,
        writer,
        dryRun: effectiveDryRun
      })
    )
    if (rssStats) {
      localeFeed.rssCount = Number(rssStats.count || 0)
      localeFeed.rssLimited = Boolean(rssStats.limited)
    }
    const sitemapStats = await measureStage(`sitemap:${lang.manifestLocale}`, () =>
      generateSitemap(lang, posts.list, { publicDir: PUBLIC_DIR, siteOrigin, writer, dryRun: effectiveDryRun })
    )
    if (sitemapStats) {
      localeFeed.sitemapCount = Number(sitemapStats.count || 0)
    }
    logInfo(
      `[pagegen] feeds:${lang.manifestLocale} rss=${localeFeed.rssCount}${
        localeFeed.rssLimited ? ' (limited)' : ''
      } sitemap=${localeFeed.sitemapCount}`
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
    skippedByReason: {},
    disabled: batchingDisabled || effectiveDryRun
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

  logInfo('✔ pagegen 完成')

  const metricsEntry = buildMetricsEntry({
    totalDuration,
    stageTimings,
    syncMetrics,
    collectMetrics,
    writeResults,
    feedMetrics
  })

  if (!metricsOnly) {
    const collectSummary = metricsEntry.collect?.summary
    if (collectSummary && (collectSummary.parseErrors > 0 || collectSummary.errorEntries > 0)) {
      console.warn(
        `[pagegen] collect warnings: parseErrors=${collectSummary.parseErrors} errorEntries=${collectSummary.errorEntries}`
      )
    }
    const syncSummary = metricsEntry.sync?.summary
    if (syncSummary && (syncSummary.failedCopies > 0 || syncSummary.failedRemovals > 0)) {
      console.warn(
        `[pagegen] sync warnings: failedCopies=${syncSummary.failedCopies} failedRemovals=${syncSummary.failedRemovals}`
      )
    }
  }

  if (metricsStdout) {
    process.stdout.write(`${JSON.stringify(metricsEntry, null, 2)}\n`)
  } else {
    await appendMetricsLog(metricsEntry)
  }

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

  function buildMetricsEntry({
    totalDuration,
    stageTimings,
    syncMetrics,
    collectMetrics,
    writeResults,
    feedMetrics: feeds
  }) {
    const stages = stageTimings.map(item => ({
      name: item.name,
      ms: Number(item.durationMs.toFixed(3))
    }))

    return {
      timestamp: new Date().toISOString(),
      totalMs: Number(totalDuration.toFixed(3)),
      stages,
      stageSummary: Object.fromEntries(stages.map(item => [item.name, item.ms])),
      sync: summarizeSyncMetrics(syncMetrics),
      collect: summarizeCollectMetrics(collectMetrics),
      feeds: summarizeFeedMetrics(feeds),
      write: summarizeWriteResults(writeResults)
    }
  }

  function summarizeSyncMetrics(metrics = []) {
    if (!Array.isArray(metrics)) return { summary: { locales: 0 }, locales: [] }
    const summary = {
      locales: metrics.length,
      copiedLocales: metrics.filter(item => item?.copied).length,
      totalFiles: metrics.reduce((sum, item) => sum + Number(item?.files || 0), 0),
      copiedFiles: metrics.reduce((sum, item) => sum + Number(item?.copiedFiles || 0), 0),
      removedFiles: metrics.reduce((sum, item) => sum + Number(item?.removedFiles || 0), 0),
      bytes: metrics.reduce((sum, item) => sum + Number(item?.bytes || 0), 0),
      failedCopies: metrics.reduce((sum, item) => sum + Number(item?.failedCopies || 0), 0),
      failedRemovals: metrics.reduce((sum, item) => sum + Number(item?.failedRemovals || 0), 0),
      errors: metrics.reduce((sum, item) => sum + Number((item?.errors || []).length), 0),
      snapshotsUpdated: metrics.filter(item => item?.snapshotUpdated).length
    }

    const locales = metrics.map(item => ({
      locale: item?.locale,
      mode: item?.mode,
      files: item?.files,
      copiedFiles: item?.copiedFiles,
      removedFiles: item?.removedFiles,
      unchangedFiles: item?.unchangedFiles,
      bytes: item?.bytes,
      copied: item?.copied,
      failedCopies: item?.failedCopies,
      failedRemovals: item?.failedRemovals,
      snapshotUpdated: item?.snapshotUpdated,
      errors: item?.errors || []
    }))

    return { summary, locales }
  }

  function summarizeCollectMetrics(metrics = {}) {
    const entries = Object.entries(metrics || {})
    const summary = {
      locales: entries.length,
      totalFiles: entries.reduce((sum, [, stats]) => sum + Number(stats?.totalFiles || 0), 0),
      parsedFiles: entries.reduce((sum, [, stats]) => sum + Number(stats?.parsedFiles || 0), 0),
      cacheHits: entries.reduce((sum, [, stats]) => sum + Number(stats?.cacheHits || 0), 0),
      cacheMisses: entries.reduce((sum, [, stats]) => sum + Number(stats?.cacheMisses || 0), 0),
      parseErrors: entries.reduce((sum, [, stats]) => sum + Number(stats?.parseErrors || 0), 0),
      errorEntries: entries.reduce((sum, [, stats]) => sum + Number((stats?.errors || []).length), 0)
    }
    const totalRequests = summary.cacheHits + summary.cacheMisses
    summary.cacheHitRate = totalRequests ? Number((summary.cacheHits / totalRequests).toFixed(3)) : 0

    const locales = entries.map(([locale, stats]) => ({
      locale,
      totalFiles: stats?.totalFiles || 0,
      parsedFiles: stats?.parsedFiles || 0,
      cacheHits: stats?.cacheHits || 0,
      cacheMisses: stats?.cacheMisses || 0,
      cacheDisabled: Boolean(stats?.cacheDisabled),
      parseErrors: stats?.parseErrors || 0,
      errors: stats?.errors || []
    }))

    return { summary, locales }
  }

  function summarizeFeedMetrics(metrics = []) {
    if (!Array.isArray(metrics)) return { summary: { locales: 0 }, locales: [] }
    const summary = {
      locales: metrics.length,
      rssTotal: metrics.reduce((sum, item) => sum + Number(item?.rssCount || 0), 0),
      rssLimitedLocales: metrics.filter(item => item?.rssLimited).length,
      sitemapTotal: metrics.reduce((sum, item) => sum + Number(item?.sitemapCount || 0), 0),
      emptyLocales: metrics.filter(item => Number(item?.rssCount || 0) + Number(item?.sitemapCount || 0) === 0).length
    }

    const locales = metrics.map(item => ({
      locale: item?.locale,
      rssCount: Number(item?.rssCount || 0),
      rssLimited: Boolean(item?.rssLimited),
      sitemapCount: Number(item?.sitemapCount || 0)
    }))

    return { summary, locales }
  }

  function summarizeWriteResults(results = {}) {
    return {
      summary: {
        total: Number(results?.total || 0),
        written: Number(results?.written || 0),
        skipped: Number(results?.skipped || 0),
        failed: Number(results?.failed || 0),
        disabled: Boolean(results?.disabled),
        skippedByReason: results?.skippedByReason || {}
      },
      errors: Array.isArray(results?.errors)
        ? results.errors.map(err => ({
            stage: err?.stage,
            locale: err?.locale,
            target: err?.target,
            message: err?.message,
            stack: err?.stack
          }))
        : []
    }
  }
})();
