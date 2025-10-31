import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  dedupeGraphTopics,
  ensureTopicDirCompatibility,
  deriveTopic,
} from '../../scripts/graphrag/export.mjs';

test('dedupeGraphTopics prefers canonical slug for duplicated docId', () => {
  const docId = 'zh/content/telemetry-guide/index';
  const canonical = deriveTopic({ docId });
  const { topics, duplicates } = dedupeGraphTopics([
    {
      slug: canonical,
      title: '观测指标导览',
      description: 'A',
      docId,
    },
    {
      slug: 'zh-content-telemetry-guide-index',
      title: '旧目录',
      description: 'B',
      docId,
    },
  ]);

  assert.equal(topics.length, 1);
  assert.equal(topics[0].slug, canonical);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].docId, docId);
  assert.equal(duplicates[0].kept, canonical);
  assert.equal(duplicates[0].discarded, 'zh-content-telemetry-guide-index');
});

test('ensureTopicDirCompatibility detects conflicting metadata', async (t) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'graphrag-topic-'));
  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const topicDir = path.join(tmpRoot, 'zh-telemetry-guide');
  await fs.mkdir(topicDir, { recursive: true });

  const metadataPath = path.join(topicDir, 'metadata.json');
  await fs.writeFile(
    metadataPath,
    JSON.stringify({ doc: { id: 'zh/content/telemetry-guide/index' } }, null, 2),
    'utf8',
  );

  await ensureTopicDirCompatibility({
    topicDir,
    docId: 'zh/content/telemetry-guide/index',
    dryRun: false,
  });

  await assert.rejects(
    () =>
      ensureTopicDirCompatibility({
        topicDir,
        docId: 'zh/content/another-doc/index',
        dryRun: false,
      }),
    /已存在且绑定 Doc/,
  );
});
