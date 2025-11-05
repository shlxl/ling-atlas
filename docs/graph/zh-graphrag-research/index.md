---
title: GraphRAG 研究概述与综述
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
