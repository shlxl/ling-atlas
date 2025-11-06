import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateKnowledgeGraph,
  mergeRawGraphs,
  resolveProviders,
  sanitizeGraph,
  selectType,
} from '../../scripts/llm/graph-extractor.mjs';

describe('sanitizeGraph', () => {
  it('deduplicates nodes by normalized key and caps limits', () => {
    const graph = {
      nodes: [
        { id: 'Node A', type: '人物' },
        { id: 'node-a', type: '概念' },
        { id: 'Chapter-1', type: 'section' },
        {
          id: 'Node B',
          properties: [
            { key: 'type', value: '"参考文献"' },
            { key: 'foo', value: '"bar"' },
            { key: 'count', value: '1' },
          ],
        },
      ],
      relationships: [
        {
          source: { id: 'Node A', type: '人物' },
          target: { id: 'Node B', type: '概念' },
          type: 'RELATED',
        },
        {
          source: { id: 'Chapter-1', type: 'section' },
          target: { id: 'Node A', type: '人物' },
          type: 'RELATED',
        },
      ],
    };

    const sanitized = sanitizeGraph(graph);

    assert.equal(sanitized.nodes.length, 2);
    assert.deepEqual(sanitized.nodes[0], {
      id: 'Node A',
      type: 'Person',
      properties: undefined,
    });
    assert.deepEqual(sanitized.nodes[1], {
      id: 'Node B',
      type: 'Paper',
      properties: { foo: 'bar', count: 1 },
    });

    assert.equal(sanitized.relationships.length, 1);
    assert.deepEqual(sanitized.relationships[0], {
      source: { id: 'Node A', type: 'Person', properties: undefined },
      target: { id: 'Node B', type: 'Paper', properties: { foo: 'bar', count: 1 } },
      type: 'RELATED',
      properties: undefined,
    });
  });
});

describe('generateKnowledgeGraph', () => {
  it('invokes structured output on provided llm and sanitizes result', async () => {
    const fakeGraph = {
      nodes: [
        { id: 'A', type: '人物' },
        {
          id: 'B',
          properties: [
            { key: 'type', value: '"参考文献"' },
            { key: 'score', value: '0.9' },
          ],
        },
      ],
      relationships: [
        {
          source: { id: 'A', type: '人物' },
          target: {
            id: 'B',
            properties: [
              { key: 'type', value: '"参考文献"' },
              { key: 'score', value: '0.9' },
            ],
          },
          type: 'KNOWS',
          properties: [{ key: 'confidence', value: '0.8' }],
        },
      ],
      doc_entity_roots: [],
    };

    const invokeSpy = async () => fakeGraph;
    const structured = { invoke: invokeSpy };
    const mockLlm = {
      withStructuredOutput: (schema, config) => {
        assert.ok(schema);
        assert.equal(config?.name, 'build_knowledge_graph');
        return structured;
      },
    };

    const result = await generateKnowledgeGraph('some text', {
      llm: mockLlm,
      modelName: 'gemini-test',
    });

    assert.equal(result.nodes.length, 2);
    assert.equal(result.relationships.length, 1);
    assert.deepEqual(result.nodes[1], {
      id: 'B',
      type: 'Paper',
      properties: { score: 0.9 },
    });
    assert.deepEqual(result.relationships[0].properties, { confidence: 0.8 });
  });

  it('throws on empty text', async () => {
    await assert.rejects(() => generateKnowledgeGraph('   '), /没有从标准输入接收到文本/);
  });
});

describe('selectType', () => {
  it('prefers higher priority types', () => {
    assert.equal(selectType('概念', '人物'), 'Person');
    assert.equal(selectType('人物', '概念'), 'Person');
  });

  it('normalizes multilingual aliases to canonical English labels', () => {
    assert.equal(selectType('Artículo', '参考文献'), 'Paper');
  });
});

describe('resolveProviders', () => {
  it('parses comma separated providers and deduplicates', () => {
    assert.deepEqual(resolveProviders('openai, gemini,openai'), ['openai', 'gemini']);
  });

  it('falls back to gemini when input is empty', () => {
    assert.deepEqual(resolveProviders('  '), ['gemini']);
  });
});

describe('mergeRawGraphs', () => {
  it('merges node与关系数组', () => {
    const merged = mergeRawGraphs([
      {
        nodes: [{ id: 'A' }],
        relationships: [{ source: { id: 'A' }, target: { id: 'B' } }],
      },
      {
        nodes: [{ id: 'B' }],
        relationships: [{ source: { id: 'B' }, target: { id: 'C' } }],
      },
    ]);

    assert.equal(merged.nodes.length, 2);
    assert.equal(merged.relationships.length, 2);
  });
});
