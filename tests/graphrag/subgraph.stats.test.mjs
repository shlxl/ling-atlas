import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeSubgraphStats } from '../../scripts/graphrag/retrieval/subgraph.mjs';

test('summarizeSubgraphStats aggregates labels, hops, and truncation flags', () => {
  const nodes = [
    { identity: '1', labels: ['Doc'], data: {}, hop: 0 },
    { identity: '2', labels: ['Entity', 'Concept'], data: {}, hop: 1 },
    { identity: '3', labels: ['Entity', 'Person'], data: {}, hop: 3 },
  ];
  const edges = [
    { identity: 'e1', source: '1', target: '2', type: 'MENTIONS', data: {} },
    { identity: 'e2', source: '2', target: '3', type: 'MENTIONS', data: {} },
    { identity: 'e3', source: '3', target: '1', type: 'RELATES', data: {} },
  ];

  const stats = summarizeSubgraphStats(nodes, edges, {
    totalNodes: 5,
    totalEdges: 6,
    nodeLimit: 3,
    edgeLimit: 4,
  });

  assert.equal(stats.nodes.total, 5);
  assert.equal(stats.nodes.returned, 3);
  assert.equal(stats.nodes.truncated, true);
  assert.equal(stats.nodes.limit, 3);
  assert.equal(stats.nodes.byLabel.Doc, 1);
  assert.equal(stats.nodes.byLabel.Entity, 2);
  assert.equal(stats.nodes.byLabel.Person, 1);
  assert.equal(stats.nodes.hops['0'], 1);
  assert.equal(stats.nodes.hops['1'], 1);
  assert.equal(stats.nodes.hops['3'], 1);
  assert.equal(stats.nodes.maxHop, 3);

  assert.equal(stats.edges.total, 6);
  assert.equal(stats.edges.returned, 3);
  assert.equal(stats.edges.truncated, true);
  assert.equal(stats.edges.limit, 4);
  assert.equal(stats.edges.byType.MENTIONS, 2);
  assert.equal(stats.edges.byType.RELATES, 1);
});
