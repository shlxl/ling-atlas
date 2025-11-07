import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createProviderLLM, resolveProviders } from '../llm/graph-extractor.mjs';
import {
  buildDocContext,
  normalizeLooseLabel,
  readJson,
  resolvePath,
} from './normalizer-utils.mjs';

const DEFAULT_ALIAS_FILE = 'data/graphrag-object-alias.json';
const DEFAULT_CACHE_FILE = 'data/graphrag-object-cache.json';
const DEFAULT_ENABLED =
  process.env.GRAPHRAG_OBJECT_NORMALIZER_DISABLE === '1' ? false : true;
const DEFAULT_PROVIDER_CHAIN =
  process.env.GRAPHRAG_OBJECT_NORMALIZER_PROVIDERS ??
  process.env.GRAPHRAG_OBJECT_NORMALIZER_PROVIDER ??
  process.env.GRAPHRAG_RELATION_NORMALIZER_PROVIDERS ??
  process.env.GRAPHRAG_RELATION_NORMALIZER_PROVIDER ??
  process.env.GRAPH_EXTRACTOR_PROVIDERS ??
  process.env.GRAPH_EXTRACTOR_PROVIDER ??
  'gemini';
const DEFAULT_MODEL =
  process.env.GRAPHRAG_OBJECT_NORMALIZER_MODEL ??
  process.env.GRAPHRAG_RELATION_NORMALIZER_MODEL ??
  process.env.GRAPHRAG_GEMINI_DEFAULT_MODEL ??
  process.env.GEMINI_DEFAULT_MODEL ??
  'gemini-1.5-flash';

const MAX_SAMPLE_ITEMS = 5;
const OTHER_CHOICE = 'Other';

function coerceAliasEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];
  const items = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const key =
      typeof entry.key === 'string' && entry.key.trim() ? entry.key.trim() : null;
    if (!key) continue;
    const type =
      typeof entry.type === 'string' && entry.type.trim()
        ? entry.type.trim().toLowerCase()
        : 'string';
    const description =
      typeof entry.description === 'string' ? entry.description.trim() : '';
    const aliases = Array.isArray(entry.aliases)
      ? Array.from(
          new Set(
            entry.aliases
              .map((alias) => (typeof alias === 'string' ? alias.trim() : ''))
              .filter(Boolean),
          ),
        )
      : [];
    const valueAliases = Array.isArray(entry.valueAliases)
      ? entry.valueAliases
          .map((valueEntry) => {
            if (!valueEntry || typeof valueEntry !== 'object') return null;
            const value = Object.prototype.hasOwnProperty.call(valueEntry, 'value')
              ? valueEntry.value
              : undefined;
            const valueAliasList = Array.isArray(valueEntry.aliases)
              ? valueEntry.aliases
                  .map((alias) => (typeof alias === 'string' ? alias.trim() : ''))
                  .filter(Boolean)
              : [];
            if (!valueAliasList.length) return null;
            return { value, aliases: valueAliasList };
          })
          .filter(Boolean)
      : [];
    const valueRange =
      entry.valueRange && typeof entry.valueRange === 'object'
        ? {
            min:
              Object.prototype.hasOwnProperty.call(entry.valueRange, 'min') &&
              Number.isFinite(entry.valueRange.min)
                ? Number(entry.valueRange.min)
                : undefined,
            max:
              Object.prototype.hasOwnProperty.call(entry.valueRange, 'max') &&
              Number.isFinite(entry.valueRange.max)
                ? Number(entry.valueRange.max)
                : undefined,
          }
        : undefined;
    const precision =
      typeof entry.precision === 'number' && entry.precision >= 0
        ? Math.floor(entry.precision)
        : undefined;

    items.push({
      key,
      type,
      description,
      aliases,
      valueAliases,
      valueRange,
      precision,
    });
  }
  return items;
}

function buildAliasMaps(entries) {
  const aliasMap = new Map();
  const definitionByKey = new Map();
  for (const entry of entries) {
    definitionByKey.set(entry.key, entry);
    const keyAlias = normalizeLooseLabel(entry.key);
    if (keyAlias && !aliasMap.has(keyAlias)) {
      aliasMap.set(keyAlias, entry);
    }
    for (const alias of entry.aliases) {
      const normalized = normalizeLooseLabel(alias);
      if (!normalized || aliasMap.has(normalized)) continue;
      aliasMap.set(normalized, entry);
    }
  }
  return { aliasMap, definitionByKey };
}

