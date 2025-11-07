import process from 'node:process';
import { pathToFileURL } from 'node:url';

import dotenv from 'dotenv';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

dotenv.config({ override: true });

const API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const DEFAULT_MODEL = process.env.GEMINI_DEFAULT_MODEL ?? 'gemini-1.5-pro';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-4o-mini';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE ?? 'https://api.deepseek.com/v1';
const MAX_GRAPH_NODES = Number.parseInt(process.env.GEMINI_MAX_GRAPH_NODES ?? '50', 10);
const MAX_GRAPH_RELATIONSHIPS = Number.parseInt(
  process.env.GEMINI_MAX_GRAPH_RELATIONSHIPS ?? '100',
  10,
);

const PROMPT_TEMPLATE = `从以下文本中提取知识图谱。请识别出所有的实体作为节点，以及它们之间的关系。
确保节点具有唯一的ID（通常是实体的名称）和类型（例如：人、地点、组织、概念）。
如果实体或关系有额外的属性（例如日期、数量、职位、事件描述等），请将它们提取到'properties'字段中。
特别地，如果关系是双向的（例如“合作”“同事”“配偶”），请为每个方向都生成一条关系边（例如 A-合作->B 和 B-合作->A）。
文本: {text}`;

const STRUCTURE_KEYWORDS = new Set([
  'chunk',
  'section',
  'paragraph',
  'chapter',
  'part',
  'page',
  'step',
  'item',
  'lesson',
  'segment',
]);

const STRUCTURE_PATTERN_EN = /^(?:chunk|section|paragraph|chapter|part|page|step|item|lesson|segment)[\s\-_#]*(?:\d+|[ivxlcdm]+)$/i;
const STRUCTURE_PATTERN_CN = /第\s*[零一二三四五六七八九十百千\d]+(?:章节|部分|篇|节|段|章)$/;

const TYPE_PRIORITY = {
  person: 100,
  人: 100,
  人物: 100,
  organization: 90,
  组织: 90,
  机构: 90,
  公司: 90,
  event: 85,
  事件: 85,
  paper: 80,
  article: 80,
  参考文献: 80,
  技术: 70,
  technology: 70,
  研究方向: 70,
  'research direction': 70,
  concept: 60,
  概念: 60,
  '概念概念': 60,
  product: 60,
  产品: 60,
  tool: 60,
  工具: 60,
  domain: 60,
  领域: 60,
  framework: 55,
  language: 50,
};
const DEFAULT_TYPE_PRIORITY = 10;

const TYPE_ALIASES = {
  person: 'Person',
  人: 'Person',
  人物: 'Person',
  作者: 'Person',
  author: 'Person',
  organization: 'Organization',
  组织: 'Organization',
  机构: 'Organization',
  公司: 'Organization',
  enterprise: 'Organization',
  company: 'Organization',
  event: 'Event',
  事件: 'Event',
  paper: 'Paper',
  article: 'Paper',
  论文: 'Paper',
  文献: 'Paper',
  '参考文献': 'Paper',
  artículo: 'Paper',
  articulo: 'Paper',
  technology: 'Technology',
  技术: 'Technology',
  'research direction': 'ResearchDirection',
  researchdirection: 'ResearchDirection',
  研究方向: 'ResearchDirection',
  concept: 'Concept',
  概念: 'Concept',
  '概念概念': 'Concept',
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
};

function normalizeTypeLabel(value) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  const alias = TYPE_ALIASES[lower];
  if (alias) {
    return alias;
  }
  return trimmed;
}

function propertyEntriesSchema() {
  return {
    type: 'array',
    description: '额外的属性列表，每项包含 key/value 键值对',
    items: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '属性名称',
        },
        value: {
          type: 'string',
          description: '属性值，如需复杂结构请返回 JSON 字符串',
        },
      },
      required: ['key', 'value'],
      additionalProperties: false,
    },
  };
}

