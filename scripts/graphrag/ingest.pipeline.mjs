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
import { createEntityTypeNormalizer } from './entity-type-normalizer.mjs';
import { createRelationshipTypeNormalizer } from './relationship-type-normalizer.mjs';
import { createObjectPropertyNormalizer } from './object-normalizer.mjs';
import {
  loadIngestCache,
  saveIngestCache,
  shouldProcessDoc,
  updateCacheEntry,
} from './cache.mjs';
import { evaluateNormalizationGuards } from './guard-utils.mjs';

const VALUE_OPTIONS = new Map([
  ['--locale', 'locale'],
  ['--docs-root', 'docsRoot'],
  ['--adapter', 'adapter'],
  ['--adapter-model', 'adapterModel'],
  ['--include-only', 'includeOnly'],
  ['--ignore-file', 'ignoreFile'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--include-drafts', 'includeDrafts'],
  ['--changed-only', 'changedOnly'],
  ['--no-write', 'noWrite'],
  ['--skip-schema', 'skipSchema'],
  ['--no-cache', 'noCache'],
  ['--json', 'jsonOutput'],
  ['--no-chunks', 'noChunks'],
  ['--no-frontmatter', 'noFrontmatter'],
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
    noChunks: false,
    noFrontmatter: false,
    includeOnly: undefined,
    ignoreFile: undefined,
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
  guardAlerts
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
    guardAlerts: Array.isArray(guardAlerts) ? guardAlerts : [],
  };
}

function createNormalizationTelemetryRecord(
  summary,
  { durationMs = 0, documents = 0 } = {},
  domain = 'entities',
) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const typeName =
    domain === 'relationships'
      ? 'normalize_relationships'
      : domain === 'objects'
        ? 'normalize_objects'
        : 'normalize';
  return {
    type: typeName,
    domain,
    timestamp: new Date().toISOString(),
    durationMs,
    documents,
    enabled: Boolean(summary.enabled),
    totals: summary.records ?? null,
    sources: summary.sources ?? null,
    cache: summary.cache ?? null,
    aliasEntries: summary.aliasEntries ?? 0,
    llm: summary.llm ?? null,
    samples: summary.samples ?? null,
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
      noChunks: Boolean(options.noChunks),
      noFrontmatter: Boolean(options.noFrontmatter),
    })}`,
  );

  const documents = await collectDocuments({
    docsRoot: options.docsRoot,
    locale: options.locale,
    includeDrafts: options.includeDrafts,
  });

  console.log(`[${scriptName}] 已收集文档：${documents.length} 篇`);

  let normalizedDocs = documents.map(normalizeDocument);
  const skipped = [];

  if (options.includeOnly) {
    const { readFilterFile } = await import('./ingest/filter-files.mjs');
    const includeSet = await readFilterFile(options.includeOnly);
    if (includeSet.size > 0) {
      console.log(`[${scriptName}] 白名单模式：只处理 ${options.includeOnly} 文件中定义的 ${includeSet.size} 个文档`);
      normalizedDocs = normalizedDocs.filter(doc => includeSet.has(doc.relativePath));
    }
  } else if (options.ignoreFile) {
    const { readFilterFile } = await import('./ingest/filter-files.mjs');
    const ignoreSet = await readFilterFile(options.ignoreFile);
    if (ignoreSet.size > 0) {
      console.log(`[${scriptName}] 忽略列表模式：跳过 ${options.ignoreFile} 文件中定义的 ${ignoreSet.size} 个文档`);
      const originalCount = normalizedDocs.length;
      normalizedDocs = normalizedDocs.filter(doc => !ignoreSet.has(doc.relativePath));
      const ignoredCount = originalCount - normalizedDocs.length;
      console.log(`[${scriptName}] 已根据忽略列表跳过 ${ignoredCount} 个文档`);
    }
  }
  const payloads = [];
  const processedDocs = [];
  const qualityChecker = await createQualityChecker();
  let typeNormalizer = null;
  let relationshipNormalizer = null;
  let objectNormalizer = null;
  let entityNormalizationDurationMs = 0;
  let relationshipNormalizationDurationMs = 0;
  let objectNormalizationDurationMs = 0;
  let adapter = null;

  try {
    typeNormalizer = await createEntityTypeNormalizer();
    console.log(
      `[${scriptName}] 实体类型归一化：${typeNormalizer.isEnabled() ? '已启用' : '已禁用'}`,
    );
  } catch (error) {
    console.warn(
      `[${scriptName}] 初始化实体类型归一化失败：${error?.message ?? error}`,
    );
  }

  try {
    relationshipNormalizer = await createRelationshipTypeNormalizer();
    console.log(
      `[${scriptName}] 关系类型归一化：${relationshipNormalizer.isEnabled() ? '已启用' : '已禁用'}`,
    );
  } catch (error) {
    console.warn(
      `[${scriptName}] 初始化关系类型归一化失败：${error?.message ?? error}`,
    );
  }

  try {
    objectNormalizer = await createObjectPropertyNormalizer();
    console.log(
      `[${scriptName}] 属性归一化：${objectNormalizer.isEnabled() ? '已启用' : '已禁用'}`,
    );
  } catch (error) {
    console.warn(
      `[${scriptName}] 初始化属性归一化失败：${error?.message ?? error}`,
    );
  }

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
  } else if (adapterName === 'gemini') {
    const { loadGeminiAdapter } = await import(
      './adapters/gemini.mjs'
    );
    adapter = await loadGeminiAdapter({
      model: adapterModel,
    });
    console.log(
      `[${scriptName}] 已加载 Gemini NER 适配器（model=${adapterModel ?? '默认'})`,
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

    let aggregation;
    try {
      aggregation = await extractEntities(doc, { adapter });
    } catch (error) {
      const message = error?.message ?? String(error);
      console.warn(
        `[${scriptName}] 文档 ${doc.id} 的实体提取失败：${message}`,
      );
      skipped.push({
        docId: doc.id,
        reason: 'adapter-error',
        errors: [message],
      });
      continue;
    }

    if (typeNormalizer) {
      const started = Date.now();
      await typeNormalizer.normalizeAggregation(doc, aggregation);
      entityNormalizationDurationMs += Date.now() - started;
    }

    if (relationshipNormalizer) {
      const started = Date.now();
      await relationshipNormalizer.normalizeAggregation(doc, aggregation);
      relationshipNormalizationDurationMs += Date.now() - started;
    }

    if (objectNormalizer) {
      const started = Date.now();
      await objectNormalizer.normalizeAggregation(doc, aggregation);
      objectNormalizationDurationMs += Date.now() - started;
    }

    payloads.push(
      buildPayload(doc, aggregation, {
        includeChunks: !options.noChunks,
        includeMentions: !options.noChunks,
        includeFrontmatter: !options.noFrontmatter,
      }),
    );
    processedDocs.push(doc);
  }

  console.log(
    `[${scriptName}] 生成写入批次：${payloads.length} 个（跳过 ${skipped.length}）`,
  );

  const summary = buildSummary({ documents, payloads, skipped });
  const entityNormalizationSummary = typeNormalizer?.getSummary?.();
  const relationshipNormalizationSummary = relationshipNormalizer?.getSummary?.();
  const objectNormalizationSummary = objectNormalizer?.getSummary?.();

  const guardResult = evaluateNormalizationGuards(
    [
      { domain: 'entities', summary: entityNormalizationSummary },
      { domain: 'relationships', summary: relationshipNormalizationSummary },
      { domain: 'objects', summary: objectNormalizationSummary },
    ],
    {
      mode: process.env.GRAPHRAG_GUARD_MODE || 'warn',
      llmFailureThreshold: process.env.GRAPHRAG_GUARD_LLM_FAILURES,
      fallbackThreshold: process.env.GRAPHRAG_GUARD_FALLBACKS,
    }
  )
  for (const alert of guardResult.alerts) {
    const prefix = alert.severity === 'error' ? '[guard:error]' : '[guard:warn]'
    console[alert.severity === 'error' ? 'error' : 'warn'](
      `${prefix} ${alert.message}`
    )
  }
  if (!noWriteMode && guardResult.shouldFail) {
    throw new Error('graphrag normalization guard triggered (LLM failures)')
  }

  if (noWriteMode) {
    console.log(`[${scriptName}] dry-run/no-write 模式，跳过 Neo4j 写入`);
    const durationMs = Date.now() - startedAt;
    if (options.jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    }
    if (typeNormalizer) {
      try {
        await typeNormalizer.persistCache();
      } catch (error) {
        console.warn(
          `[${scriptName}] 写入实体类型缓存失败：${error?.message ?? error}`,
        );
      }
    }

    if (relationshipNormalizer) {
      try {
        await relationshipNormalizer.persistCache();
      } catch (error) {
        console.warn(
          `[${scriptName}] 写入关系类型缓存失败：${error?.message ?? error}`,
        );
      }
    }

    if (objectNormalizer) {
      try {
        await objectNormalizer.persistCache();
      } catch (error) {
        console.warn(
          `[${scriptName}] 写入属性归一化缓存失败：${error?.message ?? error}`,
        );
      }
    }

    if (guardResult.shouldFail) {
      throw new Error('graphrag normalization guard triggered (LLM failures)')
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
        guardAlerts: guardResult.alerts,
      }),
    );

    if (entityNormalizationSummary) {
      await recordTelemetrySafely(
        createNormalizationTelemetryRecord(
          entityNormalizationSummary,
          {
            durationMs: entityNormalizationDurationMs,
            documents: processedDocs.length,
          },
          'entities',
        ),
      );
    }
    if (relationshipNormalizationSummary) {
      await recordTelemetrySafely(
        createNormalizationTelemetryRecord(
          relationshipNormalizationSummary,
          {
            durationMs: relationshipNormalizationDurationMs,
            documents: processedDocs.length,
          },
          'relationships',
        ),
      );
    }
    if (objectNormalizationSummary) {
      await recordTelemetrySafely(
        createNormalizationTelemetryRecord(
          objectNormalizationSummary,
          {
            durationMs: objectNormalizationDurationMs,
            documents: processedDocs.length,
          },
          'objects',
        ),
      );
    }
    return;
  }

  const driver = createDriver(neo4jConfig);
  let result = { written: 0 };
  try {
    await verifyConnectivity(driver);
    console.log(`[${scriptName}] 已验证 Neo4j 连接`);

    await withSession(driver, neo4jConfig.database, async (session) => {
      if (!options.skipSchema) {
        await ensureSchema(session);
      }
    });

    result = await writePayloads(driver, neo4jConfig.database, payloads);
    console.log(`[${scriptName}] 写入完成：${result.written} 文档`);
  } catch (writeError) {
    console.error(
      `[${scriptName}] 写入 Neo4j 失败: ${writeError.message || writeError}`,
    );
    // Optionally re-throw or handle the error as needed
  } finally {
    await driver.close();
  }

  const written = Number(result?.written ?? 0);
  const durationMs = Date.now() - startedAt;

  if (!options.noCache && written > 0 && cacheState?.cache) {
    const writtenAt = new Date().toISOString();
    for (const doc of processedDocs) {
      updateCacheEntry(cacheState.cache, doc, { writtenAt });
    }
    try {
      const cachePath = cacheState.path ?? undefined;
      const savedPath = await saveIngestCache(cacheState.cache, cachePath);
      console.log(`[${scriptName}] 已更新 ingest 缓存：${savedPath}`);
    } catch (cacheError) {
      console.warn(
        `[${scriptName}] 写入 ingest 缓存失败：${cacheError?.message || cacheError}`,
      );
    }
  }

  const finalSummary = {
    ...summary,
    processed: processedDocs.length,
    written,
    durationMs,
  };

  if (options.jsonOutput) {
    console.log(JSON.stringify(finalSummary, null, 2));
  }

  if (typeNormalizer) {
    try {
      await typeNormalizer.persistCache();
    } catch (cacheError) {
      console.warn(
        `[${scriptName}] 写入实体类型缓存失败：${cacheError?.message ?? cacheError}`,
      );
    }
  }

  if (relationshipNormalizer) {
    try {
      await relationshipNormalizer.persistCache();
    } catch (cacheError) {
      console.warn(
        `[${scriptName}] 写入关系类型缓存失败：${cacheError?.message ?? cacheError}`,
      );
    }
  }

  if (objectNormalizer) {
    try {
      await objectNormalizer.persistCache();
    } catch (cacheError) {
      console.warn(
        `[${scriptName}] 写入属性归一化缓存失败：${cacheError?.message ?? cacheError}`,
      );
    }
  }

  await recordTelemetrySafely(
    createIngestTelemetryRecord({
      options,
      summary,
      processedCount: processedDocs.length,
      adapterName,
      adapterModel,
      durationMs,
      written,
      dryRun: false,
      guardAlerts: guardResult.alerts,
    }),
  );

  if (entityNormalizationSummary) {
    await recordTelemetrySafely(
      createNormalizationTelemetryRecord(
        entityNormalizationSummary,
        {
          durationMs: entityNormalizationDurationMs,
          documents: processedDocs.length,
        },
        'entities',
      ),
    );
  }

  if (relationshipNormalizationSummary) {
    await recordTelemetrySafely(
      createNormalizationTelemetryRecord(
        relationshipNormalizationSummary,
        {
          durationMs: relationshipNormalizationDurationMs,
          documents: processedDocs.length,
        },
        'relationships',
      ),
    );
  }

  if (objectNormalizationSummary) {
    await recordTelemetrySafely(
      createNormalizationTelemetryRecord(
        objectNormalizationSummary,
        {
          durationMs: objectNormalizationDurationMs,
          documents: processedDocs.length,
        },
        'objects',
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
