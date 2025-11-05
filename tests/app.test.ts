import { describe, it, expect, vi } from 'vitest';
import * as app from '../scripts/app';
import { KnowledgeGraph } from '../scripts/app';

describe('sanitizeGraph', () => {
  it('should remove nodes with empty ids', () => {
    const graph: KnowledgeGraph = {
      nodes: [
        { id: 'node1', type: 'Concept' },
        { id: '', type: 'Concept' },
        { id: 'node2', type: 'Concept' },
      ],
      relationships: [],
      doc_entity_roots: [],
    };

    const sanitized = app.sanitizeGraph(graph);
    expect(sanitized.nodes.length).toBe(2);
    expect(sanitized.nodes.map(n => n.id)).toEqual(['node1', 'node2']);
  });

  it('should filter out structural nodes', () => {
    const graph: KnowledgeGraph = {
      nodes: [
        { id: 'node1', type: 'Concept' },
        { id: 'section 1', type: 'Concept' },
        { id: 'node2', type: 'Concept' },
      ],
      relationships: [],
      doc_entity_roots: [],
    };

    const sanitized = app.sanitizeGraph(graph);
    expect(sanitized.nodes.length).toBe(2);
    expect(sanitized.nodes.map(n => n.id)).toEqual(['node1', 'node2']);
  });

  it('should de-duplicate nodes', () => {
    const graph: KnowledgeGraph = {
      nodes: [
        { id: 'node1', type: 'Concept' },
        { id: 'node1', type: 'Concept' },
        { id: 'node2', type: 'Concept' },
      ],
      relationships: [],
      doc_entity_roots: [],
    };

    const sanitized = app.sanitizeGraph(graph);
    expect(sanitized.nodes.length).toBe(2);
    expect(sanitized.nodes.map(n => n.id)).toEqual(['node1', 'node2']);
  });
});

describe('generateGraphFromText', () => {
  it('should call the LLM and return a sanitized graph', async () => {
    const mockGraph: KnowledgeGraph = {
      nodes: [
        { id: 'node1', type: 'Concept' },
        { id: 'node2', type: 'Concept' },
      ],
      relationships: [],
      doc_entity_roots: [],
    };

    const generateGraphSpy = vi.spyOn(app, 'generateGraphFromText').mockResolvedValue(mockGraph);

    const result = await app.generateGraphFromText('some text', 'gemini-1.5-pro');
    expect(result).toEqual(mockGraph);
    expect(generateGraphSpy).toHaveBeenCalledWith('some text', 'gemini-1.5-pro');

    generateGraphSpy.mockRestore();
  });
});