function describeChoices(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return '（暂无可用的属性键，默认保持原始 key）';
  }
  return entries.map((entry) => `- ${entry.key}: ${entry.description || '自定义属性'}`).join('\n');
}

function formatPropertyValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clampNumber(value, range) {
  if (value == null || !Number.isFinite(value)) return value;
  let result = value;
  if (range?.min != null && Number.isFinite(range.min)) {
    result = Math.max(result, range.min);
  }
  if (range?.max != null && Number.isFinite(range.max)) {
    result = Math.min(result, range.max);
  }
  return result;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (['true', 'yes', 'y', '1', '是', '有', '开启', '启用'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '0', '否', '无', '关闭', '禁用'].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function formatValueAliasLookup(definition) {
  if (!definition?.valueAliases?.length) return null;
  const map = new Map();
  for (const entry of definition.valueAliases) {
    for (const alias of entry.aliases) {
      const normalized = normalizeLooseLabel(alias);
      if (!normalized) continue;
      if (!map.has(normalized)) {
        map.set(normalized, entry.value);
      }
    }
  }
  return map;
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      description: '从候选属性列表中选择一个键；若不匹配请选择 Other',
    },
    confidence: {
      type: 'number',
      description: '0-1 之间的置信度；未知时写 0.5',
    },
    reason: {
      type: 'string',
      description: '简要说明为何选择该键',
    },
  },
  required: ['key'],
  additionalProperties: false,
};

function createClassifierPrompt({ propertyKey, propertyValue, contextText, choiceDescription }) {
  const lines = [
    '你是知识图谱的属性归一化助手。',
    '请根据属性 key/value 与上下文，只能从下列候选属性名中选择一个最合适的结果；若无法判断，请返回 Other：',
    choiceDescription,
    `属性 Key：${propertyKey}`,
    `属性 Value：${propertyValue}`,
  ];
  if (contextText) {
    lines.push(`上下文：${contextText}`);
  }
  lines.push('请返回 JSON，字段包含 key（候选列表之一或 Other）、confidence（0-1），以及中文 reason。');
  return lines.join('\n');
}

