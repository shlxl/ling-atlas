import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createObjectPropertyNormalizer } from '../../scripts/graphrag/object-normalizer.mjs';

const DATA_DIR = 'data';
const ALIAS_FILE = 'graphrag-object-alias.json';
const CACHE_FILE = 'graphrag-object-cache.json';

const BASE_ALIAS = [
  {
    key: 'weight',
    type: 'number',
    aliases: ['置信度', 'confidence'],
    valueRange: { min: 0, max: 1 },
    precision: 3,
  },
  {
    key: 'evidence',
    type: 'string',
    aliases: ['说明', '理由'],
  },
];

async function setupEnv({
  aliasEntries = BASE_ALIAS,
  cacheEntries = {},
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'object-normalizer-'));
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

function normalizedKey(value) {
  return value
    .normalize('NFKC')
    .replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, '')
    .toLowerCase()
    .trim();
}

test('alias entries normalize relationship properties and value types', async (t) => {
  const root = await setupEnv();
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const normalizer = await createObjectPropertyNormalizer({
    root,
    enabled: true,
  });

  const aggregation = {
    relationships: [
      {
        properties: {
          置信度: '0.87',
          说明: '来自示例文档',
        },
      },
    ],
  };

  await normalizer.normalizeAggregation({ title: 'Demo' }, aggregation);
  const props = aggregation.relationships[0].properties;
  assert.equal(typeof props.weight, 'number');
  assert.equal(props.weight, 0.87);
  assert.equal(props.evidence, '来自示例文档');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.alias, 2);
});

test('cache entries are reused when alias misses', async (t) => {
  const key = `评分`;
  const cacheKey = normalizedKey(key);
  const root = await setupEnv({
    cacheEntries: {
      [cacheKey]: {
        canonicalKey: 'weight',
        source: 'llm',
      },
    },
  });
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const normalizer = await createObjectPropertyNormalizer({
    root,
    enabled: true,
  });

  const aggregation = {
    relationships: [
      {
        properties: {
          [key]: 0.42,
        },
      },
    ],
  };

  await normalizer.normalizeAggregation({}, aggregation);
  assert.equal(aggregation.relationships[0].properties.weight, 0.42);
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
      return { key: 'evidence', confidence: 0.9, reason: 'mocked' };
    },
  };

  const normalizer = await createObjectPropertyNormalizer({
    root,
    enabled: true,
    classifier,
  });

  const aggregation = {
    relationships: [
      {
        properties: {
          描述: '引用自 GraphRAG 指南',
        },
      },
    ],
  };

  await normalizer.normalizeAggregation({}, aggregation);
  assert.equal(aggregation.relationships[0].properties.evidence, '引用自 GraphRAG 指南');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.llm, 1);
  await normalizer.persistCache();
  const cachePath = path.join(root, DATA_DIR, CACHE_FILE);
  const cacheRaw = await fs.readFile(cachePath, 'utf8');
  const cacheJSON = JSON.parse(cacheRaw);
  assert.ok(cacheJSON[normalizedKey('描述')]);
});

test('fallback path keeps original property when classifier fails', async (t) => {
  const root = await setupEnv();
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const classifier = {
    async invoke() {
      throw new Error('boom');
    },
  };

  const normalizer = await createObjectPropertyNormalizer({
    root,
    enabled: true,
    classifier,
  });

  const aggregation = {
    relationships: [
      {
        properties: {
          自定义属性: 'value',
        },
      },
    ],
  };

  await normalizer.normalizeAggregation({}, aggregation);
  assert.equal(aggregation.relationships[0].properties.自定义属性, 'value');
  const summary = normalizer.getSummary();
  assert.equal(summary.sources.fallback, 1);
  assert.equal(summary.llm.failures, 1);
});
