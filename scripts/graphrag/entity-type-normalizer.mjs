import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createProviderLLM, resolveProviders } from '../llm/graph-extractor.mjs';
import {
  buildDocContext,
  normalizeEntityKey,
  readJson,
  resolvePath,
} from './normalizer-utils.mjs';

const DEFAULT_ALIAS_FILE = 'data/graphrag-entity-alias.json';
const DEFAULT_CACHE_FILE = 'data/graphrag-entity-type-cache.json';
const DEFAULT_ENABLED = process.env.GRAPHRAG_TYPE_NORMALIZER_DISABLE === '1' ? false : true;
const DEFAULT_PROVIDER_CHAIN =
  process.env.GRAPHRAG_TYPE_NORMALIZER_PROVIDERS ??
  process.env.GRAPHRAG_TYPE_NORMALIZER_PROVIDER ??
  process.env.GRAPH_EXTRACTOR_PROVIDERS ??
  process.env.GRAPH_EXTRACTOR_PROVIDER ??
  'gemini';
const DEFAULT_MODEL =
  process.env.GRAPHRAG_TYPE_NORMALIZER_MODEL ??
  process.env.GRAPHRAG_GEMINI_DEFAULT_MODEL ??
  process.env.GEMINI_DEFAULT_MODEL ??
  'gemini-1.5-flash';

const MAX_SAMPLE_ITEMS = 5;
const DEFAULT_TYPE = 'Concept';

const TYPE_ALIASES = {
  person: 'Person',
  人: 'Person',
  人物: 'Person',
  organization: 'Organization',
  company: 'Organization',
  enterprise: 'Organization',
  组织: 'Organization',
  机构: 'Organization',
  公司: 'Organization',
  社区: 'Organization',
  event: 'Event',
  事件: 'Event',
  paper: 'Paper',
  article: 'Paper',
  文献: 'Paper',
  论文: 'Paper',
  'reference paper': 'Paper',
  technology: 'Technology',
  技术: 'Technology',
  researchdirection: 'ResearchDirection',
  'research direction': 'ResearchDirection',
  研究方向: 'ResearchDirection',
  concept: 'Concept',
  概念: 'Concept',
  product: 'Product',
  产品: 'Product',
  tool: 'Tool',
  工具: 'Tool',
  domain: 'Domain',
  领域: 'Domain',
  framework: 'Framework',
  框架: 'Framework',
  language: 'Language',
  语言: 'Language',
  dataset: 'Dataset',
  数据集: 'Dataset',
  metric: 'Metric',
  指标: 'Metric',
  project: 'Project',
  项目: 'Project',
  service: 'Service',
  服务: 'Service',
};

const TYPE_CHOICES = [
  { value: 'Person', description: '人物 / 作者 / 研究者 / 讲者' },
  { value: 'Organization', description: '公司 / 团队 / 社区 / 机构' },
  { value: 'Event', description: '大会 / 活动 / 里程碑 / 事故' },
  { value: 'Paper', description: '论文 / 报告 / 出版物 / 文献' },
  { value: 'Technology', description: '技术流派 / 能力 / 框架组合' },
  { value: 'ResearchDirection', description: '研究方向 / 主题 / 课题' },
  { value: 'Concept', description: '抽象概念 / 方法论 / 模型' },
  { value: 'Product', description: '商业产品 / 套件 / 平台' },
  { value: 'Tool', description: '工程工具 / CLI / 库' },
  { value: 'Domain', description: '行业 / 业务领域 / 赛道' },
  { value: 'Framework', description: '框架 / SDK / 运行时' },
  { value: 'Language', description: '编程语言 / 标记语言' },
  { value: 'Dataset', description: '数据集 / 语料 / 评测集' },
  { value: 'Metric', description: '指标 / 评测标准 / 打分体系' },
  { value: 'Project', description: '项目 / 计划 / 联盟' },
  { value: 'Service', description: '托管服务 / API / 托管平台' },
];

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: '从候选列表中选择的实体类型',
      enum: TYPE_CHOICES.map((item) => item.value),
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
  required: ['type'],
  additionalProperties: false,
};

function normalizeTypeLabel(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const alias = TYPE_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
}

function coerceAliasEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];
  const items = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const type = normalizeTypeLabel(entry.type) ?? DEFAULT_TYPE;
    const canonical = typeof entry.canonical === 'string' ? entry.canonical.trim() : undefined;
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    if (!canonical && !aliases.length) continue;
    const aliasSet = new Set();
    if (canonical) {
      aliasSet.add(canonical);
    }
    for (const alias of aliases) {
      if (typeof alias === 'string' && alias.trim()) {
        aliasSet.add(alias.trim());
      }
    }
    if (!aliasSet.size) continue;
    items.push({
      type,
      canonical: canonical ?? aliases[0],
      aliases: Array.from(aliasSet),
    });
  }
  return items;
}

function buildAliasMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const key = normalizeEntityKey(alias);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          type: entry.type,
          canonical: entry.canonical,
          source: 'alias',
        });
      }
    }
  }
  return map;
}

function formatTypeChoices() {
  return TYPE_CHOICES.map((item) => `- ${item.value}: ${item.description}`).join('\n');
}

function createClassifierPrompt({ name, currentType, contextText }) {
  const lines = [
    '你是知识图谱的实体类型归一化助手。',
    '请根据实体名称与上下文，只能从下列类型中选择一个最合适的结果；若无法判断，请选择 Concept：',
    formatTypeChoices(),
    `实体名称：${name}`,
  ];
  if (currentType && currentType !== DEFAULT_TYPE) {
    lines.push(`原始类型：${currentType}`);
  }
  if (contextText) {
    lines.push(`上下文：${contextText}`);
  }
  lines.push('请返回 JSON，字段包含 type（上述列表之一）、confidence（0-1 之间），以及中文 reason。');
  return lines.join('\n');
}

