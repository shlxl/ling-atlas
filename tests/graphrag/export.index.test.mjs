import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildGraphIndexContent,
  dedupeGraphTopics,
  deriveTopic,
} from '../../scripts/graphrag/export.mjs';

test('buildGraphIndexContent dedupes duplicates and renders markdown table', () => {
  const docId = 'zh/content/telemetry-guide/index';
  const canonical = deriveTopic({ docId });
  const { markdown, duplicates } = buildGraphIndexContent([
    {
      slug: canonical,
      title: '观测指标导览',
      description: '解读指标',
      docId,
    },
    {
      slug: 'zh-content-telemetry-guide-index',
      title: '观测指标导览（旧）',
      description: '旧目录',
      docId,
    },
  ]);

  assert.ok(markdown);
  assert.ok(
    markdown.includes('| 观测指标导览 | 解读指标 | [查看可视化](./zh-telemetry-guide/) |'),
  );
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].docId, docId);
  assert.equal(duplicates[0].kept, canonical);
  assert.equal(duplicates[0].discarded, 'zh-content-telemetry-guide-index');
});

test('buildGraphIndexContent returns null when no topics', () => {
  const { markdown, duplicates } = buildGraphIndexContent([]);
  assert.equal(markdown, null);
  assert.deepEqual(duplicates, []);
});

test('dedupeGraphTopics keeps entries without docId', () => {
  const { topics } = dedupeGraphTopics([
    { slug: 'custom', title: '无 Doc', description: '手工入口', docId: null },
  ]);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].slug, 'custom');
});
