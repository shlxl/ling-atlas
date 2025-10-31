import { pipeline, env } from '@huggingface/transformers';

const DEFAULT_MODEL = 'Xenova/bert-base-multilingual-cased-ner-hrl';

let nerPipelinePromise = null;
let currentModel = null;

function normalizeGroup(group) {
  if (!group) return 'Entity';
  const upper = group.toUpperCase();
  if (upper.includes('PER')) return 'Person';
  if (upper.includes('ORG')) return 'Organization';
  if (upper.includes('LOC')) return 'Location';
  if (upper.includes('MISC')) return 'Concept';
  return 'Entity';
}

function computeSnippet(text, start, end, fallback) {
  if (typeof start === 'number' && typeof end === 'number' && start < end) {
    return text.slice(start, end);
  }
  return fallback ?? '';
}

function normalizeName(raw) {
  if (!raw) return '';
  return raw.replace(/#/g, '').replace(/\s+/g, ' ').trim();
}

function isMeaningfulName(name) {
  if (!name) return false;
  if (name.length <= 1) return false;
  if (name.length <= 3 && name.toUpperCase() !== name) return false;
  if (/^[a-z]+$/.test(name)) return false;
  if (/^[\W_]+$/.test(name)) return false;
  return true;
}

function formatScore(score) {
  if (typeof score !== 'number') return undefined;
  return Number(score.toFixed(4));
}

async function getPipeline({ model, cacheDir }) {
  if (nerPipelinePromise && currentModel === model) {
    return nerPipelinePromise;
  }

  if (cacheDir) {
    env.cacheDir = cacheDir;
  }

  env.allowLocalModels = false;

  currentModel = model;
  nerPipelinePromise = pipeline('token-classification', model, {
    aggregation_strategy: 'simple',
  });
  return nerPipelinePromise;
}

export async function loadTransformersNERAdapter({
  model = DEFAULT_MODEL,
  cacheDir = process.env.GRAPHRAG_TRANSFORMERS_CACHE,
} = {}) {
  await getPipeline({ model, cacheDir });

  return {
    async extract(doc) {
      const ner = await getPipeline({ model, cacheDir });
      const entityMap = new Map();
      const relationships = new Map();
      const mentions = [];
      const diagnostics = [];

      for (const chunk of doc.chunks ?? []) {
        if (!chunk.text || chunk.text.trim().length === 0) continue;

        const outputs = await ner(chunk.text, {
          aggregation_strategy: 'simple',
        });

        const chunkEntities = [];

        for (const item of outputs) {
          const rawName = (item.word ?? item.entity ?? '').trim();
          const name = normalizeName(rawName);
          if (!isMeaningfulName(name)) continue;
          if (!name) continue;

          const type = normalizeGroup(item.entity_group ?? item.entity);
          const key = `${type}::${name}`;

          const existing = entityMap.get(key);
          if (existing) {
            existing.salience += item.score ?? 0;
          } else {
            entityMap.set(key, {
              type,
              name,
              salience: item.score ?? 0,
            });
          }

          chunkEntities.push(key);
          mentions.push({
            chunk_id: chunk.id,
            entity: { type, name },
            confidence: formatScore(item.score),
            snippet: computeSnippet(chunk.text, item.start, item.end, name),
          });
        }

        const uniqueKeys = [...new Set(chunkEntities)];
        for (let i = 0; i < uniqueKeys.length; i += 1) {
          for (let j = i + 1; j < uniqueKeys.length; j += 1) {
            const relKey = `${uniqueKeys[i]}|${uniqueKeys[j]}`;
            relationships.set(relKey, (relationships.get(relKey) ?? 0) + 1);
          }
        }
      }

      const entities = [...entityMap.values()].map((entity) => ({
        type: entity.type,
        name: entity.name,
        salience: formatScore(entity.salience),
      }));

      const relationshipList = [...relationships.entries()].map(
        ([key, weight]) => {
          const [left, right] = key.split('|');
          const [sourceType, sourceName] = left.split('::');
          const [targetType, targetName] = right.split('::');
          return {
            source: { type: sourceType, name: sourceName },
            target: { type: targetType, name: targetName },
            type: 'CO_OCCURS',
            weight,
          };
        },
      );

      diagnostics.push({
        level: 'info',
        message: `Transformers.js NER 识别到 ${entities.length} 个实体，${relationshipList.length} 条关系`,
      });

      return {
        entities,
        relationships: relationshipList,
        mentions,
        diagnostics,
      };
    },
  };
}
