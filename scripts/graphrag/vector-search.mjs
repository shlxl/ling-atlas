import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';

import { withSession } from './neo4j-client.mjs';

const DEFAULT_CONFIG = {
  defaultIndex: 'doc-default',
  indexes: [
    {
      name: 'doc-default',
      type: 'document',
      embeddingsPath: 'docs/public/data/embeddings.json',
      model: 'Xenova/all-MiniLM-L6-v2',
      normalize: true,
      description: '默认文档语义向量（来自 embeddings.json）',
    },
  ],
};

let configCache = null;
let embeddingsCache = null;
let embedderPromise = null;

async function loadVectorConfig() {
  if (configCache) return configCache;
  try {
    const raw = await readFile('data/graphrag/vector-config.json', 'utf8');
    configCache = JSON.parse(raw);
  } catch (error) {
    configCache = DEFAULT_CONFIG;
  }
  return configCache;
}

async function loadIndexConfig(indexName) {
  const config = await loadVectorConfig();
  const index = config.indexes.find((item) => item.name === indexName);
  if (!index) {
    throw new Error(`未找到向量索引配置：${indexName}`);
  }
  return index;
}

function urlToDocId(url) {
  if (!url) return null;
  let pathStr = url.replace(/^https?:\/\//, '');
  pathStr = pathStr.replace(/^\//, '');
  if (pathStr.endsWith('.html')) {
    pathStr = pathStr.replace(/\.html$/, '/index');
  } else if (pathStr.endsWith('/index')) {
    // already normalized
  } else if (pathStr.endsWith('/')) {
    pathStr = `${pathStr}index`;
  } else if (!pathStr.endsWith('index')) {
    pathStr = `${pathStr}/index`;
  }
  return pathStr;
}

function normalizeVector(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) {
    out[i] = vec[i] / norm;
  }
  return out;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch (error) {
      return Number(value);
    }
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractGnnScores(data = {}) {
  const scores = {};
  for (const [key, raw] of Object.entries(data)) {
    if (!key.startsWith('gnn_')) continue;
    if (Array.isArray(raw)) continue;
    const value = toNumber(raw);
    if (!Number.isFinite(value)) continue;
    scores[key] = value;
  }
  return scores;
}

function computeStructureMetrics({ docProperties = {}, entities = [] }) {
  const docScores = extractGnnScores(docProperties);

  const pagerankValues = [];
  const communityCounts = new Map();

  const entitySummaries = entities.map((entity) => {
    const structureScores = entity.structureScores ?? {};
    const pagerank = Number.isFinite(structureScores.gnn_pagerank)
      ? structureScores.gnn_pagerank
      : null;
    if (Number.isFinite(pagerank)) {
      pagerankValues.push(pagerank);
    }
    const community =
      Number.isFinite(structureScores.gnn_community)
        ? structureScores.gnn_community
        : Number.isFinite(structureScores.gnn_labelPropagation)
          ? structureScores.gnn_labelPropagation
          : null;
    if (Number.isFinite(community)) {
      const key = String(community);
      communityCounts.set(key, (communityCounts.get(key) ?? 0) + 1);
    }
    return {
      name: entity.name,
      type: entity.type,
      salience: entity.salience,
      structureScores,
      pagerank,
    };
  });

  const pagerankSum = pagerankValues.reduce((sum, value) => sum + value, 0);
  const pagerankAvg = pagerankValues.length ? pagerankSum / pagerankValues.length : null;
  const pagerankMax = pagerankValues.length ? Math.max(...pagerankValues) : null;

  entitySummaries.sort((a, b) => {
    const aValue = Number.isFinite(a.pagerank) ? a.pagerank : -Infinity;
    const bValue = Number.isFinite(b.pagerank) ? b.pagerank : -Infinity;
    return bValue - aValue;
  });

  const topEntities = entitySummaries.slice(0, 3);

  const candidateScores = [];
  if (Number.isFinite(docScores.gnn_pagerank)) {
    candidateScores.push({
      type: 'doc',
      key: 'gnn_pagerank',
      value: docScores.gnn_pagerank,
    });
  }
  if (Number.isFinite(pagerankAvg)) {
    candidateScores.push({
      type: 'entity_avg',
      key: 'gnn_pagerank',
      value: pagerankAvg,
    });
  }
  if (Number.isFinite(pagerankMax)) {
    candidateScores.push({
      type: 'entity_max',
      key: 'gnn_pagerank',
      value: pagerankMax,
      entity: topEntities[0]?.name ?? null,
    });
  }

  let score = 0;
  let scoreSource = null;
  if (candidateScores.length) {
    scoreSource = candidateScores.reduce((best, current) => {
      if (!best || current.value > best.value) {
        return current;
      }
      return best;
    }, null);
    score = scoreSource?.value ?? 0;
  }

  const communities = [...communityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([community, count]) => ({
      community,
      count,
    }));

  return {
    docScores,
    pagerank: {
      avg: pagerankAvg,
      max: pagerankMax,
      sum: pagerankSum,
      count: pagerankValues.length,
    },
    communities,
    topEntities,
    score,
    scoreSource,
  };
}

function normalizeCosine(score) {
  if (!Number.isFinite(score)) return 0;
  const normalized = (score + 1) / 2;
  if (normalized <= 0) return 0;
  if (normalized >= 1) return 1;
  return normalized;
}

function resolveAlpha(alphaInput) {
  const DEFAULT = { vector: 0.7, structure: 0.3 };
  if (!Array.isArray(alphaInput) || alphaInput.length === 0) {
    return DEFAULT;
  }
  const weights = alphaInput
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!weights.length) return DEFAULT;
  const vectorWeight = weights[0] ?? 1;
  const structureWeight = weights[1] ?? 0;
  const sum = vectorWeight + structureWeight;
  if (!sum) return DEFAULT;
  return {
    vector: vectorWeight / sum,
    structure: structureWeight / sum,
  };
}

function buildStructureReason(structure) {
  if (!structure) return null;
  const { score, scoreSource, topEntities } = structure;
  if (!Number.isFinite(score) || score <= 0) return null;
  if (scoreSource?.type === 'doc') {
    return `Doc PageRank ${scoreSource.value.toFixed(3)}`;
  }
  if (scoreSource?.type === 'entity_avg') {
    return `实体 PageRank 均值 ${scoreSource.value.toFixed(3)}`;
  }
  if (scoreSource?.type === 'entity_max' && scoreSource.value) {
    const name = scoreSource.entity ?? topEntities?.[0]?.name ?? '';
    const label = name ? `${name} PageRank` : '实体 PageRank 峰值';
    return `${label} ${scoreSource.value.toFixed(3)}`;
  }
  if (topEntities?.length) {
    const top = topEntities[0];
    if (Number.isFinite(top.pagerank)) {
      return `实体 ${top.name ?? '未知'} PageRank ${top.pagerank.toFixed(3)}`;
    }
  }
  return `结构得分 ${score.toFixed(3)}`;
}

async function loadEmbeddings(indexConfig) {
  if (embeddingsCache?.name === indexConfig.name) {
    return embeddingsCache.data;
  }
  const filePath = path.resolve(indexConfig.embeddingsPath);
  const raw = await readFile(filePath, 'utf8');
  const json = JSON.parse(raw);
  const items = json.items ?? [];
  const vectors = items.map((item) => ({
    docId: urlToDocId(item.url),
    url: item.url,
    title: item.title,
    lang: item.lang,
    embedding: indexConfig.normalize
      ? normalizeVector(Float32Array.from(item.embedding))
      : Float32Array.from(item.embedding),
  }));
  embeddingsCache = { name: indexConfig.name, data: vectors };
  return vectors;
}

async function getEmbedder(modelName) {
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', modelName, {
      pooling: 'mean',
      normalize: true,
    });
  }
  return embedderPromise;
}

