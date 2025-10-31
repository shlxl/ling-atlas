#!/usr/bin/env node
import process from 'node:process';

import { resolveNeo4jConfig, getScriptName } from './config.mjs';
import { createDriver, verifyConnectivity, withSession } from './neo4j-client.mjs';
import { writePayloads } from './neo4j-writer.mjs';
import { UNIQUE_CONSTRAINTS, INDEXES } from './schema.mjs';
import { collectDocuments } from './ingest/collect-frontmatter.mjs';
import { normalizeDocument } from './ingest/normalize-metadata.mjs';
import { extractEntities } from './ingest/extract-entities.mjs';
import { buildPayload } from './ingest/build-payload.mjs';
import { createQualityChecker } from './quality-check.mjs';
import { appendGraphragMetric } from './telemetry.mjs';
import {
  loadIngestCache,
  saveIngestCache,
  shouldProcessDoc,
  updateCacheEntry,
} from './cache.mjs';

const VALUE_OPTIONS = new Map([
  ['--locale', 'locale'],
  ['--docs-root', 'docsRoot'],
  ['--adapter', 'adapter'],
  ['--adapter-model', 'adapterModel'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--include-drafts', 'includeDrafts'],
  ['--changed-only', 'changedOnly'],
  ['--no-write', 'noWrite'],
  ['--skip-schema', 'skipSchema'],
  ['--no-cache', 'noCache'],
  ['--json', 'jsonOutput'],
]);

function parsePipelineOptions(rawArgs) {
  const options = {
    docsRoot: 'docs',
    includeDrafts: false,
    changedOnly: false,
    noCache: false,
    noWrite: false,
    skipSchema: false,
    jsonOutput: false,
    adapter: undefined,
    adapterModel: undefined,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];
    if (VALUE_OPTIONS.has(token)) {
      const key = VALUE_OPTIONS.get(token);
      const value = rawArgs[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`参数 ${token} 需要显式取值`);
      }
      options[key] = value;
      index += 1;
      continue;
    }

    if (BOOLEAN_OPTIONS.has(token)) {
      const key = BOOLEAN_OPTIONS.get(token);
      options[key] = true;
      continue;
    }
  }

  return options;
}

function formatStatement(statement) {
  return statement.replace(/\s+/g, ' ').trim();
}

async function ensureSchema(session) {
  for (const statement of UNIQUE_CONSTRAINTS) {
    await session.run(statement);
    console.log(`约束已确认：${formatStatement(statement)}`);
  }
  for (const statement of INDEXES) {
    await session.run(statement);
    console.log(`索引已确认：${formatStatement(statement)}`);
  }
}

function buildSummary({ documents, payloads, skipped }) {
  return {
    totalDocuments: documents.length,
    normalized: payloads.length + skipped.length,
    readyForWrite: payloads.length,
    skipped: skipped.length,
    skippedReasons: skipped,
  };
}

