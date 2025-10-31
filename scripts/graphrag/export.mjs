#!/usr/bin/env node
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { resolveNeo4jConfig, getScriptName } from './config.mjs';
import { createDriver, verifyConnectivity } from './neo4j-client.mjs';
import { fetchSubgraph } from './retrieval/subgraph.mjs';
import { fetchTopN } from './retrieval/topn.mjs';

const DEFAULT_OUTPUT_ROOT = 'docs/graph';
const DEFAULT_ENTITY_LIMIT = 10;
const DEFAULT_TOPN_LIMIT = 5;

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

function roundNumber(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function extractGnnScores(data = {}) {
  const scores = {};
  for (const [key, rawValue] of Object.entries(data)) {
    if (!key.startsWith('gnn_')) continue;
    if (Array.isArray(rawValue)) continue; // Node2Vec 等向量写入会非常大，导出时跳过
    const value = toNumber(rawValue);
    if (!Number.isFinite(value)) continue;
    scores[key] = value;
  }
  return scores;
}

function roundScoreMap(scores = {}, digits = 6) {
  const rounded = {};
  for (const [key, value] of Object.entries(scores)) {
    if (!Number.isFinite(value)) continue;
    rounded[key] = roundNumber(value, digits);
  }
  return rounded;
}

const GNN_DISPLAY_LABEL = {
  gnn_pagerank: 'PageRank',
  gnn_labelPropagation: '社区',
  gnn_community: '社区',
};

function formatStructureScores(scores = {}) {
  const entries = Object.entries(scores);
  if (!entries.length) return '';
  return entries
    .map(([key, value]) => {
      const label =
        GNN_DISPLAY_LABEL[key] ??
        key
          .replace(/^gnn_/, '')
          .split('_')
          .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
          .join('');
      const formatted = Number.isInteger(value) ? `${value}` : value.toFixed(3);
      return `${label} ${formatted}`;
    })
    .join(' / ');
}

const VALUE_OPTIONS = new Map([
  ['--doc-id', 'docId'],
  ['--topic', 'topic'],
  ['--title', 'title'],
  ['--locale', 'locale'],
  ['--output', 'outputRoot'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--dry-run', 'dryRun'],
  ['--pretty', 'prettyJson'],
  ['--no-page', 'noPage'],
]);

function collectMultiArgs(args, key) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === key) {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`参数 ${key} 需要显式取值`);
      }
      values.push(next);
      i += 1;
    }
  }
  return values;
}

function parseArgs(rawArgs) {
  const options = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    dryRun: false,
    prettyJson: true,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];

    if (VALUE_OPTIONS.has(token)) {
      const key = VALUE_OPTIONS.get(token);
      const value = rawArgs[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`参数 ${token} 需要显式取值`);
      }
      options[key] = value;
      index += 1;
      continue;
    }

    if (BOOLEAN_OPTIONS.has(token)) {
      const key = BOOLEAN_OPTIONS.get(token);
      options[key] = true;
      continue;
    }
  }

  options.entities = collectMultiArgs(rawArgs, '--entity');

  return options;
}

function deriveTopic(options) {
  if (options.topic) return options.topic;
  if (!options.docId) return 'graph-topic';
  return options.docId.replace(/[\\/]+/g, '-');
}

