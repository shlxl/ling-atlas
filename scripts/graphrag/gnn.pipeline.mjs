#!/usr/bin/env node
import 'dotenv/config';
import process from 'node:process';
import { readFile } from 'node:fs/promises';

import { resolveNeo4jConfig, getScriptName } from './config.mjs';
import { createDriver, verifyConnectivity, withSession } from './neo4j-client.mjs';

const DEFAULT_GNN_CONFIG = {
  graphs: {
    entity: {
      type: 'cypher',
      nodeQuery: 'MATCH (n:Entity) RETURN id(n) AS id, labels(n) AS labels',
      relationshipQuery: 'MATCH (a:Entity)-[r:RELATED]->(b:Entity) RETURN id(a) AS source, id(b) AS target, coalesce(r.weight, 1.0) AS weight',
      relationshipProperties: ['weight'],
      undirected: true,
      description: '实体-实体关系图，用于 PageRank/社区检测/Node2Vec',
    },
    doc_entity: {
      type: 'cypher',
      nodeQuery: 'MATCH (n:Doc) RETURN id(n) AS id, labels(n) AS labels UNION MATCH (n:Entity) RETURN id(n) AS id, labels(n) AS labels',
      relationshipQuery: 'MATCH (d:Doc)<-[:PART_OF]-(c:Chunk)-[:MENTIONS]->(e:Entity) RETURN id(d) AS source, id(e) AS target, 1.0 AS weight',
      relationshipProperties: ['weight'],
      undirected: false,
      description: '文档-实体双模图，可用于 Node2Vec 或双向推荐',
    },
  },
  defaults: {
    entity: {
      pagerank: { relationshipWeightProperty: 'weight' },
      labelPropagation: { relationshipWeightProperty: 'weight' },
      node2vec: {
        embeddingDimension: 64,
        walkLength: 80,
        walksPerNode: 10,
        inOutFactor: 1.0,
        returnFactor: 1.0,
      },
    },
    doc_entity: {
      node2vec: {
        embeddingDimension: 64,
        walkLength: 60,
        walksPerNode: 8,
        inOutFactor: 1.0,
        returnFactor: 1.0,
      },
    },
  },
};

let gnnConfigCache = null;

async function loadGnnConfig() {
  if (gnnConfigCache) return gnnConfigCache;
  try {
    const raw = await readFile('data/graphrag/gnn-config.json', 'utf8');
    gnnConfigCache = JSON.parse(raw);
  } catch (error) {
    gnnConfigCache = DEFAULT_GNN_CONFIG;
  }
  return gnnConfigCache;
}

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  return Number.isNaN(num) ? value : num;
}

function mergeParams(defaults = {}, overrides = {}) {
  const result = { ...defaults };
  for (const [key, raw] of Object.entries(overrides)) {
    result[key] = coerceValue(raw);
  }
  return result;
}

async function ensureProjection(session, name, spec) {
  const existsResult = await session.run('CALL gds.graph.exists($name) YIELD exists', { name });
  const exists = existsResult.records[0]?.get('exists');
  if (exists) {
    return 'exists';
  }
  if (spec.type === 'cypher') {
    const config = {};
    if (spec.relationshipProperties?.length) {
      config.relationshipProperties = spec.relationshipProperties;
    }
    if (spec.undirected) {
      config.relationshipOrientation = 'UNDIRECTED';
    }
    await session.run('CALL gds.graph.project.cypher($name, $nodeQuery, $relationshipQuery, $config)', {
      name,
      nodeQuery: spec.nodeQuery,
      relationshipQuery: spec.relationshipQuery,
      config,
    });
    return 'created';
  }
  throw new Error(`暂不支持的投影类型 ${spec.type}`);
}

function parseArgs(rawArgs) {
  const options = { params: {} };
  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    const next = rawArgs[i + 1];
    switch (token) {
      case '--graph':
        options.graph = next;
        i += 1;
        break;
      case '--algo':
        options.algo = next;
        i += 1;
        break;
      case '--write-property':
        options.writeProperty = next;
        i += 1;
        break;
      case '--drop':
        options.drop = true;
        break;
      default:
        if (token.startsWith('--param.')) {
          const key = token.slice('--param.'.length);
          options.params[key] = next;
          i += 1;
          break;
        }
        if (token.includes('=')) {
          const [k, v] = token.split('=');
          options.params[k] = v;
          break;
        }
        if (token.startsWith('--')) {
          throw new Error(`未知参数 ${token}`);
        }
    }
  }
  return options;
}

async function dropProjection(session, name) {
  await session.run(`CALL gds.graph.drop($name, false)`, { name });
}

async function runAlgorithm({ session, graph, algo, writeProperty, params }) {
  switch (algo) {
    case 'pagerank':
      return session.run(`CALL gds.pageRank.write($graph, $config)`, { graph, config: { writeProperty, ...params } });
    case 'labelPropagation':
    case 'label':
    case 'community':
      return session.run(`CALL gds.labelPropagation.write($graph, $config)`, { graph, config: { writeProperty, ...params } });
    case 'node2vec':
      return session.run(`CALL gds.node2vec.stream($graph, $config)`, { graph, config: params });
    default:
      throw new Error(`暂不支持的算法 ${algo}`);
  }
}

async function main() {
  const scriptName = getScriptName(import.meta.url);
  const rawArgs = process.argv.slice(2);
  const options = parseArgs(rawArgs);

  const neo4jConfig = resolveNeo4jConfig(rawArgs, { requirePassword: true });
  const driver = createDriver(neo4jConfig);

  try {
    await verifyConnectivity(driver);
    if (!options.graph) {
      throw new Error('请通过 --graph 指定投影名称');
    }

    const config = await loadGnnConfig();
    const graphSpec = config.graphs?.[options.graph];
    if (!graphSpec) {
      throw new Error(`未找到投影配置：${options.graph}`);
    }

    if (options.drop) {
      await withSession(driver, neo4jConfig.database, async (session) => {
        await dropProjection(session, options.graph);
      });
      console.log(`[${scriptName}] 已尝试删除投影 ${options.graph}`);
      return;
    }

    if (!options.algo) {
      throw new Error('请通过 --algo 指定算法');
    }

    const algoKey = options.algo;
    const defaults = (config.defaults?.[options.graph] ?? {})[algoKey] ?? {};
    const params = mergeParams(defaults, options.params);
    const writeProperty = options.writeProperty ?? `gnn_${options.algo}`;

    await withSession(driver, neo4jConfig.database, async (session) => {
      const status = await ensureProjection(session, options.graph, graphSpec);
      if (status === 'created') {
        console.log(`[${scriptName}] 已创建投影 ${options.graph}`);
      }

      const result = await runAlgorithm({
        session,
        graph: options.graph,
        algo: options.algo,
        writeProperty,
        params,
      });

      if (options.algo === 'node2vec') {
        const rows = result.records.map((record) => ({
          id: record.get('nodeId').toNumber(),
          value: Array.from(record.get('embedding')),
        }));
        await session.run(
          'UNWIND $rows AS row MATCH (n) WHERE id(n) = row.id SET n[$prop] = row.value',
          { rows, prop: writeProperty },
        );
        console.log(`[${scriptName}] Node2Vec 已写入 ${rows.length} 个节点 (${writeProperty})`);
      } else {
        const summary = result.summary;
        if (summary?.counters) {
          const counters = summary.counters.toObject?.() ?? summary.counters;
          console.log(counters);
        }
        console.log(`[${scriptName}] 算法 ${options.algo} 已执行（写入属性 ${writeProperty}）。`);
      }
    });
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
