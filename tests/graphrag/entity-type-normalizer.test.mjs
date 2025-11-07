import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createEntityTypeNormalizer } from '../../scripts/graphrag/entity-type-normalizer.mjs';

const DATA_DIR = 'data';
const ALIAS_FILE = 'graphrag-entity-alias.json';
const CACHE_FILE = 'graphrag-entity-type-cache.json';

async function setupEnv({
  aliasEntries = [],
  cacheEntries = {},
} = {}) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'entity-normalizer-'));
  const dataDir = path.join(tmpRoot, DATA_DIR);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, ALIAS_FILE),
    JSON.stringify(aliasEntries, null, 2),
    'utf8',
  );
  await fs.writeFile(
    path.join(dataDir, CACHE_FILE),
    JSON.stringify(cacheEntries, null, 2),
    'utf8',
  );
  return tmpRoot;
}

function normalizedKey(value) {
  return value
    .normalize('NFKC')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?]/g, '')
    .replace(/<.*?>/g, '')
    .replace(/\{.*?}/g, '')
    .replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, '')
    .toLowerCase()
    .trim();
}

test('alias entries override entity type', async (t) => {
  const root = await setupEnv({
    aliasEntries: [
      {
        type: 'Project',
        canonical: 'Ling Atlas',
        aliases: ['Ling Atlas'],
      },
    ],
  });
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const normalizer = await createEntityTypeNormalizer({
    root,
    enabled: true,
  });

  const entities = [{ name: 'Ling Atlas', type: 'Concept' }];
  await normalizer.normalizeAggregation(
    { title: 'Ling Atlas 指南' },
    { entities },
  );

  assert.equal(entities[0].type, 'Project');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.alias, 1);
});

test('cache entries are reused when alias misses', async (t) => {
  const key = normalizedKey('GraphRAG 研究综述');
  const root = await setupEnv({
    cacheEntries: {
      [key]: {
        type: 'Paper',
        source: 'llm',
        reason: 'seed',
      },
    },
  });
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const normalizer = await createEntityTypeNormalizer({
    root,
    enabled: true,
  });

  const entities = [{ name: 'GraphRAG 研究综述', type: 'Concept' }];
  await normalizer.normalizeAggregation({}, { entities });
  assert.equal(entities[0].type, 'Paper');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.cache, 1);
});

test('LLM classifier fallback populates cache when enabled', async (t) => {
  const root = await setupEnv();
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const classifier = {
    async invoke() {
      return { type: 'Paper', confidence: 0.9, reason: 'mocked' };
    },
  };

  const normalizer = await createEntityTypeNormalizer({
    root,
    enabled: true,
    classifier,
  });

  const entities = [{ name: 'GraphRAG 研究综述', type: 'Concept' }];
  await normalizer.normalizeAggregation({}, { entities });
  assert.equal(entities[0].type, 'Paper');

  const summary = normalizer.getSummary();
  assert.equal(summary.sources.llm, 1);
  assert.equal(summary.llm.success, 1);
  await normalizer.persistCache();
  const cachePath = path.join(root, DATA_DIR, CACHE_FILE);
  const cacheRaw = await fs.readFile(cachePath, 'utf8');
  const cacheJSON = JSON.parse(cacheRaw);
  assert.ok(cacheJSON[normalizedKey('GraphRAG 研究综述')]);
});

test('fallback path keeps original type when classifier fails', async (t) => {
  const root = await setupEnv();
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const classifier = {
    async invoke() {
      throw new Error('boom');
    },
  };

  const normalizer = await createEntityTypeNormalizer({
    root,
    enabled: true,
    classifier,
  });

  const entities = [{ name: '未知概念', type: 'Concept' }];
  await normalizer.normalizeAggregation({}, { entities });

  assert.equal(entities[0].type, 'Concept');
  const summary = normalizer.getSummary();
  assert.equal(summary.llm.failures, 1);
  assert.equal(summary.sources.fallback, 1);
});
