import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  coerceValue,
  mergeParams,
  parseArgs,
} from '../../scripts/graphrag/gnn.pipeline.mjs';

test('coerceValue converts booleans and numerics', () => {
  assert.equal(coerceValue('true'), true);
  assert.equal(coerceValue('false'), false);
  assert.equal(coerceValue('42'), 42);
  assert.equal(coerceValue('3.14'), 3.14);
  assert.equal(coerceValue('value'), 'value');
});

test('mergeParams overrides defaults with coerced values', () => {
  const defaults = { limit: 10, enabled: false, name: 'pagerank' };
  const merged = mergeParams(defaults, { limit: '20', enabled: 'true' });
  assert.deepEqual(merged, { limit: 20, enabled: true, name: 'pagerank' });
});

test('parseArgs handles graph, algo, write property and params', () => {
  const options = parseArgs([
    '--graph',
    'entity',
    '--algo',
    'pagerank',
    '--write-property',
    'gnn_pr',
    '--param.tolerance',
    '0.0001',
    '--param.iterations',
    '50',
  ]);
  assert.equal(options.graph, 'entity');
  assert.equal(options.algo, 'pagerank');
  assert.equal(options.writeProperty, 'gnn_pr');
  assert.equal(options.params.tolerance, '0.0001');
  assert.equal(options.params.iterations, '50');
});

test('parseArgs supports drop flag', () => {
  const options = parseArgs(['--graph', 'entity', '--drop']);
  assert.equal(options.graph, 'entity');
  assert.equal(options.drop, true);
});