function createEmptyStats() {
  return {
    enabled: true,
    records: {
      total: 0,
      updated: 0,
      relationships: 0,
      entities: 0,
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

export class ObjectPropertyNormalizer {
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
    this.definitionByKey = new Map();
    this.cacheStore = new Map();
    this.cacheDirty = false;
    this.resolvedKeys = new Map();
    this.classifierModel = null;
    this.choiceDescription = '';
  }

  async init() {
    this.aliasEntries = coerceAliasEntries(await readJson(this.aliasPath, []));
    const { aliasMap, definitionByKey } = buildAliasMaps(this.aliasEntries);
    this.aliasMap = aliasMap;
    this.definitionByKey = definitionByKey;
    this.choiceDescription = describeChoices(this.aliasEntries);
    const cachePayload = await readJson(this.cachePath, {});
    if (cachePayload && typeof cachePayload === 'object') {
      for (const [key, value] of Object.entries(cachePayload)) {
        if (!key || !value || typeof value !== 'object') continue;
        if (!value.canonicalKey) continue;
        this.cacheStore.set(key, value);
        this.resolvedKeys.set(key, {
          key: value.canonicalKey,
          source: 'cache',
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
    const contextText = buildDocContext(doc);
    if (Array.isArray(aggregation.relationships)) {
      for (const relationship of aggregation.relationships) {
        await this.normalizeContainerProperties(relationship, {
          kind: 'relationship',
          contextText,
          subject: relationship?.source?.name ?? relationship?.source?.id ?? null,
          target: relationship?.target?.name ?? relationship?.target?.id ?? null,
          relationType: relationship?.type ?? null,
        });
      }
    }

    if (Array.isArray(aggregation.entities)) {
      for (const entity of aggregation.entities) {
        await this.normalizeContainerProperties(entity, {
          kind: 'entity',
          contextText,
          subject: entity?.name ?? null,
        });
      }
    }

    return {
      total: this.stats.records.total,
      updated: this.stats.records.updated,
    };
  }

  async normalizeContainerProperties(container, meta = {}) {
    if (!container || typeof container !== 'object') return false;
    const properties = container.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      return false;
    }
    const entries = Object.entries(properties);
    if (!entries.length) return false;
    let changed = false;
    const next = {};

    for (const [rawKey, rawValue] of entries) {
      const trimmedKey = typeof rawKey === 'string' ? rawKey.trim() : '';
      if (!trimmedKey) continue;
      const decision = await this.resolveKey({
        key: trimmedKey,
        value: rawValue,
        contextText: meta.contextText,
      });
      this.stats.records.total += 1;
      if (meta.kind === 'relationship') {
        this.stats.records.relationships += 1;
      } else {
        this.stats.records.entities += 1;
      }
      this.bumpSource(decision, meta);

      const canonicalKey = decision.key ?? trimmedKey;
      const definition =
        decision.definition ?? this.definitionByKey.get(canonicalKey) ?? null;
      const normalizedValue = this.normalizeValue(definition, rawValue);

      const valueChanged = !deepEqual(normalizedValue, rawValue);
      if (canonicalKey !== trimmedKey || valueChanged) {
        changed = true;
        this.stats.records.updated += 1;
        this.recordSample('updates', {
          key: canonicalKey,
          previousKey: trimmedKey,
          previousValue: rawValue,
          nextValue: normalizedValue,
          source: decision.source,
          location: this.describeLocation(meta),
        });
      }

      if (normalizedValue !== undefined) {
        next[canonicalKey] = normalizedValue;
      }
    }

    if (changed) {
      container.properties = next;
    }
    return changed;
  }

  describeLocation(meta) {
    if (!meta) return null;
    if (meta.kind === 'relationship') {
      const subject = meta.subject ?? 'unknown-subject';
      const target = meta.target ?? 'unknown-target';
      return `${subject} -> ${target}${meta.relationType ? ` (${meta.relationType})` : ''}`;
    }
    if (meta.kind === 'entity') {
      return meta.subject ?? 'entity';
    }
    return null;
  }

  normalizeValue(definition, rawValue) {
    if (!definition) {
      return rawValue;
    }

    const aliasMap = formatValueAliasLookup(definition);
    if (aliasMap && typeof rawValue === 'string') {
      const normalizedAlias = normalizeLooseLabel(rawValue);
      if (normalizedAlias && aliasMap.has(normalizedAlias)) {
        rawValue = aliasMap.get(normalizedAlias);
      }
    }

    switch (definition.type) {
      case 'number': {
        let numericValue;
        if (typeof rawValue === 'number') {
          numericValue = rawValue;
        } else if (typeof rawValue === 'string') {
          const trimmed = rawValue.trim();
          if (!trimmed) {
            numericValue = undefined;
          } else {
            numericValue = Number.parseFloat(trimmed);
          }
        } else if (typeof rawValue === 'boolean') {
          numericValue = rawValue ? 1 : 0;
        } else if (Array.isArray(rawValue) || typeof rawValue === 'object') {
          numericValue = undefined;
        }
        if (!Number.isFinite(numericValue)) {
          return rawValue;
        }
        let finalValue = clampNumber(numericValue, definition.valueRange);
        if (typeof definition.precision === 'number') {
          const factor = 10 ** definition.precision;
          finalValue = Math.round(finalValue * factor) / factor;
        }
        return finalValue;
      }
      case 'boolean': {
        const normalized = normalizeBoolean(rawValue);
        return normalized === undefined ? rawValue : normalized;
      }
      case 'array': {
        if (Array.isArray(rawValue)) {
          return rawValue;
        }
        if (typeof rawValue === 'string') {
          const trimmed = rawValue.trim();
          if (!trimmed) return [];
          if (trimmed.startsWith('[')) {
            try {
              const parsed = JSON.parse(trimmed);
              return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              return [trimmed];
            }
          }
          return trimmed.split(/[,;、]/).map((item) => item.trim()).filter(Boolean);
        }
        return rawValue == null ? [] : [rawValue];
      }
      case 'object': {
        if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
          return rawValue;
        }
        if (typeof rawValue === 'string') {
          try {
            const parsed = JSON.parse(rawValue);
            return parsed && typeof parsed === 'object' ? parsed : rawValue;
          } catch {
            return rawValue;
          }
        }
        return rawValue;
      }
      case 'number[]': {
        const arr =
          definition.type === 'number[]' ? this.normalizeValue({ type: 'array' }, rawValue) : rawValue;
        if (!Array.isArray(arr)) {
          return arr;
        }
        return arr
          .map((value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
          })
          .filter((value) => value != null);
      }
      case 'string':
      default: {
        if (rawValue == null) return rawValue;
        if (typeof rawValue === 'string') {
          return rawValue.trim();
        }
        if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
          return String(rawValue);
        }
        try {
          return JSON.stringify(rawValue);
        } catch {
          return String(rawValue);
        }
      }
    }
  }

  bumpSource(decision, meta) {
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
        key: decision.key ?? decision.originalKey,
        originalKey: decision.originalKey,
        reason: decision.reason ?? decision.message ?? 'unknown',
        location: this.describeLocation(meta),
      });
    }
  }

  async resolveKey({ key, value, contextText }) {
    const normalizedKey = normalizeLooseLabel(key);
    if (normalizedKey && this.resolvedKeys.has(normalizedKey)) {
      return { ...this.resolvedKeys.get(normalizedKey), reused: true, originalKey: key };
    }

    if (normalizedKey) {
      const aliasDefinition = this.aliasMap.get(normalizedKey);
      if (aliasDefinition) {
        const decision = {
          key: aliasDefinition.key,
          source: 'alias',
          definition: aliasDefinition,
          originalKey: key,
        };
        this.resolvedKeys.set(normalizedKey, decision);
        return decision;
      }
    }

    if (normalizedKey) {
      const cached = this.cacheStore.get(normalizedKey);
      if (cached) {
        const decision = {
          key: cached.canonicalKey,
          source: 'cache',
          provider: cached.provider ?? null,
          model: cached.model ?? null,
          reason: cached.reason ?? 'cache-hit',
          originalKey: key,
          definition: this.definitionByKey.get(cached.canonicalKey) ?? null,
        };
        this.resolvedKeys.set(normalizedKey, decision);
        return decision;
      }
    }

    const llmDecision = await this.classifyViaLLM({
      propertyKey: key,
      propertyValue: formatPropertyValue(value),
      contextText,
    });

    if (llmDecision && llmDecision.key && llmDecision.key !== OTHER_CHOICE) {
      const definition = this.definitionByKey.get(llmDecision.key) ?? null;
      const decision = {
        key: llmDecision.key,
        source: 'llm',
        provider: this.stats.llm.provider,
        model: this.stats.llm.model,
        reason: llmDecision.reason ?? 'llm',
        originalKey: key,
        definition,
      };
      if (normalizedKey) {
        this.resolvedKeys.set(normalizedKey, decision);
        this.cacheStore.set(normalizedKey, {
          canonicalKey: decision.key,
          decidedAt: new Date().toISOString(),
          source: 'llm',
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
      key,
      source: 'fallback',
      reason: this.stats.llm.disabledReason ?? 'llm-unavailable',
      originalKey: key,
      definition: null,
    };
  }

  async classifyViaLLM({ propertyKey, propertyValue, contextText }) {
    const classifier = await this.ensureClassifier();
    if (!classifier) {
      this.stats.llm.disabledReason = this.stats.llm.disabledReason ?? 'disabled';
      return null;
    }
    const prompt = createClassifierPrompt({
      propertyKey,
      propertyValue,
      contextText,
      choiceDescription: this.choiceDescription,
    });
    this.stats.llm.attempts += 1;
    try {
      const response = await classifier.invoke(prompt);
      const selectedKey =
        this.definitionByKey.has(response?.key) || response?.key === OTHER_CHOICE
          ? response.key
          : OTHER_CHOICE;
      this.stats.llm.success += 1;
      return {
        key: selectedKey,
        reason: response?.reason ?? null,
        confidence: response?.confidence ?? null,
      };
    } catch (error) {
      this.stats.llm.failures += 1;
      this.stats.llm.errors.push(error?.message ?? String(error));
      this.recordSample('failures', {
        key: propertyKey,
        value: propertyValue,
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
    if (!this.providerChain || !this.aliasEntries.length) {
      this.stats.llm.disabledReason = 'missing-provider';
      return null;
    }
    const choices = this.aliasEntries.map((entry) => entry.key);
    const schema = {
      ...CLASSIFICATION_SCHEMA,
      properties: {
        ...CLASSIFICATION_SCHEMA.properties,
        key: {
          ...CLASSIFICATION_SCHEMA.properties.key,
          enum: [...choices, OTHER_CHOICE],
        },
      },
    };

    const providers = resolveProviders(this.providerChain);
    for (const provider of providers) {
      try {
        const { llm, modelName } = await createProviderLLM(provider, this.modelName);
        this.classifierModel = llm.withStructuredOutput(schema, {
          name: 'object_property_normalizer',
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

export async function createObjectPropertyNormalizer(options = {}) {
  const normalizer = new ObjectPropertyNormalizer(options);
  await normalizer.init();
  return normalizer;
}