function sanitizeLabel(text) {
  if (!text) return '';
  return String(text).replace(/"/g, '\\"');
}

function mermaidId(identity, prefix) {
  const safePrefix = prefix ?? 'n';
  return `${safePrefix}${identity}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

const ENTITY_CLASS_MAP = {
  Person: 'entityPerson',
  Organization: 'entityOrg',
  Location: 'entityLocation',
  Concept: 'entityConcept',
};

function buildEntitySummary(subgraph, docNode) {
  const nodeById = new Map(subgraph.nodes.map((node) => [node.identity, node]));
  const chunkToDoc = new Map();
  for (const edge of subgraph.edges) {
    if (edge.type === 'PART_OF') {
      chunkToDoc.set(edge.source, edge.target);
    }
  }

  const stats = new Map();
  for (const edge of subgraph.edges) {
    if (edge.type !== 'MENTIONS') continue;
    if (chunkToDoc.get(edge.source) !== docNode.identity) continue;
    const stat = stats.get(edge.target) ?? { count: 0, confidence: 0 };
    stat.count += 1;
    const confidence = Number(edge.data?.confidence ?? 0);
    if (Number.isFinite(confidence)) stat.confidence += confidence;
    stats.set(edge.target, stat);
  }

  const entities = [];
  for (const [identity, stat] of stats.entries()) {
    const node = nodeById.get(identity);
    if (!node) continue;
    const structureScores = extractGnnScores(node.data ?? {});
    entities.push({
      identity,
      node,
      count: stat.count,
      confidence: stat.confidence,
      avgConfidence: stat.confidence && stat.count ? stat.confidence / stat.count : 0,
      structureScores,
    });
  }

  entities.sort((a, b) => b.count - a.count || b.avgConfidence - a.avgConfidence);
  return entities;
}

function extractCategories(subgraph, docNode) {
  const nodeById = new Map(subgraph.nodes.map((node) => [node.identity, node]));
  const categories = new Set();
  const tags = new Set();
  for (const edge of subgraph.edges) {
    if (edge.type === 'IN_CATEGORY' && edge.source === docNode.identity) {
      const node = nodeById.get(edge.target);
      if (node?.labels.includes('Category')) {
        categories.add(node.data?.name ?? node.data?.slug ?? '');
      }
    }
    if (edge.type === 'HAS_TAG' && edge.source === docNode.identity) {
      const node = nodeById.get(edge.target);
      if (node?.labels.includes('Tag')) {
        tags.add(node.data?.name ?? node.data?.slug ?? '');
      }
    }
  }
  return {
    categories: [...categories].filter(Boolean),
    tags: [...tags].filter(Boolean),
  };
}

function summarizeStructure(docNode, entities) {
  const docScores = extractGnnScores(docNode?.data ?? {});

  const pagerankValues = [];
  const communityCounts = new Map();

  const topPagerankEntities = [];
  for (const entity of entities) {
    const scores = entity.structureScores ?? {};
    const pagerank = scores.gnn_pagerank;
    if (Number.isFinite(pagerank)) {
      pagerankValues.push(pagerank);
      topPagerankEntities.push({
        name: entity.node.data?.name ?? entity.node.identity,
        type: entity.node.data?.type ?? 'Entity',
        value: pagerank,
        scores,
      });
    }

    const community =
      Number.isFinite(scores.gnn_community) ? scores.gnn_community : scores.gnn_labelPropagation;
    if (Number.isFinite(community)) {
      const key = String(community);
      communityCounts.set(key, (communityCounts.get(key) ?? 0) + 1);
    }
  }

  const pagerankSum = pagerankValues.reduce((sum, value) => sum + value, 0);
  const pagerankAvg = pagerankValues.length ? pagerankSum / pagerankValues.length : null;
  const pagerankMax = pagerankValues.length ? Math.max(...pagerankValues) : null;

  topPagerankEntities.sort((a, b) => b.value - a.value);

  const communityRanking = [...communityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([community, count]) => ({
      community,
      count,
    }));

  const inferredScore = Number.isFinite(docScores.gnn_pagerank)
    ? docScores.gnn_pagerank
    : pagerankAvg;

  return {
    docScores,
    pagerank: {
      avg: pagerankAvg,
      max: pagerankMax,
      sum: pagerankSum,
      count: pagerankValues.length,
    },
    communities: communityRanking,
    topEntities: topPagerankEntities.slice(0, 5),
    inferredScore,
  };
}

function buildRelationships(subgraph, entityIdentities) {
  const entitySet = new Set(entityIdentities);
  const relationships = [];
  for (const edge of subgraph.edges) {
    if (edge.type !== 'RELATED') continue;
    if (!entitySet.has(edge.source) || !entitySet.has(edge.target)) continue;
    relationships.push(edge);
  }
  return relationships;
}

function buildMermaid(docNode, entities, relationships, categories, tags) {
  const lines = ['graph LR'];
  const docId = mermaidId(docNode.identity, 'doc');
  const docLabel = sanitizeLabel(docNode.data?.title ?? docNode.data?.id ?? 'Doc');
  lines.push(`  ${docId}["Doc｜${docLabel}"]`);
  const classLines = [`  class ${docId} docNode;`];

  categories.slice(0, 5).forEach((category, index) => {
    const categoryId = mermaidId(`${docNode.identity}_${category}`, `cat${index}`);
    lines.push(`  ${categoryId}["Category｜${sanitizeLabel(category)}"]`);
    lines.push(`  ${docId} --> ${categoryId}`);
    classLines.push(`  class ${categoryId} categoryNode;`);
  });

  tags.slice(0, 8).forEach((tag, index) => {
    const tagId = mermaidId(`${docNode.identity}_${tag}`, `tag${index}`);
    lines.push(`  ${tagId}["Tag｜${sanitizeLabel(tag)}"]`);
    lines.push(`  ${docId} --> ${tagId}`);
    classLines.push(`  class ${tagId} tagNode;`);
  });

  let linkIndex = 0;
  const docEntityLinkIndices = [];

  entities.forEach((entity) => {
    const node = entity.node;
    const entityId = mermaidId(node.identity, 'ent');
    const label = sanitizeLabel(`${node.data?.type ?? 'Entity'}｜${node.data?.name ?? node.data?.id}`);
    lines.push(`  ${entityId}["${label}"]`);
    lines.push(`  ${docId} -- 频次 ${entity.count} --> ${entityId}`);
    docEntityLinkIndices.push(linkIndex);
    linkIndex += 1;

    const type = node.data?.type ?? 'Entity';
    const className = ENTITY_CLASS_MAP[type] ?? 'entityNode';
    classLines.push(`  class ${entityId} ${className};`);
  });

  relationships.forEach((edge) => {
    const sourceId = mermaidId(edge.source, 'ent');
    const targetId = mermaidId(edge.target, 'ent');
    const weight = edge.data?.weight ? ` (${edge.data.weight})` : '';
    lines.push(`  ${sourceId} -. 关联${weight} .-> ${targetId}`);
    linkIndex += 1;
  });

  lines.push(...classLines);

  const classDefLines = [
    '  classDef docNode fill:#1f6feb,stroke:#0d419d,color:#ffffff,font-weight:600;',
    '  classDef categoryNode fill:#0d1117,stroke:#30363d,color:#f0f6fc;',
    '  classDef tagNode fill:#161b22,stroke:#30363d,color:#79c0ff;',
    '  classDef entityNode fill:#1b4d3e,stroke:#2ea043,color:#ffffff;',
    '  classDef entityPerson fill:#653c9d,stroke:#8957e5,color:#ffffff;',
    '  classDef entityOrg fill:#1158c7,stroke:#1f6feb,color:#ffffff;',
    '  classDef entityLocation fill:#7c4400,stroke:#b76100,color:#ffffff;',
    '  classDef entityConcept fill:#445760,stroke:#6e7781,color:#ffffff;',
  ];
  lines.push(...classDefLines);

  if (docEntityLinkIndices.length) {
    lines.push(
      ...docEntityLinkIndices.map(
        (index) => `  linkStyle ${index} stroke-width:2px,stroke:#58a6ff;`,
      ),
    );
  }

  return lines.join('\n');
}

