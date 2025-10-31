import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  resolveAlpha,
  normalizeCosine,
  buildStructureReason,
} from '../../scripts/graphrag/vector-search.mjs';

test('resolveAlpha returns default weights when input empty', () => {
  assert.deepEqual(resolveAlpha(), { vector: 0.7, structure: 0.3 });
  assert.deepEqual(resolveAlpha([]), { vector: 0.7, structure: 0.3 });
});

test('resolveAlpha normalizes provided weights', () => {
  const weights = resolveAlpha(['0.2', '0.8']);
  assert.ok(Math.abs(weights.vector - 0.2) < 1e-6);
  assert.ok(Math.abs(weights.structure - 0.8) < 1e-6);
});

test('resolveAlpha falls back when sum is zero or NaN', () => {
  assert.deepEqual(resolveAlpha(['0', '0']), { vector: 0.7, structure: 0.3 });
  assert.deepEqual(resolveAlpha(['not-a-number']), { vector: 0.7, structure: 0.3 });
});

test('normalizeCosine maps cosine score to [0,1]', () => {
  assert.equal(normalizeCosine(-1), 0);
  assert.equal(normalizeCosine(0), 0.5);
  assert.equal(normalizeCosine(1), 1);
  assert.equal(normalizeCosine(NaN), 0);
});

test('buildStructureReason prefers doc/entity signals', () => {
  const reasonDoc = buildStructureReason({
    score: 0.123,
    scoreSource: { type: 'doc', key: 'gnn_pagerank', value: 0.456 },
    topEntities: [],
  });
  assert.equal(reasonDoc, 'Doc PageRank 0.456');

  const reasonEntity = buildStructureReason({
    score: 0.42,
    scoreSource: { type: 'entity_max', key: 'gnn_pagerank', value: 0.9, entity: 'GraphRAG' },
    topEntities: [{ name: 'GraphRAG', pagerank: 0.9 }],
  });
  assert.equal(reasonEntity, 'GraphRAG PageRank 0.900');

  const reasonFallback = buildStructureReason({
    score: 0.21,
    scoreSource: null,
    topEntities: [{ name: 'Hybrid', pagerank: 0.33 }],
  });
  assert.equal(reasonFallback, '实体 Hybrid PageRank 0.330');
});
