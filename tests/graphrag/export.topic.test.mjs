import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveTopic, normalizeTopicSlug } from '../../scripts/graphrag/export.mjs';

test('deriveTopic normalizes docId under content to locale-prefixed slug', () => {
  const slug = deriveTopic({ docId: 'zh/content/telemetry-guide/index' });
  assert.equal(slug, 'zh-telemetry-guide');
});

test('deriveTopic falls back to hyphenated path when not under content', () => {
  const slug = deriveTopic({ docId: 'en/guides/getting-started' });
  assert.equal(slug, 'en-guides-getting-started');
});

test('deriveTopic respects explicit topic while normalizing characters', () => {
  const slug = deriveTopic({
    docId: 'en/content/sample/index',
    topic: 'Graph RAG Topic!',
  });
  assert.equal(slug, 'graph-rag-topic');
});

test('normalizeTopicSlug collapses separators and strips unsafe characters', () => {
  const slug = normalizeTopicSlug('  zh//Graph RAG  ');
  assert.equal(slug, 'zh-graph-rag');
});