function buildContextMarkdown({
  docNode,
  entities,
  recommendations,
  mermaid,
  categories,
  structure,
}) {
  const docTitle = docNode.data?.title ?? docNode.data?.id;
  const docUpdated = docNode.data?.updated_at ?? docNode.data?.updated ?? ''; 
  const lines = [];
  lines.push(`# ${docTitle}`);
  lines.push('');
  lines.push('- 原始文档：`' + docNode.data?.id + '`');
  if (docUpdated) {
    lines.push(`- 最近更新：${docUpdated}`);
  }
  if (categories.length) {
    lines.push(`- 分类：${categories.join('、')}`);
  }
  lines.push('');
  lines.push('## 子图概览');
  lines.push('```mermaid');
  lines.push(mermaid);
  lines.push('```');
  lines.push('');

  if (structure) {
    lines.push('## 结构化指标');
    if (
      Number.isFinite(structure.inferredScore) ||
      Number.isFinite(structure?.pagerank?.avg) ||
      (structure?.communities?.length ?? 0) > 0
    ) {
      if (Number.isFinite(structure.inferredScore)) {
        lines.push(`- 综合结构得分：${structure.inferredScore.toFixed(3)}`);
      }
      if (Number.isFinite(structure?.pagerank?.avg)) {
        lines.push(`- 实体 PageRank 均值：${structure.pagerank.avg.toFixed(3)}`);
      }
      if (Number.isFinite(structure?.pagerank?.max)) {
        lines.push(`- 实体 PageRank 峰值：${structure.pagerank.max.toFixed(3)}`);
      }
      if (structure.communities?.length) {
        const communityText = structure.communities
          .slice(0, 3)
          .map((item) => `社区 ${item.community}（${item.count} 个实体）`)
          .join('；');
        if (communityText) {
          lines.push(`- 社区分布：${communityText}`);
        }
      }
      if (structure.topEntities?.length) {
        const topEntityText = structure.topEntities
          .map((item) => `${item.name}（${item.value.toFixed(3)}）`)
          .join('、');
        if (topEntityText) {
          lines.push(`- PageRank 最高实体：${topEntityText}`);
        }
      }
    } else {
      lines.push('- 暂无结构化指标');
    }
    lines.push('');
  }

  lines.push('## 实体统计');
  lines.push('| 实体 | 类型 | 频次 | 平均置信度 | 结构指标 |');
  lines.push('| --- | --- | --- | --- | --- |');
  entities.forEach((entity) => {
    const structureText = formatStructureScores(entity.structureScores);
    lines.push(`| ${entity.node.data?.name ?? entity.node.identity} | ${entity.node.data?.type ?? 'Entity'} | ${entity.count} | ${entity.avgConfidence.toFixed(3)} | ${structureText || '—'} |`);
  });
  lines.push('');
  if (recommendations?.length) {
    lines.push('## 推荐阅读');
    recommendations.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.title}**（${item.updated_at ?? '未知时间'}）`);
      if (item.reasons?.length) {
        lines.push('   - ' + item.reasons.join('；'));
      }
    });
    lines.push('');
  }
  return lines.join('\n');
}

function sanitizePreview(text, fallback = '（暂无描述）') {
  if (!text) return fallback;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

async function updateGraphIndex({ outputRoot, dryRun }) {
  if (outputRoot !== DEFAULT_OUTPUT_ROOT) {
    return; // 自定义输出目录时交由使用者维护
  }

  const dirents = await readdir(outputRoot, { withFileTypes: true }).catch(() => []);
  const topics = [];

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const slug = dirent.name;
    try {
      const metadataRaw = await readFile(join(outputRoot, slug, 'metadata.json'), 'utf8');
      const metadata = JSON.parse(metadataRaw);
      const title = metadata.doc?.title ?? metadata.doc?.id ?? slug;
      const description = sanitizePreview(metadata.doc?.description ?? metadata.entities?.[0]?.name);
      topics.push({ slug, title, description });
    } catch (error) {
      // 忽略缺失 metadata 的主题
      continue;
    }
  }

  if (topics.length === 0) return;

  topics.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));

  const lines = [];
  lines.push('---');
  lines.push('title: GraphRAG 主题列表');
  lines.push('description: 已导出的 GraphRAG 主题导航。');
  lines.push('---');
  lines.push('');
  lines.push('# GraphRAG 主题导航');
  lines.push('');
  lines.push('| 主题 | 说明 | 链接 |');
  lines.push('| --- | --- | --- |');
  for (const topic of topics) {
    lines.push(`| ${topic.title} | ${topic.description} | [查看可视化](./${topic.slug}/) |`);
  }
  lines.push('');
  lines.push('> 本页由 `npm run graphrag:export` 自动更新。');

  const indexContent = `${lines.join('\n')}\n`;
  const indexPath = join(outputRoot, 'index.md');
  await writeFileIfNotDryRun(indexPath, indexContent, { dryRun });
}

function buildTopicPageMarkdown({ title, metadata }) {
  const frontmatterTitle = title ?? metadata.doc?.title ?? metadata.doc?.id ?? 'GraphRAG 主题';
  return `---
title: ${frontmatterTitle}
---

<script setup>
import { withBase } from 'vitepress'
import GraphMermaid from '../../.vitepress/theme/components/GraphMermaid.vue'
import metadata from './metadata.json'

const doc = metadata.doc ?? {}
const recommendations = metadata.recommendations ?? []
const categories = metadata.categories ?? []
const tags = metadata.tags ?? []
const structure = metadata.structure ?? {}
const docStructureEntries = Object.entries(structure.doc ?? {})
const structureTopEntities = structure.top_entities ?? []

const LABELS = {
  gnn_pagerank: 'PageRank',
  gnn_labelPropagation: '社区',
  gnn_community: '社区'
}

const toDisplayScore = (value, digits = 3) => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num.toFixed(digits)
}

