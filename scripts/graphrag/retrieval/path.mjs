import { withSession } from '../neo4j-client.mjs';

const DEFAULT_MAX_LENGTH = 4;

function normalizeParams(params = {}) {
  return {
    source: params.sourceEntity ?? params.source,
    target: params.targetEntity ?? params.target,
    maxLength: params.maxLength ?? DEFAULT_MAX_LENGTH,
  };
}

export async function fetchShortestPath(driver, database, rawParams = {}) {
  const params = normalizeParams(rawParams);
  if (!params.source || !params.target) {
    throw new Error('缺少 sourceEntity 或 targetEntity');
  }

  const maxLength = Math.max(1, Math.min(params.maxLength ?? DEFAULT_MAX_LENGTH, 8));
  const query = `
      MATCH (src:Entity {name: $source})
      MATCH (dst:Entity {name: $target})
      CALL {
        WITH src, dst
        MATCH path = shortestPath(
          (src)-[:RELATED*..${maxLength}]-(dst)
        )
        RETURN path
        LIMIT 1
      }
      WITH path,
           [node IN nodes(path) |
             {
               identity: toString(id(node)),
               labels: labels(node),
               data: node { .* }
             }
           ] AS nodes,
           [rel IN relationships(path) |
             {
               identity: toString(id(rel)),
               source: toString(id(startNode(rel))),
               target: toString(id(endNode(rel))),
               type: type(rel),
               data: rel { .* }
             }
           ] AS edges
      RETURN nodes, edges, length(path) AS hops
      `;

  return withSession(driver, database, async (session) => {
    const result = await session.run(query, params);

    if (result.records.length === 0) {
      return { nodes: [], edges: [], length: null };
    }

    const record = result.records[0];
    return {
      nodes: record.get('nodes') ?? [],
      edges: record.get('edges') ?? [],
      length: record.get('hops'),
    };
  });
}
