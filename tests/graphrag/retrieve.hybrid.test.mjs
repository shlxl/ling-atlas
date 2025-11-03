import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  searchHybrid,
  __resetVectorSearchCachesForTest,
} from '../../scripts/graphrag/vector-search.mjs';

test('searchHybrid blends vector and structure signals with telemetry-aware metadata', async (t) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'graphrag-hybrid-'));
  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    delete process.env.GRAPHRAG_VECTOR_CONFIG_PATH;
    __resetVectorSearchCachesForTest();
  });

  const embeddingDim = 3;
  const docId = 'zh/content/test-doc/index';
  const embeddingsPath = path.join(tmpRoot, 'embeddings.json');
  const configPath = path.join(tmpRoot, 'vector-config.json');

  const embeddings = {
    items: [
      {
        url: '/zh/content/test-doc/',
        title: '测试文档',
        lang: 'zh',
        embedding: [0.1, 0.2, 0.3],
      },
    ],
  };

  await fs.writeFile(embeddingsPath, JSON.stringify(embeddings, null, 2), 'utf8');

  const config = {
    defaultIndex: 'doc-test',
    indexes: [
      {
        name: 'doc-test',
        type: 'document',
        embeddingsPath,
        model: 'placeholder-model',
        normalize: false,
        description: 'Test vector index',
      },
    ],
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

  process.env.GRAPHRAG_VECTOR_CONFIG_PATH = configPath;
  __resetVectorSearchCachesForTest();

  const driver = {
    session() {
      return {
        async run(query, params) {
          if (query.includes('MATCH (d:Doc)')) {
            return {
              records: [
                {
                  get(key) {
                    switch (key) {
                      case 'd':
                        return {
                          properties: {
                            id: docId,
                            title: '测试文档',
                            description: 'GraphRAG 混合检索示例',
                            locale: 'zh',
                            updated_at: '2025-02-01T00:00:00.000Z',
                            gnn_pagerank: 0.42,
                          },
                        };
                      case 'categories':
                        return ['GraphRAG'];
                      case 'tags':
                        return ['混合检索'];
                      case 'entities':
                        return [
                          {
                            properties: {
                              name: 'GraphRAG',
                              type: 'Concept',
                              salience: 0.8,
                              gnn_pagerank: 0.55,
                            },
                          },
                        ];
                      default:
                        return null;
                    }
                  },
                },
              ],
            };
          }
          throw new Error(`Unexpected query: ${query}`);
        },
        async close() {},
      };
    },
  };

  const fakeEmbedding = new Float32Array(embeddingDim).fill(0.1);
  const result = await searchHybrid(driver, 'neo4j', {
    embedding: Array.from(fakeEmbedding),
    limit: 1,
    vectorIndex: 'doc-test',
    sources: ['vector', 'structure'],
    alpha: [0.5, 0.5],
  });

  assert.equal(result.mode, 'hybrid');
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.doc_id, docId);
  assert.ok(item.score > 0);
  assert.ok(item.structure_score != null);
  assert.ok(item.score_components);
  assert.ok(item.reasons.some((reason) => reason.includes('PageRank')));
  assert.ok(result.meta.sources.includes('structure'));
  assert.deepEqual(result.meta.alpha, [0.5, 0.5]);
});
