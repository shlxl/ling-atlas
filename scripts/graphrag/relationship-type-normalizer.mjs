import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createProviderLLM, resolveProviders } from '../llm/graph-extractor.mjs';
import {
  buildDocContext,
  normalizeEntityKey,
  normalizeLooseLabel,
  readJson,
  resolvePath,
} from './normalizer-utils.mjs';

const DEFAULT_ALIAS_FILE = 'data/graphrag-relationship-alias.json';
const DEFAULT_CACHE_FILE = 'data/graphrag-relationship-type-cache.json';
const DEFAULT_ENABLED =
  process.env.GRAPHRAG_RELATION_NORMALIZER_DISABLE === '1' ? false : true;
const DEFAULT_PROVIDER_CHAIN =
  process.env.GRAPHRAG_RELATION_NORMALIZER_PROVIDERS ??
  process.env.GRAPHRAG_RELATION_NORMALIZER_PROVIDER ??
  process.env.GRAPHRAG_TYPE_NORMALIZER_PROVIDERS ??
  process.env.GRAPHRAG_TYPE_NORMALIZER_PROVIDER ??
  process.env.GRAPH_EXTRACTOR_PROVIDERS ??
  process.env.GRAPH_EXTRACTOR_PROVIDER ??
  'gemini';
const DEFAULT_MODEL =
  process.env.GRAPHRAG_RELATION_NORMALIZER_MODEL ??
  process.env.GRAPHRAG_TYPE_NORMALIZER_MODEL ??
  process.env.GRAPHRAG_GEMINI_DEFAULT_MODEL ??
  process.env.GEMINI_DEFAULT_MODEL ??
  'gemini-1.5-flash';

const DEFAULT_RELATION = 'RelatedTo';
const MAX_SAMPLE_ITEMS = 5;

const RELATION_CHOICES = [
  { value: 'RelatedTo', description: '泛化语义关联 / 相互引用' },
  { value: 'Mentions', description: '源实体提及或引用目标实体' },
  { value: 'PartOf', description: '源实体是目标实体的组成部分或章节' },
  { value: 'BelongsTo', description: '源实体隶属或归属于目标实体' },
  { value: 'Uses', description: '源实体使用 / 集成 / 依赖目标实体' },
  { value: 'BasedOn', description: '源实体基于 / 继承自目标实体' },
  { value: 'Produces', description: '源实体产出/发布目标实体（或相反）' },
  { value: 'CollaboratesWith', description: '两个实体合作、联合发布或共同维护' },
  { value: 'CompetesWith', description: '竞争、对立或取代关系' },
  { value: 'Supports', description: '源实体支持 / 增强目标实体' },
  { value: 'Opposes', description: '源实体反对 / 阻碍目标实体' },
  { value: 'LocatedIn', description: '地理或组织上的包含关系' },
  { value: 'Leads', description: '源实体领导 / 维护 / 负责目标实体' },
  { value: 'Evaluates', description: '评测、衡量或审查关系' },
  { value: 'Compares', description: '对比、benchmark 或差异分析' },
];

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    relation: {
      type: 'string',
      description: '从候选列表中选择的关系类型',
      enum: RELATION_CHOICES.map((item) => item.value),
    },
    confidence: {
      type: 'number',
      description: '0-1 之间的置信度；未知时写 0.5',
    },
    reason: {
      type: 'string',
      description: '1-2 句中文原因，解释为何选择该类型',
    },
  },
  required: ['relation'],
  additionalProperties: false,
};

function formatRelationChoices() {
  return RELATION_CHOICES.map((item) => `- ${item.value}: ${item.description}`).join('\n');
}

