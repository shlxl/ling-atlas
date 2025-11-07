import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRelationshipTypeNormalizer } from '../../scripts/graphrag/relationship-type-normalizer.mjs';

const DATA_DIR = 'data';
const ALIAS_FILE = 'graphrag-relationship-alias.json';
const CACHE_FILE = 'graphrag-relationship-type-cache.json';

async function setupEnv({ aliasEntries = [], cacheEntries = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relationship-normalizer-'));
  const dataDir = path.join(root, DATA_DIR);
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
  return root;
}

function normalizedLabel(value) {
  return value
    .normalize('NFKC')
    .replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, '')
    .toLowerCase()
    .trim();
}

test('alias entries override relationship type', async (t) => {
  const root = await setupEnv({
    aliasEntries: [
      {
        relation: 'CollaboratesWith',
        aliases: ['合作', 'collaborates'],
      },
    ],
  });
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const normalizer = await createRelationshipTypeNormalizer({
    root,
    enabled: true,
  });

  const aggregation = {
    relationships: [
      {
        type: '合作',
        source: { name: '项目A' },
        target: { name: '项目B' },
      },
    ],
  };

  await normalizer.normalizeAggregation({ title: '协作示例' }, aggregation);
  assert.equal(aggregation.relationships[0].type, 'CollaboratesWith');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.alias, 1);
});

test('cache entries are reused when alias misses', async (t) => {
  const labelKey = `label:${normalizedLabel('引用')}`;
  const root = await setupEnv({
    cacheEntries: {
      [labelKey]: {
        relation: 'Mentions',
        source: 'llm',
      },
    },
  });
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const normalizer = await createRelationshipTypeNormalizer({
    root,
    enabled: true,
  });

  const aggregation = {
    relationships: [
      {
        type: '引用',
        source: { name: '文档A' },
        target: { name: '文档B' },
      },
    ],
  };

  await normalizer.normalizeAggregation({}, aggregation);
  assert.equal(aggregation.relationships[0].type, 'Mentions');
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
      return { relation: 'CompetesWith', confidence: 0.7, reason: 'mocked' };
    },
  };

  const normalizer = await createRelationshipTypeNormalizer({
    root,
    enabled: true,
    classifier,
  });

  const aggregation = {
    relationships: [
      {
        type: '竞争',
        source: { name: '方案A' },
        target: { name: '方案B' },
      },
    ],
  };

  await normalizer.normalizeAggregation({}, aggregation);
  assert.equal(aggregation.relationships[0].type, 'CompetesWith');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.llm, 1);
  await normalizer.persistCache();
  const cachePath = path.join(root, DATA_DIR, CACHE_FILE);
  const cacheRaw = await fs.readFile(cachePath, 'utf8');
  const cacheJSON = JSON.parse(cacheRaw);
  assert.ok(cacheJSON[labelKeyFor('竞争')]);

  function labelKeyFor(label) {
    return `label:${normalizedLabel(label)}`;
  }
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

  const normalizer = await createRelationshipTypeNormalizer({
    root,
    enabled: true,
    classifier,
  });

  const aggregation = {
    relationships: [
      {
        type: '引用',
        source: { name: 'A' },
        target: { name: 'B' },
      },
    ],
  };

  await normalizer.normalizeAggregation({}, aggregation);
  assert.equal(aggregation.relationships[0].type, '引用');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.fallback, 1);
  assert.equal(summary.llm.failures, 1);
});
