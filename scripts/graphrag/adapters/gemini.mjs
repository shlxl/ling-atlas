import { generateKnowledgeGraph } from '../../llm/graph-extractor.mjs';
const MAX_DOC_CHARS = Number.parseInt(
  process.env.GRAPHRAG_GEMINI_MAX_DOC_CHARS ?? '12000',
  10,
);
const MAX_MENTIONS_PER_NODE = Number.parseInt(
  process.env.GRAPHRAG_GEMINI_MAX_MENTIONS_PER_NODE ?? '3',
  10,
);

const DEFAULT_MODEL = process.env.GRAPHRAG_GEMINI_DEFAULT_MODEL || 'gemini-2.5-pro';
const PROVIDER_CHAIN =
  process.env.GRAPHRAG_EXTRACTOR_PROVIDERS ??
  process.env.GRAPHRAG_EXTRACTOR_PROVIDER ??
  process.env.GRAPH_EXTRACTOR_PROVIDERS ??
  process.env.GRAPH_EXTRACTOR_PROVIDER;

async function callGenerator(text, { modelName } = {}) {
  try {
    const resolvedModel = modelName || DEFAULT_MODEL;
    return await generateKnowledgeGraph(text, {
      modelName: resolvedModel,
      provider: PROVIDER_CHAIN,
    });
  } catch (error) {
    throw new Error(`调用 Gemini 实体提取失败: ${error?.message ?? error}`);
  }
}

function buildDocContext(doc) {
  const chunks = doc?.chunks ?? [];
  if (!chunks.length) {
    return { text: doc?.rawContent ?? '', truncated: false };
  }

  const parts = [];
  let remaining = MAX_DOC_CHARS;
  let truncated = false;

  for (const chunk of chunks) {
    if (!chunk?.text) continue;
    const trimmed = chunk.text.trim();
    if (!trimmed) continue;

    const slice = trimmed.slice(0, Math.max(0, remaining));
    if (!slice.length) {
      truncated = true;
      break;
    }

    parts.push(slice);
    remaining -= slice.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
  }

  return { text: parts.join('\n\n'), truncated };
}

function buildMentions(doc, nodes) {
      if (!Array.isArray(nodes) || !nodes.length) return [];
      const chunks = doc?.chunks ?? [];
      if (!chunks.length) return [];
  
      const mentions = [];
      for (const node of nodes) {
        if (!node?.id) continue;
        const needle = (node.properties?.name ?? node.id).toLowerCase();
        let mentionCount = 0;
    for (const chunk of chunks) {
      if (!chunk?.text || !chunk?.id) continue;
      if (mentionCount >= MAX_MENTIONS_PER_NODE) break;

      const haystack = chunk.text.toLowerCase();
      const index = haystack.indexOf(needle);
      if (index === -1) continue;

      const start = Math.max(0, index - 40);
      const end = Math.min(chunk.text.length, index + node.id.length + 40);
      const snippet = chunk.text.slice(start, end);

      mentions.push({
        chunkId: chunk.id,
        entity: {
          type: node.type,
          name: node.id,
        },
        confidence: 0.75,
        snippet,
      });
      mentionCount += 1;
    }
  }

  return mentions;
}

export async function loadGeminiAdapter({ model = DEFAULT_MODEL } = {}) {
  return {
    async extract(doc) {
      const allEntities = new Map();
      const allMentions = [];
      const allRelationships = [];
      const diagnostics = [];
      let docEntityRoots = [];

      const { text, truncated } = buildDocContext(doc);
      if (!text) {
        diagnostics.push({
          level: 'warning',
          message: '文档内容为空，跳过 Gemini 实体提取',
        });
        return {
          entities: [],
          relationships: [],
          mentions: [],
          diagnostics,
        };
      }

      try {
        const result = await callGenerator(text, {
          modelName: model,
        });

        if (Array.isArray(result?.doc_entity_roots)) {
          docEntityRoots = result.doc_entity_roots;
        }

        for (const node of result?.nodes ?? []) {
          if (!node?.id) continue;
          if (!allEntities.has(node.id)) {
            allEntities.set(node.id, {
              name: node.id,
              type: node.type,
              salience: 1.0,
            });
          }
        }

        for (const rel of result?.relationships ?? []) {
          if (!rel?.source || !rel?.target) continue;
          allRelationships.push({
            source: { type: rel.source.type, name: rel.source.id },
            target: { type: rel.target.type, name: rel.target.id },
            type: rel.type,
            weight: rel.weight ?? 1.0,
          });
        }

        const mentions = buildMentions(doc, result?.nodes ?? []);
        allMentions.push(...mentions);
      } catch (error) {
        throw new Error(`调用 Gemini 实体提取失败: ${error.message}`);
      }

      diagnostics.push({
        level: 'info',
        message: `Gemini 模型识别到 ${allEntities.size} 个实体`,
      });

      if (truncated) {
        diagnostics.push({
          level: 'warning',
          message: `文档超过 ${MAX_DOC_CHARS} 字符，仅截取首段用于提取`,
        });
      }

      return {
        entities: Array.from(allEntities.values()),
        relationships: allRelationships,
        mentions: allMentions,
        doc_entity_roots: docEntityRoots,
        diagnostics,
      };
    },
  };
}