function nodeSchema() {
  return {
    type: 'object',
    description: '实体节点，至少包含唯一的 id',
    properties: {
      id: {
        type: 'string',
        description: '实体的唯一标识，通常为名称',
      },
      type: {
        type: 'string',
        description: '实体类型，例如 人物、组织、概念',
      },
      properties: propertyEntriesSchema(),
    },
    required: ['id'],
    additionalProperties: false,
  };
}

function relationshipSchema() {
  return {
    type: 'object',
    description: '实体之间的关系描述',
    properties: {
      source: nodeSchema(),
      target: nodeSchema(),
      type: {
        type: 'string',
        description: '关系类型，例如 关联、合作、竞争',
      },
      properties: propertyEntriesSchema(),
    },
    required: ['source', 'target'],
    additionalProperties: false,
  };
}

function docEntityRootSchema() {
  return {
    type: 'object',
    description: '文档中抽取出的核心实体快照',
    properties: {
      name: {
        type: 'string',
        description: '实体名称',
      },
      type: {
        type: 'string',
        description: '实体类型',
      },
      key: {
        type: 'string',
        description: '用于归一化或分组的键',
      },
    },
    required: ['name'],
    additionalProperties: false,
  };
}

const KnowledgeGraphSchema = {
  type: 'object',
  description: '知识图谱结构化结果',
  properties: {
    nodes: {
      type: 'array',
      description: '实体节点列表',
      items: nodeSchema(),
    },
    relationships: {
      type: 'array',
      description: '实体之间的关系列表',
      items: relationshipSchema(),
    },
    doc_entity_roots: {
      type: 'array',
      description: '文档级实体摘要，用于构建 Doc -> Entity 关系',
      items: docEntityRootSchema(),
    },
  },
  required: ['nodes', 'relationships'],
  additionalProperties: false,
};

let cachedChatOpenAI;

async function loadChatOpenAI() {
  if (cachedChatOpenAI) {
    return cachedChatOpenAI;
  }
  try {
    const mod = await import('@langchain/openai');
    if (!mod.ChatOpenAI) {
      throw new Error('未找到 ChatOpenAI 导出');
    }
    cachedChatOpenAI = mod.ChatOpenAI;
    return cachedChatOpenAI;
  } catch (error) {
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : '无法加载 @langchain/openai 包';
    throw new Error(
      `加载 OpenAI 提供方失败：${message}。如需启用 openai/deepseek，请先执行 npm install @langchain/openai`
    );
  }
}

export function resolveProviders(override) {
  const rawValue =
    override ??
    process.env.GRAPH_EXTRACTOR_PROVIDERS ??
    process.env.GRAPH_EXTRACTOR_PROVIDER ??
    'gemini';

  if (Array.isArray(rawValue)) {
    const list = rawValue.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean);
    return list.length ? Array.from(new Set(list)) : ['gemini'];
  }

  const parts = String(rawValue)
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) {
    return ['gemini'];
  }
  return Array.from(new Set(parts));
}

export function mergeRawGraphs(graphs) {
  const merged = {
    nodes: [],
    relationships: [],
    doc_entity_roots: [],
  };

  for (const graph of graphs) {
    if (graph && Array.isArray(graph.nodes)) {
      merged.nodes.push(...graph.nodes);
    }
    if (graph && Array.isArray(graph.relationships)) {
      merged.relationships.push(...graph.relationships);
    }
    if (graph && Array.isArray(graph.doc_entity_roots)) {
      merged.doc_entity_roots.push(...graph.doc_entity_roots);
    }
  }

  return merged;
}