const formatLabel = (key) => {
  if (!key) return ''
  if (LABELS[key]) return LABELS[key]
  return key
    .replace(/^gnn_/, '')
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join('')
}
</script>

## 主题概览

<section class="graph-topic">
  <ul>
    <li>
      <strong>原文：</strong>
      <a :href="withBase('/' + (doc.id ?? '') + '.html')" target="_blank">{{ doc.title ?? doc.id }}</a>
    </li>
    <li v-if="doc.updated_at"><strong>最近更新：</strong>{{ doc.updated_at }}</li>
    <li v-if="categories.length"><strong>分类：</strong>{{ categories.join('、') }}</li>
    <li v-if="tags.length"><strong>标签：</strong>{{ tags.join('、') }}</li>
    <li v-if="metadata.categories?.length"><strong>分类：</strong>{{ metadata.categories.join('、') }}</li>
    <li v-if="metadata.tags?.length"><strong>标签：</strong>{{ metadata.tags.join('、') }}</li>
  </ul>

  <div v-if="recommendations.length">
    <h2>推荐阅读</h2>
    <ul>
      <li v-for="item in recommendations" :key="item.doc_id">
        <a :href="withBase('/' + item.doc_id + '.html')" target="_blank">{{ item.title }}</a>
        <span v-if="item.updated_at">（{{ item.updated_at }}）</span>
        <p v-if="item.reasons?.length">{{ item.reasons.join('；') }}</p>
      </li>
    </ul>
  </div>

  <div
    v-if="
      structure?.score != null ||
      structureTopEntities.length ||
      docStructureEntries.length ||
      structure?.communities?.length ||
      structure?.pagerank?.avg != null ||
      structure?.pagerank?.max != null
    "
    class="graph-topic__structure"
  >
    <h2>结构化指标</h2>
    <ul>
      <li v-if="structure?.score != null">
        <strong>综合结构得分：</strong>{{ toDisplayScore(structure.score) }}
      </li>
      <li v-if="structure?.pagerank?.avg != null">
        <strong>实体 PageRank 均值：</strong>{{ toDisplayScore(structure.pagerank.avg) }}
      </li>
      <li v-if="structure?.pagerank?.max != null">
        <strong>实体 PageRank 峰值：</strong>{{ toDisplayScore(structure.pagerank.max) }}
      </li>
      <li v-if="structure?.communities?.length">
        <strong>社区分布：</strong>
        <template v-for="(item, index) in structure.communities.slice(0, 3)" :key="item.community">
          <span v-if="index">；</span>
          社区 {{ item.community }}（{{ item.count }} 个实体）
        </template>
      </li>
      <li v-if="docStructureEntries.length">
        <strong>Doc 指标：</strong>
        <template v-for="(entry, index) in docStructureEntries" :key="entry[0]">
          <span v-if="index">；</span>
          {{ formatLabel(entry[0]) }}：{{ toDisplayScore(entry[1]) ?? entry[1] }}
        </template>
      </li>
    </ul>
    <div v-if="structureTopEntities.length">
      <h3>结构最显著的实体</h3>
      <ol>
        <li v-for="item in structureTopEntities" :key="item.name">
          {{ item.name }}（{{ toDisplayScore(item.pagerank) ?? '—' }}）
        </li>
      </ol>
    </div>
  </div>