function describeProperties(relationship = {}) {
  const props = relationship.properties;
  if (!props) return '';
  if (Array.isArray(props)) {
    return props
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        return `${entry.key ?? 'key'}=${entry.value ?? ''}`;
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof props === 'object') {
    return Object.entries(props)
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('|') : value}`)
      .join(', ');
  }
  return '';
}

function coerceAliasEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];
  const items = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const relation =
      typeof entry.relation === 'string'
        ? entry.relation.trim()
        : typeof entry.type === 'string'
          ? entry.type.trim()
          : undefined;
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    const aliasSet = new Set();
    if (relation) {
      aliasSet.add(relation);
    }
    for (const alias of aliases) {
      if (typeof alias === 'string' && alias.trim()) {
        aliasSet.add(alias.trim());
      }
    }
    if (!aliasSet.size) continue;
    items.push({
      relation: relation ?? aliases[0],
      aliases: Array.from(aliasSet),
    });
  }
  return items;
}

function buildAliasMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const key = normalizeLooseLabel(alias);
      if (!key || map.has(key)) continue;
      map.set(key, {
        relation: entry.relation,
        source: 'alias',
      });
    }
  }
  return map;
}

function buildCacheKey(relationship) {
  if (!relationship || typeof relationship !== 'object') return null;
  const normalizedLabel = normalizeLooseLabel(relationship.type);
  if (normalizedLabel) {
    return `label:${normalizedLabel}`;
  }
  const sourceKey = normalizeEntityKey(relationship.source?.name ?? relationship.source?.id ?? '');
  const targetKey = normalizeEntityKey(relationship.target?.name ?? relationship.target?.id ?? '');
  if (sourceKey || targetKey) {
    return `pair:${sourceKey || 'unknown'}>${targetKey || 'unknown'}`;
  }
  const props = describeProperties(relationship);
  const propsKey = normalizeLooseLabel(props);
  if (propsKey) {
    return `props:${propsKey}`;
  }
  return null;
}

function createClassifierPrompt({ relationship, contextText }) {
  const lines = [
    '你是知识图谱的关系类型归一化助手。',
    '请根据实体对与上下文，只能从下列关系列表中选择一个结果；若无法判断，请输出 RelatedTo：',
    formatRelationChoices(),
  ];
  const sourceName = relationship.source?.name ?? relationship.source?.id ?? '未知源';
  const targetName = relationship.target?.name ?? relationship.target?.id ?? '未知目标';
  lines.push(`源实体：${sourceName}（${relationship.source?.type ?? '未知类型'}）`);
  lines.push(`目标实体：${targetName}（${relationship.target?.type ?? '未知类型'}）`);
  if (relationship.type) {
    lines.push(`原始关系标签：${relationship.type}`);
  }
  const props = describeProperties(relationship);
  if (props) {
    lines.push(`关系属性：${props}`);
  }
  if (contextText) {
    lines.push(`文档上下文：${contextText}`);
  }
  lines.push('请返回 JSON，字段包含 relation（上述列表之一）、confidence（0-1 之间）以及中文 reason。');
  return lines.join('\n');
}

function createEmptyStats() {
  return {
    enabled: true,
    records: {
      total: 0,
      updated: 0,
      relationships: 0,
    },
    sources: {
      alias: 0,
      cache: 0,
      llm: 0,
      fallback: 0,
      reuse: 0,
    },
    cache: {
      path: null,
      size: 0,
      updated: false,
      writes: 0,
    },
    llm: {
      attempts: 0,
      success: 0,
      failures: 0,
      provider: null,
      model: null,
      disabledReason: null,
      errors: [],
    },
    samples: {
      updates: [],
      fallback: [],
      failures: [],
    },
  };
}

export class RelationshipTypeNormalizer {
  constructor(options = {}) {
    const root = options.root ?? process.cwd();
    this.root = root;
    this.enabled = options.enabled ?? DEFAULT_ENABLED;
    this.aliasPath = resolvePath(root, options.aliasPath, DEFAULT_ALIAS_FILE);
    this.cachePath = resolvePath(root, options.cachePath, DEFAULT_CACHE_FILE);
    this.providerChain = options.providerChain ?? DEFAULT_PROVIDER_CHAIN;
    this.modelName = options.modelName ?? DEFAULT_MODEL;
    this.classifierOverride = options.classifier;
    this.stats = createEmptyStats();
    this.stats.enabled = this.enabled;
    this.aliasEntries = [];
    this.aliasMap = new Map();
    this.cacheStore = new Map();
    this.cacheDirty = false;
    this.resolvedTypes = new Map();
    this.classifierModel = null;
  }

  async init() {
    this.aliasEntries = coerceAliasEntries(await readJson(this.aliasPath, []));
    this.aliasMap = buildAliasMap(this.aliasEntries);
    const cachePayload = await readJson(this.cachePath, {});
    if (cachePayload && typeof cachePayload === 'object') {
      for (const [key, value] of Object.entries(cachePayload)) {
        if (!key || !value || typeof value !== 'object') continue;
        if (!value.relation) continue;
        this.cacheStore.set(key, value);
        this.resolvedTypes.set(key, {
          relation: value.relation,
          source: 'cache',
          origin: value.source ?? 'llm',
          provider: value.provider ?? null,
          model: value.model ?? null,
          reason: value.reason ?? null,
        });
      }
      this.stats.cache.size = this.cacheStore.size;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async normalizeAggregation(doc, aggregation = {}) {
    if (!this.enabled) {
      return { updated: 0, total: 0 };
    }
    const relationships = Array.isArray(aggregation.relationships) ? aggregation.relationships : [];
    const contextText = buildDocContext(doc);
    for (const relationship of relationships) {
      await this.applyDecision(relationship, { doc, contextText });
    }
    return {
      total: this.stats.records.total,
      updated: this.stats.records.updated,
    };
  }

  async applyDecision(relationship, meta = {}) {
    if (!relationship || typeof relationship !== 'object') return;
    const cacheKey = buildCacheKey(relationship);
    const decision = await this.resolveType({
      relationship,
      cacheKey,
      contextText: meta.contextText ?? buildDocContext(meta.doc ?? {}),
    });
    this.stats.records.total += 1;
    this.stats.records.relationships += 1;
    this.bumpSource(decision);
    const previous = relationship.type;
    const next = decision.relation ?? previous ?? DEFAULT_RELATION;
    if (previous !== next) {
      relationship.type = next;
      this.stats.records.updated += 1;
      this.recordSample('updates', {
        source: relationship.source?.name ?? relationship.source?.id ?? null,
        target: relationship.target?.name ?? relationship.target?.id ?? null,
        previous,
        next,
        reason: decision.reason ?? null,
        via: decision.source,
      });
    }
  }

  bumpSource(decision) {
    const source = decision.source ?? 'fallback';
    if (Object.prototype.hasOwnProperty.call(this.stats.sources, source)) {
      this.stats.sources[source] += 1;
    } else {
      this.stats.sources[source] = 1;
    }
    if (decision.reused) {
      this.stats.sources.reuse += 1;
    }
    if (source === 'fallback') {
      this.recordSample('fallback', {
        reason: decision.reason ?? decision.message ?? 'unknown',
        source: decision.relationshipSummary,
      });
    }
  }

  async resolveType({ relationship, cacheKey, contextText }) {
    const normalizedLabel = normalizeLooseLabel(relationship?.type);
    if (cacheKey) {
      const cachedDecision = this.resolvedTypes.get(cacheKey);
      if (cachedDecision) {
        return { ...cachedDecision, reused: true };
      }
    }
    if (normalizedLabel) {
      const aliasDecision = this.aliasMap.get(normalizedLabel);
      if (aliasDecision) {
        const decision = {
          relation: aliasDecision.relation,
          source: 'alias',
          reason: `matched-alias:${relationship?.type}`,
        };
        if (cacheKey) {
          this.resolvedTypes.set(cacheKey, decision);
        }
        return decision;
      }
    }
    if (cacheKey) {
      const cached = this.cacheStore.get(cacheKey);
      if (cached) {
        const decision = {
          relation: cached.relation ?? DEFAULT_RELATION,
          source: 'cache',
          provider: cached.provider ?? null,
          model: cached.model ?? null,
          reason: cached.reason ?? 'cache-hit',
        };
        this.resolvedTypes.set(cacheKey, decision);
        return decision;
      }
    }
    const llmDecision = await this.classifyViaLLM({
      relationship,
      contextText,
    });
    if (llmDecision) {
      const decision = {
        relation: llmDecision.relation,
        source: 'llm',
        reason: llmDecision.reason ?? 'llm',
        provider: this.stats.llm.provider,
        model: this.stats.llm.model,
      };
      if (cacheKey) {
        this.resolvedTypes.set(cacheKey, decision);
        this.cacheStore.set(cacheKey, {
          relation: decision.relation,
          source: 'llm',
          decidedAt: new Date().toISOString(),
          provider: decision.provider,
          model: decision.model,
          reason: decision.reason,
        });
        this.cacheDirty = true;
        this.stats.cache.updated = true;
        this.stats.cache.size = this.cacheStore.size;
        this.stats.cache.writes += 1;
      }
      return decision;
    }
    return {
      relation: relationship?.type ?? DEFAULT_RELATION,
      source: 'fallback',
      reason: this.stats.llm.disabledReason ?? 'llm-unavailable',
    };
  }

  async classifyViaLLM({ relationship, contextText }) {
    const classifier = await this.ensureClassifier();
    if (!classifier) {
      this.stats.llm.disabledReason = this.stats.llm.disabledReason ?? 'disabled';
      return null;
    }
    const prompt = createClassifierPrompt({ relationship, contextText });
    this.stats.llm.attempts += 1;
    try {
      const response = await classifier.invoke(prompt);
      const normalized = RELATION_CHOICES.find((item) => item.value === response?.relation)
        ? response.relation
        : DEFAULT_RELATION;
      this.stats.llm.success += 1;
      return {
        relation: normalized,
        reason: response?.reason ?? null,
        confidence: response?.confidence ?? null,
      };
    } catch (error) {
      this.stats.llm.failures += 1;
      this.stats.llm.errors.push(error?.message ?? String(error));
      this.recordSample('failures', {
        source: relationship?.source?.name ?? relationship?.source?.id ?? 'unknown',
        target: relationship?.target?.name ?? relationship?.target?.id ?? 'unknown',
        message: error?.message ?? String(error),
      });
      return null;
    }
  }

  async ensureClassifier() {
    if (!this.enabled) {
      return null;
    }
    if (this.classifierOverride) {
      return this.classifierOverride;
    }
    if (this.classifierModel) {
      return this.classifierModel;
    }
    if (!this.providerChain) {
      this.stats.llm.disabledReason = 'missing-provider';
      return null;
    }
    const providers = resolveProviders(this.providerChain);
    for (const provider of providers) {
      try {
        const { llm, modelName } = await createProviderLLM(provider, this.modelName);
        this.classifierModel = llm.withStructuredOutput(CLASSIFICATION_SCHEMA, {
          name: 'relationship_type_normalizer',
        });
        this.stats.llm.provider = provider;
        this.stats.llm.model = modelName;
        return this.classifierModel;
      } catch (error) {
        this.stats.llm.errors.push(`${provider}: ${error?.message ?? error}`);
      }
    }
    this.stats.llm.disabledReason = 'provider-init-failed';
    return null;
  }

  recordSample(kind, payload) {
    if (!payload) return;
    const bucket = this.stats.samples[kind];
    if (!Array.isArray(bucket) || bucket.length >= MAX_SAMPLE_ITEMS) {
      return;
    }
    bucket.push(payload);
  }

  async persistCache() {
    if (!this.cacheDirty) return null;
    const sorted = Array.from(this.cacheStore.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, JSON.stringify(sorted, null, 2), 'utf8');
    this.cacheDirty = false;
    return this.cachePath;
  }

  getSummary() {
    return {
      enabled: this.enabled,
      records: this.stats.records,
      sources: this.stats.sources,
      cache: {
        path: this.cachePath,
        size: this.cacheStore.size,
        updated: this.stats.cache.updated,
        writes: this.stats.cache.writes,
      },
      llm: this.stats.llm,
      samples: this.stats.samples,
      aliasEntries: this.aliasEntries.length,
    };
  }
}

export async function createRelationshipTypeNormalizer(options = {}) {
  const normalizer = new RelationshipTypeNormalizer(options);
  await normalizer.init();
  return normalizer;
}
