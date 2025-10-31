import { withSession } from '../neo4j-client.mjs';

const DEFAULT_MAX_HOPS = 2;
const MAX_HOPS_CAP = 6;
const DEFAULT_NODE_LIMIT = 50;
const DEFAULT_EDGE_LIMIT = 100;
const NODE_LIMIT_CAP = 500;
const EDGE_LIMIT_CAP = 1000;

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function sanitizeInteger(value, fallback, cap) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, cap);
}

function toNumber(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch {
      return fallback;
    }
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeParams(params = {}) {
  const entityNames = normalizeStringArray(params.entityNames);
  const allowedLabels = normalizeStringArray(params.allowedLabels);
  const relationshipTypes = normalizeStringArray(params.relationshipTypes);

  const maxHops = sanitizeInteger(
    params.maxHops ?? DEFAULT_MAX_HOPS,
    DEFAULT_MAX_HOPS,
    MAX_HOPS_CAP,
  );

  const baseNodeLimit = sanitizeInteger(
    params.limit ?? params.nodeLimit ?? DEFAULT_NODE_LIMIT,
    DEFAULT_NODE_LIMIT,
    NODE_LIMIT_CAP,
  );
  const nodeLimit = sanitizeInteger(
    params.nodeLimit ?? baseNodeLimit,
    baseNodeLimit,
    NODE_LIMIT_CAP,
  );
  const edgeLimit = sanitizeInteger(
    params.edgeLimit ?? params.limit ?? DEFAULT_EDGE_LIMIT,
    DEFAULT_EDGE_LIMIT,
    EDGE_LIMIT_CAP,
  );

  return {
    docId: typeof params.docId === 'string' ? params.docId : null,
    entityNames,
    allowedLabels,
    relationshipTypes,
    maxHops,
    nodeLimit,
    edgeLimit,
  };
}

function buildNodeQuery(maxHops) {
  return `
  MATCH (d:Doc {id: $docId})
  CALL {
    WITH d
    OPTIONAL MATCH path = (d)-[*1..${maxHops}]-(n)
    WHERE
      n IS NOT NULL
      AND (
        size($entityNames) = 0
        OR (n:Entity AND n.name IN $entityNames)
      )
      AND (
        size($allowedLabels) = 0
        OR any(label IN labels(n) WHERE label IN $allowedLabels)
      )
      AND (
        size($relationshipTypes) = 0
        OR all(rel IN relationships(path) WHERE type(rel) IN $relationshipTypes)
      )
    WITH n, min(length(path)) AS hop
    RETURN collect({ node: n, hop: hop }) AS neighbors
  }
  WITH d, neighbors
  UNWIND ([{ node: d, hop: 0 }] + neighbors) AS pair
  WITH pair.node AS node, pair.hop AS hop
  WHERE node IS NOT NULL
  WITH node, min(hop) AS hop
  ORDER BY hop ASC, coalesce(node.updated_at, node.updated, node.created_at, node.title, node.name, node.id) DESC, toString(id(node)) ASC
  WITH collect({ node: node, hop: hop }) AS ordered
  RETURN [
    item IN ordered |
      {
        identity: toString(id(item.node)),
        labels: labels(item.node),
        properties: properties(item.node),
        hop: item.hop
      }
  ] AS orderedNodes,
  size(ordered) AS totalNodes
`;
}

const EDGE_QUERY = `
  UNWIND $nodeIds AS sourceId
  WITH DISTINCT sourceId, $nodeIds AS nodeIds, $relationshipTypes AS relationshipTypes
  MATCH (src)-[rel]-(dst)
  WHERE
    toString(id(src)) = sourceId
    AND toString(id(dst)) IN nodeIds
    AND (
      size(relationshipTypes) = 0
      OR type(rel) IN relationshipTypes
    )
  WITH DISTINCT rel
  ORDER BY id(rel)
  RETURN collect({
    identity: toString(id(rel)),
    source: toString(id(startNode(rel))),
    target: toString(id(endNode(rel))),
    type: type(rel),
    properties: properties(rel)
  }) AS edges
`;

export function summarizeSubgraphStats(nodes, edges, meta = {}) {
  const totalNodes = toNumber(meta.totalNodes, nodes.length);
  const totalEdges = toNumber(meta.totalEdges, edges.length);
  const stats = {
    nodes: {
      total: totalNodes,
      returned: nodes.length,
      truncated: totalNodes > nodes.length,
      byLabel: {},
      hops: {},
      maxHop: 0,
      limit: meta.nodeLimit ?? null,
    },
    edges: {
      total: totalEdges,
      returned: edges.length,
      truncated: totalEdges > edges.length,
      byType: {},
      limit: meta.edgeLimit ?? null,
    },
  };

  for (const node of nodes) {
    const labels = Array.isArray(node.labels) ? node.labels : [];
    for (const label of labels) {
      stats.nodes.byLabel[label] = (stats.nodes.byLabel[label] ?? 0) + 1;
    }
    const hop = toNumber(node.hop, 0);
    const hopKey = String(hop);
    stats.nodes.hops[hopKey] = (stats.nodes.hops[hopKey] ?? 0) + 1;
    if (hop > stats.nodes.maxHop) {
      stats.nodes.maxHop = hop;
    }
  }

  for (const edge of edges) {
    const type = edge.type ?? 'UNKNOWN';
    stats.edges.byType[type] = (stats.edges.byType[type] ?? 0) + 1;
  }

  return stats;
}

export async function fetchSubgraph(driver, database, rawParams = {}) {
  const params = normalizeParams(rawParams);
  if (!params.docId) {
    throw new Error('缺少 docId');
  }

  return withSession(driver, database, async (session) => {
    const nodeQuery = buildNodeQuery(params.maxHops);
    const nodeResult = await session.run(nodeQuery, {
      docId: params.docId,
      entityNames: params.entityNames,
      allowedLabels: params.allowedLabels,
      relationshipTypes: params.relationshipTypes,
    });

    if (!nodeResult.records.length) {
      const emptyStats = summarizeSubgraphStats(
        [],
        [],
        {
          totalNodes: 0,
          totalEdges: 0,
          nodeLimit: params.nodeLimit,
          edgeLimit: params.edgeLimit,
        },
      );
      return {
        nodes: [],
        edges: [],
        constraints: {
          docId: params.docId,
          entityNames: params.entityNames,
          allowedLabels: params.allowedLabels,
          relationshipTypes: params.relationshipTypes,
          maxHops: params.maxHops,
          nodeLimit: params.nodeLimit,
          edgeLimit: params.edgeLimit,
          limit: params.nodeLimit,
        },
        stats: emptyStats,
      };
    }

    const nodeRecord = nodeResult.records[0];
    const orderedNodesRaw = nodeRecord.get('orderedNodes') ?? [];
    const totalNodes = toNumber(
      nodeRecord.get('totalNodes'),
      orderedNodesRaw.length,
    );
    const limitedNodesRaw = orderedNodesRaw.slice(0, params.nodeLimit);

    const nodes = limitedNodesRaw.map((node) => ({
      identity: node.identity,
      labels: Array.isArray(node.labels) ? node.labels : [],
      properties: node.properties ?? {},
      hop: toNumber(node.hop, 0),
    }));

    const nodeIds = nodes.map((node) => node.identity);
    let edges = [];
    let totalEdges = 0;

    if (nodeIds.length) {
      const edgeResult = await session.run(EDGE_QUERY, {
        nodeIds,
        relationshipTypes: params.relationshipTypes,
      });

      if (edgeResult.records.length) {
        const rawEdges = edgeResult.records[0].get('edges') ?? [];
        totalEdges = rawEdges.length;
        edges = rawEdges.slice(0, params.edgeLimit);
      }
    }

    const stats = summarizeSubgraphStats(nodes, edges, {
      totalNodes,
      totalEdges,
      nodeLimit: params.nodeLimit,
      edgeLimit: params.edgeLimit,
    });

    return {
      nodes,
      edges,
      constraints: {
        docId: params.docId,
        entityNames: params.entityNames,
        allowedLabels: params.allowedLabels,
        relationshipTypes: params.relationshipTypes,
        maxHops: params.maxHops,
        nodeLimit: params.nodeLimit,
        edgeLimit: params.edgeLimit,
        limit: params.nodeLimit,
      },
      stats,
    };
  });
}