</section>

<ClientOnly>
  <GraphMermaid path="./subgraph.mmd" />
</ClientOnly>

<VPDoc :src="'./context.md'" />
`;
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writeFileIfNotDryRun(path, content, { dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] 将写入 ${path}`);
    return;
  }
  await ensureDir(dirname(path));
  await writeFile(path, content, 'utf8');
  console.log(`已写入 ${path}`);
}

async function main() {
  const scriptName = getScriptName(import.meta.url);
  const rawArgs = process.argv.slice(2);
  const options = parseArgs(rawArgs);

  if (!options.docId) {
    throw new Error('请通过 --doc-id 指定目标文档');
  }

  const topic = deriveTopic(options);
  const outputRoot = options.outputRoot ?? DEFAULT_OUTPUT_ROOT;
  const topicDir = join(outputRoot, topic);

  const neo4jConfig = resolveNeo4jConfig(rawArgs, { requirePassword: true });
  const driver = createDriver(neo4jConfig);
  try {
    await verifyConnectivity(driver);

    const subgraph = await fetchSubgraph(driver, neo4jConfig.database, {
      docId: options.docId,
      entityNames: options.entities,
      maxHops: 2,
      limit: 200,
    });

    const docNode = subgraph.nodes.find((node) => node.labels.includes('Doc'));
    if (!docNode) {
      throw new Error(`未找到 Doc 节点：${options.docId}`);
    }

    const entities = buildEntitySummary(subgraph, docNode).slice(0, DEFAULT_ENTITY_LIMIT);
    const { categories, tags } = extractCategories(subgraph, docNode);
    const relationships = buildRelationships(subgraph, entities.map((entity) => entity.identity));

    const mermaid = buildMermaid(docNode, entities, relationships, categories, tags);
    const structureSummary = summarizeStructure(docNode, entities);

    const recommendedEntities = options.entities?.length
      ? options.entities
      : entities
          .map((entity) => entity.node.data?.name)
          .filter(Boolean)
          .slice(0, 5);

    let topn = { items: [] };
    if (recommendedEntities.length) {
      topn = await fetchTopN(driver, neo4jConfig.database, {
        entityNames: recommendedEntities,
        category: categories[0] ?? null,
        language: options.locale ?? docNode.data?.locale ?? null,
        limit: DEFAULT_TOPN_LIMIT + 1,
      });
    }

    const recommendations = (topn.items ?? []).filter(
      (item) => item.doc_id !== docNode.data?.id,
    ).slice(0, DEFAULT_TOPN_LIMIT);

    const metadata = {
      doc: {
        id: docNode.data?.id,
        title: docNode.data?.title,
        description: docNode.data?.description,
        locale: docNode.data?.locale,
        updated_at: docNode.data?.updated_at ?? docNode.data?.updated ?? null,
        source_path: docNode.data?.source_path,
      },
      categories,
      tags,
      entities: entities.map((entity) => ({
        name: entity.node.data?.name,
        type: entity.node.data?.type ?? 'Entity',
        count: entity.count,
        avg_confidence: Number(entity.avgConfidence.toFixed(3)),
        structure_scores: roundScoreMap(entity.structureScores),
      })),
      recommendations,
      structure: {
        score: Number.isFinite(structureSummary.inferredScore)
          ? roundNumber(structureSummary.inferredScore)
          : null,
        doc: roundScoreMap(structureSummary.docScores),
        pagerank: {
          avg: Number.isFinite(structureSummary.pagerank.avg)
            ? roundNumber(structureSummary.pagerank.avg)
            : null,
          max: Number.isFinite(structureSummary.pagerank.max)
            ? roundNumber(structureSummary.pagerank.max)
            : null,
          sum: Number.isFinite(structureSummary.pagerank.sum)
            ? roundNumber(structureSummary.pagerank.sum)
            : null,
          count: structureSummary.pagerank.count,
        },
        communities: structureSummary.communities,
        top_entities: structureSummary.topEntities.map((item) => ({
          name: item.name,
          type: item.type,
          pagerank: Number.isFinite(item.value) ? roundNumber(item.value) : null,
          structure_scores: roundScoreMap(item.scores),
        })),
      },
      generated_at: new Date().toISOString(),
    };

    const contextMarkdown = buildContextMarkdown({
      docNode,
      entities,
      recommendations,
      mermaid,
      categories,
      structure: structureSummary,
    });

    const subgraphPath = join(topicDir, 'subgraph.mmd');
    const contextPath = join(topicDir, 'context.md');
    const metadataPath = join(topicDir, 'metadata.json');
    const pagePath = join(topicDir, 'index.md');

    if (!options.dryRun) {
      await ensureDir(topicDir);
    }

    await writeFileIfNotDryRun(subgraphPath, `${mermaid}\n`, options);
    await writeFileIfNotDryRun(contextPath, `${contextMarkdown}\n`, options);
    const metadataContent = options.prettyJson
      ? JSON.stringify(metadata, null, 2)
      : JSON.stringify(metadata);
    await writeFileIfNotDryRun(metadataPath, `${metadataContent}\n`, options);

    if (!options.noPage) {
      const pageContent = buildTopicPageMarkdown({
        title: options.title,
        metadata,
      });
      await writeFileIfNotDryRun(pagePath, pageContent, options);
    }

    await updateGraphIndex({ outputRoot, dryRun: options.dryRun });

    console.log(`[${scriptName}] 导出完成：${topicDir}`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
