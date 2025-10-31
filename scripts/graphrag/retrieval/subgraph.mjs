import { withSession } from '../neo4j-client.mjs';

const DEFAULT_MAX_HOPS = 2;
const DEFAULT_LIMIT = 50;

function normalizeParams(params = {}) {
  return {
    docId: params.docId,
    entityNames:
      Array.isArray(params.entityNames) && params.entityNames.length > 0
        ? params.entityNames
        : [],
    allowedLabels:
      Array.isArray(params.allowedLabels) && params.allowedLabels.length > 0
        ? params.allowedLabels
        : [],
    maxHops: params.maxHops ?? DEFAULT_MAX_HOPS,
    limit: params.limit ?? DEFAULT_LIMIT,
  };
}

function transformNodes(record) {
  const nodes = record.get('nodes') ?? [];
  return nodes.map((node) => ({
    identity: node.identity,
    labels: node.labels,
    data: node.data,
  }));
}

function transformEdges(record) {
  const edges = record.get('edges') ?? [];
  return edges.map((edge) => ({
    identity: edge.identity,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    data: edge.data,
  }));
}

export async function fetchSubgraph(driver, database, rawParams = {}) {
  const params = normalizeParams(rawParams);
  if (!params.docId) {
    throw new Error('缺少 docId');
  }

  const maxHops = Math.max(1, Math.min(params.maxHops ?? DEFAULT_MAX_HOPS, 5));
  const limit = Math.floor(
    Math.max(1, Math.min(params.limit ?? DEFAULT_LIMIT, 200)),
  );

  const nodeQuery = `
    MATCH (d:Doc {id: $docId})
    WITH d
    OPTIONAL MATCH path = (d)-[*1..${maxHops}]-(n)
    WHERE
      (size($entityNames) = 0 OR (n:Entity AND n.name IN $entityNames))
      AND (
        size($allowedLabels) = 0
        OR n IS NULL
        OR n = d
        OR any(label IN labels(n) WHERE label IN $allowedLabels)
      )
    WITH d, collect(DISTINCT n) AS neighbors
    WITH (CASE WHEN d IS NULL THEN [] ELSE [d] END) + neighbors AS nodeList
    UNWIND nodeList AS node
    WITH DISTINCT node
    LIMIT ${limit}
    RETURN collect({
      identity: toString(id(node)),
      labels: labels(node),
      data: node { .* }
    }) AS nodes
  `;

  const edgeQuery = `
    MATCH (d:Doc {id: $docId})
    WITH d
    OPTIONAL MATCH path = (d)-[*1..${maxHops}]-(n)
    WHERE
      (size($entityNames) = 0 OR (n:Entity AND n.name IN $entityNames))
      AND (
        size($allowedLabels) = 0
        OR n IS NULL
        OR n = d
        OR any(label IN labels(n) WHERE label IN $allowedLabels)
      )
    WITH d, collect(DISTINCT relationships(path)) AS relLists
    UNWIND relLists AS relList
    UNWIND relList AS rel
    WITH DISTINCT rel, startNode(rel) AS srcNode, endNode(rel) AS dstNode, d
    WHERE
      size($allowedLabels) = 0
      OR (
        (srcNode = d OR any(label IN labels(srcNode) WHERE label IN $allowedLabels))
        AND (dstNode = d OR any(label IN labels(dstNode) WHERE label IN $allowedLabels))
      )
    LIMIT ${limit}
    RETURN collect({
      identity: toString(id(rel)),
      source: toString(id(startNode(rel))),
      target: toString(id(endNode(rel))),
      type: type(rel),
      data: rel { .* }
    }) AS edges
  `;

  return withSession(driver, database, async (session) => {
    const nodeResult = await session.run(nodeQuery, {
      ...params,
      limit,
    });

    const nodes = nodeResult.records.length
      ? transformNodes(nodeResult.records[0])
      : [];
    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const edgeResult = await session.run(edgeQuery, {
      ...params,
      limit,
    });

    const edges = edgeResult.records.length
      ? transformEdges(edgeResult.records[0])
      : [];

    return {
      nodes,
      edges,
      constraints: {
        ...params,
        maxHops,
        limit,
      },
    };
  });
}