export async function createProviderLLM(provider, requestedModel) {
  const normalized = (provider ?? '').toLowerCase();
  switch (normalized) {
    case 'gemini': {
      if (!API_KEY) {
        throw new Error('未配置 GEMINI_API_KEY 或 GOOGLE_API_KEY');
      }
      const modelName = (requestedModel ?? '').trim() || DEFAULT_MODEL;
      return {
        llm: new ChatGoogleGenerativeAI({
          model: modelName,
          temperature: 0,
          apiKey: API_KEY,
        }),
        modelName,
      };
    }
    case 'openai': {
      if (!OPENAI_API_KEY) {
        throw new Error('未配置 OPENAI_API_KEY');
      }
      const ChatOpenAI = await loadChatOpenAI();
      const modelName = (requestedModel ?? '').trim() || OPENAI_DEFAULT_MODEL;
      return {
        llm: new ChatOpenAI({
          apiKey: OPENAI_API_KEY,
          model: modelName,
          temperature: 0,
        }),
        modelName,
      };
    }
    case 'deepseek': {
      if (!DEEPSEEK_API_KEY) {
        throw new Error('未配置 DEEPSEEK_API_KEY');
      }
      const ChatOpenAI = await loadChatOpenAI();
      const modelName = (requestedModel ?? '').trim() || DEEPSEEK_MODEL;
      return {
        llm: new ChatOpenAI({
          apiKey: DEEPSEEK_API_KEY,
          model: modelName,
          temperature: 0,
          configuration: {
            baseURL: DEEPSEEK_API_BASE,
          },
        }),
        modelName,
      };
    }
    default:
      throw new Error(`未知的模型提供方：${provider}`);
  }
}

/**
 * @param {string} value
 */
function normalizeEntityKey(value) {
  let text = value.normalize('NFKC');
  text = text.replace(/（.*?）|\(.*?\)|【.*?】|\[.*?]|<.*?>|\{.*?}/g, '');
  text = text.toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '');
  return text.trim();
}

/**
 * @param {unknown} properties
 */
function coerceProperties(properties) {
  if (properties == null || properties === '') {
    return undefined;
  }
  if (Array.isArray(properties)) {
    const result = {};
    for (const entry of properties) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const rawKey = typeof entry.key === 'string' ? entry.key.trim() : '';
      if (!rawKey) {
        continue;
      }
      const value = entry.value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          result[rawKey] = '';
          continue;
        }
        try {
          result[rawKey] = JSON.parse(trimmed);
          continue;
        } catch {
          result[rawKey] = trimmed;
          continue;
        }
      }
      result[rawKey] = value;
    }
    return Object.keys(result).length ? result : undefined;
  }
  if (typeof properties === 'string') {
    try {
      return JSON.parse(properties);
    } catch (error) {
      throw new Error('Invalid JSON string for properties');
    }
  }
  if (typeof properties === 'object' && !Array.isArray(properties)) {
    return /** @type {Record<string, unknown>} */ (properties);
  }
  return undefined;
}

function extractTypeFromProperties(properties, fallbackType) {
  let nextType = fallbackType?.trim() ?? '';
  let nextProps = properties;
  if (nextProps && typeof nextProps === 'object' && !Array.isArray(nextProps)) {
    const rawType = typeof nextProps.type === 'string' ? nextProps.type.trim() : '';
    if (rawType) {
      nextType = rawType;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type: _discarded, ...rest } = nextProps;
      nextProps = Object.keys(rest).length ? rest : undefined;
    }
  }
  return {
    type: nextType || undefined,
    properties: nextProps,
  };
}

/**
 * @param {string | undefined} current
 * @param {string | undefined} candidate
 */
export function selectType(current, candidate) {
  const normalizedCurrent = normalizeTypeLabel(current) ?? 'Concept';
  const normalizedCandidate = normalizeTypeLabel(candidate) ?? 'Concept';
  const currentScore = TYPE_PRIORITY[normalizedCurrent.toLowerCase()] ?? DEFAULT_TYPE_PRIORITY;
  const candidateScore = TYPE_PRIORITY[normalizedCandidate.toLowerCase()] ?? DEFAULT_TYPE_PRIORITY;
  return candidateScore > currentScore ? normalizedCandidate : normalizedCurrent;
}