function createEmptyStats() {
  return {
    enabled: true,
    records: {
      total: 0,
      updated: 0,
      entities: 0,
      docRoots: 0,
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

export class EntityTypeNormalizer {
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
        if (!value.type) continue;
        this.cacheStore.set(key, value);
        const entry = {
          type: normalizeTypeLabel(value.type) ?? DEFAULT_TYPE,
          source: 'cache',
          origin: value.source ?? 'llm',
          decidedAt: value.decidedAt ?? null,
          reason: value.reason ?? null,
          provider: value.provider ?? null,
          model: value.model ?? null,
        };
        this.resolvedTypes.set(key, entry);
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

    const contextText = buildDocContext(doc);
    const entities = Array.isArray(aggregation.entities) ? aggregation.entities : [];
    const docRoots = Array.isArray(aggregation.doc_entity_roots) ? aggregation.doc_entity_roots : [];

    for (const entity of entities) {
      await this.applyDecision(entity, {
        name: entity?.name ?? entity?.id,
        currentType: entity?.type,
        contextText,
        kind: 'entity',
      });
    }

    for (const root of docRoots) {
      await this.applyDecision(root, {
        name: root?.name,
        currentType: root?.type,
        contextText,
        kind: 'docRoot',
      });
    }

    if (Array.isArray(aggregation.relationships)) {
      this.updateRelationshipTypes(aggregation.relationships);
    }

    return {
      total: this.stats.records.total,
      updated: this.stats.records.updated,
    };
  }

  async applyDecision(record, meta) {
    if (!record || !meta?.name) return;
    const decision = await this.resolveType(meta.name, {
      currentType: record.type,
      contextText: meta.contextText,
    });

    this.stats.records.total += 1;
    if (meta.kind === 'docRoot') {
      this.stats.records.docRoots += 1;
    } else {
      this.stats.records.entities += 1;
    }

    this.bumpSource(decision);

    const previousType = record.type;
    const nextType = decision.type ?? previousType ?? DEFAULT_TYPE;
    const normalizedNext = normalizeTypeLabel(nextType) ?? DEFAULT_TYPE;
    if (previousType !== normalizedNext) {
      record.type = normalizedNext;
      this.stats.records.updated += 1;
      this.recordSample('updates', {
        name: meta.name,
        previous: previousType ?? null,
        next: normalizedNext,
        source: decision.source,
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
        name: decision.name,
        reason: decision.reason ?? decision.message ?? decision.fallbackReason ?? 'unknown',
      });
    }
  }

  async resolveType(name, { currentType, contextText } = {}) {
    const normalizedKey = normalizeEntityKey(name);
    if (!normalizedKey) {
      return {
        name,
        type: normalizeTypeLabel(currentType) ?? DEFAULT_TYPE,
        source: 'fallback',
        reason: 'empty-key',
      };
    }

    const cachedDecision = this.resolvedTypes.get(normalizedKey);
    if (cachedDecision) {
      return {
        ...cachedDecision,
        reused: true,
        name,
      };
    }

    const aliasDecision = this.aliasMap.get(normalizedKey);
    if (aliasDecision) {
      const decision = {
        name,
        type: aliasDecision.type,
        source: 'alias',
        reason: `matched-alias:${aliasDecision.canonical}`,
      };
      this.resolvedTypes.set(normalizedKey, decision);
      return decision;
    }

    const cached = this.cacheStore.get(normalizedKey);
    if (cached) {
      const decision = {
        name,
        type: normalizeTypeLabel(cached.type) ?? DEFAULT_TYPE,
        source: 'cache',
        origin: cached.source ?? 'llm',
        reason: cached.reason ?? 'cache-hit',
        provider: cached.provider ?? null,
        model: cached.model ?? null,
      };
      this.resolvedTypes.set(normalizedKey, decision);
      return decision;
    }

    const llmDecision = await this.classifyViaLLM({
      name,
      currentType,
      contextText,
    });

    if (llmDecision) {
      const decision = {
        name,
        type: llmDecision.type,
        source: 'llm',
        reason: llmDecision.reason ?? 'llm',
        provider: this.stats.llm.provider,
        model: this.stats.llm.model,
      };
      this.resolvedTypes.set(normalizedKey, decision);
      this.cacheStore.set(normalizedKey, {
        type: decision.type,
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
      return decision;
    }

    const fallbackDecision = {
      name,
      type: normalizeTypeLabel(currentType) ?? DEFAULT_TYPE,
      source: 'fallback',
      reason: this.stats.llm.disabledReason ?? 'llm-unavailable',
    };
    this.resolvedTypes.set(normalizedKey, fallbackDecision);
    return fallbackDecision;
  }

  async classifyViaLLM({ name, currentType, contextText }) {
    const classifier = await this.ensureClassifier();
    if (!classifier) {
      this.stats.llm.disabledReason = this.stats.llm.disabledReason ?? 'disabled';
      return null;
    }
    const prompt = createClassifierPrompt({ name, currentType, contextText });
    this.stats.llm.attempts += 1;
    try {
      const response = await classifier.invoke(prompt);
      const normalizedType = normalizeTypeLabel(response?.type) ?? DEFAULT_TYPE;
      this.stats.llm.success += 1;
      return {
        type: normalizedType,
        reason: response?.reason ?? null,
        confidence: response?.confidence ?? null,
      };
    } catch (error) {
      this.stats.llm.failures += 1;
      this.stats.llm.errors.push(error?.message ?? String(error));
      this.recordSample('failures', {
        name,
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
          name: 'entity_type_normalizer',
        });
        this.stats.llm.provider = provider;
        this.stats.llm.model = modelName;
        return this.classifierModel;
      } catch (error) {
        this.stats.llm.errors.push(`${provider}: ${error?.message ?? error}`);
        continue;
      }
    }
    this.stats.llm.disabledReason = 'provider-init-failed';
    return null;
  }

  updateRelationshipTypes(relationships) {
    for (const rel of relationships) {
      if (!rel || typeof rel !== 'object') continue;
      if (rel.source?.name) {
        const key = normalizeEntityKey(rel.source.name);
        const decision = this.resolvedTypes.get(key);
        if (decision?.type) {
          rel.source.type = decision.type;
        }
      }
      if (rel.target?.name) {
        const key = normalizeEntityKey(rel.target.name);
        const decision = this.resolvedTypes.get(key);
        if (decision?.type) {
          rel.target.type = decision.type;
        }
      }
    }
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

export async function createEntityTypeNormalizer(options = {}) {
  const normalizer = new EntityTypeNormalizer(options);
  await normalizer.init();
  return normalizer;
}