function summarizeSkippedReasons(entries, limit = 5) {
  const buckets = new Map();
  for (const entry of entries || []) {
    if (!entry || typeof entry !== 'object') continue;
    const reason = entry.reason || 'unknown';
    const bucket = buckets.get(reason) || { reason, count: 0, sampleDocId: null };
    bucket.count += 1;
    if (!bucket.sampleDocId && entry.docId) {
      bucket.sampleDocId = entry.docId;
    }
    buckets.set(reason, bucket);
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function createIngestTelemetryRecord({
  options,
  summary,
  processedCount,
  adapterName,
  adapterModel,
  durationMs,
  written,
  dryRun,
}) {
  return {
    type: 'ingest',
    timestamp: new Date().toISOString(),
    durationMs,
    locale: options.locale ?? 'all',
    includeDrafts: Boolean(options.includeDrafts),
    changedOnly: Boolean(options.changedOnly),
    noCache: Boolean(options.noCache),
    dryRun: Boolean(dryRun),
    adapter: adapterName,
    adapterModel: adapterModel ?? null,
    totals: {
      collected: summary.totalDocuments,
      normalized: summary.normalized,
      readyForWrite: summary.readyForWrite,
      processed: processedCount,
    },
    skipped: {
      total: summary.skipped,
      reasons: summarizeSkippedReasons(summary.skippedReasons),
      samples: summary.skippedReasons
        ? summary.skippedReasons.slice(0, 3).map((item) => ({
            docId: item?.docId ?? null,
            reason: item?.reason ?? 'unknown',
          }))
        : [],
    },
    write: {
      attempted: summary.readyForWrite,
      written: Number(written ?? 0),
      cacheUpdated: !options.noCache && Number(written ?? 0) > 0,
    },
  };
}

async function main() {
  const scriptName = getScriptName(import.meta.url);
  const rawArgs = process.argv.slice(2);
  const options = parsePipelineOptions(rawArgs);
  const neo4jConfig = resolveNeo4jConfig(rawArgs, { requirePassword: false });
  const noWriteMode = options.noWrite || neo4jConfig.dryRun;
  const startedAt = Date.now();

  async function recordTelemetrySafely(record) {
    if (!record) return;
    try {
      await appendGraphragMetric(record, { limit: 200 });
    } catch (error) {
      console.warn(
        `[${scriptName}] telemetry 写入失败：${error?.message || error}`,
      );
    }
  }

  if (!noWriteMode && !neo4jConfig.password) {
    throw new Error('缺少 Neo4j 密码，无法写入数据库');
  }

  console.log(
    `[${scriptName}] 选项：${JSON.stringify({
      locale: options.locale ?? 'all',
      docsRoot: options.docsRoot,
      includeDrafts: options.includeDrafts,
      changedOnly: options.changedOnly,
      noCache: options.noCache,
      noWrite: noWriteMode,
      skipSchema: options.skipSchema,
      jsonOutput: options.jsonOutput,
      adapter: options.adapter ?? process.env.GRAPHRAG_ENTITY_ADAPTER ?? 'placeholder',
    })}`,
  );

  const documents = await collectDocuments({
    docsRoot: options.docsRoot,
    locale: options.locale,
    includeDrafts: options.includeDrafts,
  });

  console.log(`[${scriptName}] 已收集文档：${documents.length} 篇`);

  const normalizedDocs = documents.map(normalizeDocument);
  const skipped = [];
  const payloads = [];
  const processedDocs = [];
  const qualityChecker = await createQualityChecker();
  let adapter = null;

  const adapterName =
    options.adapter ?? process.env.GRAPHRAG_ENTITY_ADAPTER ?? 'placeholder';
  const adapterModel =
    options.adapterModel ?? process.env.GRAPHRAG_ENTITY_MODEL ?? undefined;

  if (adapterName === 'transformers') {
    const { loadTransformersNERAdapter } = await import(
      './adapters/transformers-ner.mjs'
    );
    adapter = await loadTransformersNERAdapter({
      model: adapterModel,
    });
    console.log(
      `[${scriptName}] 已加载 Transformers.js NER 适配器（model=${adapterModel ?? '默认'})`,
    );
  }
  const cacheState = options.noCache
    ? { cache: {}, path: null }
    : await loadIngestCache();

  for (const doc of normalizedDocs) {
    if (doc.relativePath?.includes('_generated/')) {
      skipped.push({
        docId: doc.id,
        reason: '自动生成产物，默认跳过',
      });
      continue;
    }

    const cacheDecision = shouldProcessDoc(doc, cacheState.cache, {
      changedOnly: options.changedOnly,
    });

    if (!cacheDecision.process) {
      skipped.push({
        docId: doc.id,
        reason: cacheDecision.reason,
      });
      continue;
    }

    const quality = await qualityChecker.check(doc);
    if (!quality.passed) {
      skipped.push({
        docId: doc.id,
        reason: '质量守门失败',
        errors: quality.errors,
      });
      continue;
    }

    const entities = await extractEntities(doc, { adapter });
    payloads.push(buildPayload(doc, entities));
    processedDocs.push(doc);
  }

  console.log(
    `[${scriptName}] 生成写入批次：${payloads.length} 个（跳过 ${skipped.length}）`,
  );

  const summary = buildSummary({ documents, payloads, skipped });

  if (noWriteMode) {
    console.log(`[${scriptName}] dry-run/no-write 模式，跳过 Neo4j 写入`);
    const durationMs = Date.now() - startedAt;
    if (options.jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    }
    await recordTelemetrySafely(
      createIngestTelemetryRecord({
        options,
        summary,
        processedCount: processedDocs.length,
        adapterName,
        adapterModel,
        durationMs,
        written: 0,
        dryRun: true,
      }),
    );
    return;
  }

  const driver = createDriver(neo4jConfig);
  try {
    await verifyConnectivity(driver);
    console.log(`[${scriptName}] 已验证 Neo4j 连接`);

    await withSession(driver, neo4jConfig.database, async (session) => {
      if (!options.skipSchema) {
        await ensureSchema(session);
      }
    });

    const result = await writePayloads(driver, neo4jConfig.database, payloads);
    console.log(
      `[${scriptName}] 写入完成：${result.written} 文档`,
    );

    if (!options.noCache && result.written > 0) {
      const timestamp = new Date().toISOString();
      for (const doc of processedDocs) {
        updateCacheEntry(cacheState.cache, doc, { writtenAt: timestamp });
      }
      const cachePath = await saveIngestCache(cacheState.cache, cacheState.path);
      console.log(`[${scriptName}] 已更新缓存：${cachePath}`);
    }

    if (options.jsonOutput) {
      console.log(JSON.stringify({ ...summary, written: result.written }, null, 2));
    }

    const durationMs = Date.now() - startedAt;
    await recordTelemetrySafely(
      createIngestTelemetryRecord({
        options,
        summary,
        processedCount: processedDocs.length,
        adapterName,
        adapterModel,
        durationMs,
        written: result.written,
        dryRun: false,
      }),
    );
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