async function embedQuestion(question, modelName) {
  const embedder = await getEmbedder(modelName);
  const tensor = await embedder(question);
  // shape: [1, tokens, dim]
  const { dims, data } = tensor;
  const tokens = dims?.[1] ?? 1;
  const dim = dims?.[2] ?? data.length;
  const vec = new Float32Array(dim);
  for (let token = 0; token < tokens; token += 1) {
    const offset = token * dim;
    for (let i = 0; i < dim; i += 1) {
      vec[i] += data[offset + i];
    }
  }
  for (let i = 0; i < dim; i += 1) {
    vec[i] /= tokens;
  }
  return normalizeVector(vec);
}

async function fetchDocMetadata(driver, database, docIds) {
  if (!docIds.length) return {};
  return withSession(driver, database, async (session) => {
    const result = await session.run(
      `
      MATCH (d:Doc)
      WHERE d.id IN $ids
      OPTIONAL MATCH (d)-[:IN_CATEGORY]->(cat:Category)
      OPTIONAL MATCH (d)-[:HAS_TAG]->(tag:Tag)
      OPTIONAL MATCH (d)<-[:PART_OF]-(chunk:Chunk)-[:MENTIONS]->(e:Entity)
      WITH d,
           collect(DISTINCT cat.name) AS categories,
           collect(DISTINCT tag.name) AS tags,
           collect(DISTINCT e) AS entities
      RETURN d, categories, tags, entities
      `,
      { ids: docIds },
    );
    const map = {};
    for (const record of result.records) {
      const node = record.get('d');
      const categories = (record.get('categories') ?? []).filter(Boolean);
      const tags = (record.get('tags') ?? []).filter(Boolean);
      const rawEntities = record.get('entities') ?? [];
      const entities = rawEntities
        .map((entity) => {
          const props = entity?.properties ?? {};
          return {
            name: props.name ?? null,
            type: props.type ?? null,
            salience: toNumber(props.salience),
            structureScores: extractGnnScores(props ?? {}),
          };
        })
        .filter((entity) => entity.name);

      entities.sort((a, b) => {
        const aValue = Number.isFinite(a.salience) ? a.salience : -Infinity;
        const bValue = Number.isFinite(b.salience) ? b.salience : -Infinity;
        return bValue - aValue;
      });
      const limitedEntities = entities.slice(0, 50);

      const structure = computeStructureMetrics({
        docProperties: node.properties ?? {},
        entities: limitedEntities,
      });

      map[node.properties.id] = {
        title: node.properties.title,
        description: node.properties.description,
        locale: node.properties.locale,
        categories,
        tags,
        updated_at: node.properties.updated_at ?? node.properties.updated,
        structure,
        entities: limitedEntities,
      };
    }
    return map;
  });
}