/**
 * @param {Record<string, any>} graph
 */
export function sanitizeGraph(graph) {
  const nodes = [];
  const aliasMap = new Map();
  const canonicalByKey = new Map();
  const canonicalById = new Map();

  for (const node of graph.nodes ?? []) {
    const nodeId = node.id?.trim();
    if (!nodeId || nodeId.includes('#') || nodeId.includes('/')) {
      continue;
    }

    const initialType = node.type?.trim() ?? '';
    const initialTypeLower = initialType.toLowerCase();
    const isStructureNode =
      STRUCTURE_PATTERN_EN.test(nodeId) ||
      STRUCTURE_PATTERN_CN.test(nodeId) ||
      STRUCTURE_KEYWORDS.has(nodeId.toLowerCase()) ||
      (initialTypeLower && STRUCTURE_KEYWORDS.has(initialTypeLower));
    if (isStructureNode) {
      continue;
    }

    const normalizedKey = normalizeEntityKey(nodeId);
    if (!normalizedKey) {
      continue;
    }

    let properties = coerceProperties(node.properties);
    let nodeType = initialType;
    ({ type: nodeType, properties } = extractTypeFromProperties(properties, nodeType));
    nodeType = normalizeTypeLabel(nodeType) ?? 'Concept';
    const existing = canonicalByKey.get(normalizedKey);
    if (existing) {
      aliasMap.set(nodeId, existing.id);
      existing.type = selectType(existing.type, nodeType);
      continue;
    }

    const canonicalNode = {
      id: nodeId,
      type: nodeType,
      properties,
    };

    canonicalByKey.set(normalizedKey, canonicalNode);
    canonicalById.set(canonicalNode.id, canonicalNode);
    aliasMap.set(nodeId, canonicalNode.id);
    nodes.push(canonicalNode);

    if (nodes.length >= MAX_GRAPH_NODES) {
      break;
    }
  }

  const canonicalIds = new Set(nodes.map((node) => node.id));
  const relationships = [];

  for (const rel of graph.relationships ?? []) {
    const sourceId = aliasMap.get(rel.source?.id) ?? rel.source?.id;
    const targetId = aliasMap.get(rel.target?.id) ?? rel.target?.id;
    if (!sourceId || !targetId) {
      continue;
    }
    if (!canonicalIds.has(sourceId) || !canonicalIds.has(targetId)) {
      continue;
    }

    const sourceNode = canonicalById.get(sourceId) ?? rel.source;
    const targetNode = canonicalById.get(targetId) ?? rel.target;

    let sourceProperties = coerceProperties(sourceNode?.properties);
    let sourceType = sourceNode?.type;
    ({ type: sourceType, properties: sourceProperties } = extractTypeFromProperties(sourceProperties, sourceType));
    sourceType = normalizeTypeLabel(sourceType);

    let targetProperties = coerceProperties(targetNode?.properties);
    let targetType = targetNode?.type;
    ({ type: targetType, properties: targetProperties } = extractTypeFromProperties(targetProperties, targetType));
    targetType = normalizeTypeLabel(targetType);

    let relationshipProperties = coerceProperties(rel.properties);
    ({ properties: relationshipProperties } = extractTypeFromProperties(relationshipProperties));

    relationships.push({
      source: {
        id: sourceId,
        type: sourceType ?? 'Concept',
        properties: sourceProperties,
      },
      target: {
        id: targetId,
        type: targetType ?? 'Concept',
        properties: targetProperties,
      },
      type: rel.type?.trim() || 'RELATED',
      properties: relationshipProperties,
    });

    if (relationships.length >= MAX_GRAPH_RELATIONSHIPS) {
      break;
    }
  }

  const docEntityRoots = Array.from(canonicalByKey.entries()).map(([key, node]) => ({
    name: node.id,
    type: node.type ?? 'Concept',
    key,
  }));

  return {
    nodes,
    relationships,
    doc_entity_roots: docEntityRoots,
  };
}