async function vectorSearch({ question, embedding, limit, indexConfig }) {
  if (!question && !embedding) {
    throw new Error('hybrid 模式需要提供 question 或 embedding');
  }
  const vectors = await loadEmbeddings(indexConfig);
  let queryVector;
  if (question) {
    queryVector = await embedQuestion(question, indexConfig.model);
  } else {
    const typed = Float32Array.from(embedding);
    queryVector = indexConfig.normalize ? normalizeVector(typed) : typed;
  }
  const scored = vectors.map((item) => ({
    ...item,
    score: cosineSimilarity(queryVector, item.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit ?? 5);
}

export async function searchHybrid(driver, database, params = {}) {
  const config = await loadVectorConfig();
  const indexName = params.vectorIndex ?? config.defaultIndex;
  const indexConfig = await loadIndexConfig(indexName);
  const limit = params.limit ?? 5;
  const results = await vectorSearch({
    question: params.question ?? null,
    embedding: params.embedding ?? null,
    limit,
    indexConfig,
  });

  const docIds = results.map((item) => item.docId).filter(Boolean);
  const docMap = await fetchDocMetadata(driver, database, docIds);

  const requestedSources =
    Array.isArray(params.sources) && params.sources.length
      ? params.sources
      : ['vector', 'structure'];
  const structureRequested =
    requestedSources.includes('structure') || requestedSources.includes('graph');

  let weights = resolveAlpha(params.alpha);
  if (!structureRequested) {
    weights = { vector: 1, structure: 0 };
  } else {
    const sum = weights.vector + weights.structure;
    if (!sum) {
      weights = { vector: 1, structure: 0 };
    } else if (sum !== 1) {
      weights = {
        vector: weights.vector / sum,
        structure: weights.structure / sum,
      };
    }
  }

  const items = results.map((item) => {
    const meta = item.docId ? docMap[item.docId] ?? {} : {};
    const vectorScore = Number.isFinite(item.score) ? item.score : 0;
    const structureInfo = meta.structure ?? null;
    const structureScore =
      structureInfo && Number.isFinite(structureInfo.score)
        ? structureInfo.score
        : null;
    const reasons = [`语义相似度 ${vectorScore.toFixed(3)}`];
    if (structureRequested) {
      const structureReason = buildStructureReason(structureInfo);
      if (structureReason) reasons.push(structureReason);
    }
    return {
      doc_id: item.docId,
      title: meta.title ?? item.title ?? item.docId,
      url: item.url,
      vector_score: vectorScore,
      structure_score: structureScore,
      score: vectorScore,
      categories: meta.categories ?? [],
      tags: meta.tags ?? [],
      locale: meta.locale ?? item.lang ?? null,
      updated_at: meta.updated_at ?? null,
      reasons,
      structure_detail:
        structureRequested && structureInfo
          ? {
              feature: structureInfo.scoreSource?.key ?? 'gnn_pagerank',
              source: structureInfo.scoreSource?.type ?? null,
              pagerank: {
                avg: structureInfo.pagerank.avg,
                max: structureInfo.pagerank.max,
              },
              top_entities: structureInfo.topEntities.map((entity) => ({
                name: entity.name,
                type: entity.type,
                pagerank: entity.pagerank,
              })),
            }
          : undefined,
    };
  });

  const structureValues = structureRequested
    ? items
        .map((item) =>
          Number.isFinite(item.structure_score) ? item.structure_score : 0,
        )
        .filter((value) => value > 0)
    : [];
  const maxStructure = structureValues.length ? Math.max(...structureValues) : 0;

  const activeSources = ['vector'];
  let structureActive = structureRequested && maxStructure > 0;
  if (!structureActive && structureRequested) {
    weights = { vector: 1, structure: 0 };
  }

  const componentsPrecision = 4;
  for (const item of items) {
    const vectorNorm = normalizeCosine(item.vector_score);
    const rawStructure = Number.isFinite(item.structure_score) ? item.structure_score : 0;
    const structureNorm =
      structureActive && maxStructure > 0 ? rawStructure / maxStructure : 0;
    const combined =
      weights.vector * vectorNorm + weights.structure * structureNorm;
    item.score = combined;
    item.score_components = {
      vector: Number(vectorNorm.toFixed(componentsPrecision)),
      structure: Number(structureNorm.toFixed(componentsPrecision)),
    };
    if (structureActive) {
      item.structure_score_normalized = Number(
        structureNorm.toFixed(componentsPrecision),
      );
    } else {
      item.structure_score_normalized = 0;
      if (!structureRequested) {
        item.structure_score = null;
      }
    }
  }

  if (structureActive && !activeSources.includes('structure')) {
    activeSources.push('structure');
  }

  items.sort((a, b) => b.score - a.score);

  const metaAlpha = [
    Number(weights.vector.toFixed(3)),
    Number(weights.structure.toFixed(3)),
  ];

  const metaSources = structureActive ? activeSources : ['vector'];

  return {
    mode: 'hybrid',
    items,
    meta: {
      vectorIndex: indexName,
      model: indexConfig.model,
      k: limit,
      alpha: metaAlpha,
      sources: metaSources,
      structure: {
        feature: 'gnn_pagerank',
        enabled: structureActive,
        normalization: structureActive ? 'max' : 'none',
        maxScore: structureActive ? maxStructure : null,
        requested: requestedSources,
      },
    },
  };
}

export { resolveAlpha, normalizeCosine, buildStructureReason };