export function getLLM(modelName = DEFAULT_MODEL) {
  return new ChatGoogleGenerativeAI({
    model: modelName,
    temperature: 0,
    apiKey: API_KEY,
  });
}

/**
 * @param {string} text
 * @param {{ modelName?: string, llm?: ChatGoogleGenerativeAI }} [options]
 */
export async function generateKnowledgeGraph(text, options = {}) {
  const trimmed = text?.trim();
  if (!trimmed) {
    throw new Error('没有从标准输入接收到文本。');
  }

  const prompt = PROMPT_TEMPLATE.replace('{text}', trimmed);

  if (options.llm) {
    const structuredModel = options.llm.withStructuredOutput(KnowledgeGraphSchema, {
      name: 'build_knowledge_graph',
    });
    const rawGraph = await structuredModel.invoke(prompt);
    return sanitizeGraph(rawGraph);
  }

  const providers = resolveProviders(options.provider);
  const rawGraphs = [];
  const providerRuns = [];

  for (const providerName of providers) {
    try {
      const { llm, modelName } = await createProviderLLM(providerName, options.modelName);
      const structuredModel = llm.withStructuredOutput(KnowledgeGraphSchema, {
        name: `build_knowledge_graph_${providerName}`,
      });
      const rawGraph = await structuredModel.invoke(prompt);
      rawGraphs.push(rawGraph);
      providerRuns.push({ provider: providerName, model: modelName, status: 'success' });
    } catch (error) {
      providerRuns.push({
        provider: providerName,
        status: 'error',
        message: error?.message ?? String(error),
      });
    }
  }

  if (!rawGraphs.length) {
    const detail = providerRuns
      .map((run) => `${run.provider}: ${run.message ?? 'unknown error'}`)
      .join('; ');
    throw new Error(`所有模型调用失败：${detail || '未找到可用提供方'}`);
  }

  const mergedRawGraph = mergeRawGraphs(rawGraphs);
  const sanitized = sanitizeGraph(mergedRawGraph);
  if (providerRuns.length) {
    sanitized.provider_runs = providerRuns;
  }
  return sanitized;
}

function parseArgs(argv) {
  const result = {
    positionalModel: undefined,
    model: undefined,
    provider: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--model') {
      result.model = argv[i + 1];
      i += 1;
    } else if (token === '--provider' || token === '--providers') {
      result.provider = argv[i + 1];
      i += 1;
    } else if (!result.positionalModel) {
      result.positionalModel = token;
    }
  }
  return result;
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  }
  return data;
}

function isRateLimitError(error) {
  const message = error?.message ?? '';
  return (
    error?.status === 429 ||
    /ResourceExhausted/i.test(message) ||
    /overloaded/i.test(message) ||
    /ServiceUnavailable/i.test(message)
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const { positionalModel, model, provider } = parseArgs(process.argv.slice(2));
  const modelName = model ?? positionalModel;
  const text = await readStdin();

  const retries = 5;
  const baseDelay = 2000;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const graph = await generateKnowledgeGraph(text, { modelName, provider });
      process.stdout.write(JSON.stringify(graph));
      return;
    } catch (error) {
      if (isRateLimitError(error) && attempt < retries - 1) {
        const delay = baseDelay * 2 ** attempt + Math.random() * 1000;
        await wait(delay);
        continue;
      }
      const message = error?.message ?? String(error);
      console.error(JSON.stringify({ error: `生成图谱时发生错误: ${message}` }));
      process.exit(1);
    }
  }
}

const invokedFromCli = (() => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedFromCli) {
  main().catch((error) => {
    const message = error?.message ?? String(error);
    console.error(JSON.stringify({ error: `生成图谱时发生错误: ${message}` }));
    process.exit(1);
  });
}

export default {
  generateKnowledgeGraph,
  mergeRawGraphs,
  resolveProviders,
  sanitizeGraph,
  selectType,
  getLLM,
};
