import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ZodType } from 'zod';

const NodeSchema = z.object({
  id: z.string(),
  type: z.string().default('Concept'),
  properties: z.record(z.any()).optional(),
});

const RelationshipSchema = z.object({
  source: NodeSchema,
  target: NodeSchema,
  type: z.string().default('RELATED'),
  properties: z.record(z.any()).optional(),
});

const KnowledgeGraphSchema = z.object({
  nodes: z.array(NodeSchema),
  relationships: z.array(RelationshipSchema),
  doc_entity_roots: z.array(z.record(z.string())).default([]),
});

export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;

const MAX_GRAPH_NODES = parseInt(process.env.GEMINI_MAX_GRAPH_NODES || '50', 10);
const MAX_GRAPH_RELATIONSHIPS = parseInt(process.env.GEMINI_MAX_GRAPH_RELATIONSHIPS || '100', 10);

const STRUCTURE_KEYWORDS = new Set([
    "chunk",
    "section",
    "paragraph",
    "chapter",
    "part",
    "page",
    "step",
    "item",
    "lesson",
    "segment",
]);

const STRUCTURE_PATTERN_EN = new RegExp(
    "^(?:chunk|section|paragraph|chapter|part|page|step|item|lesson|segment)[\s_#-]*(?:\d+|[ivxlcdm]+)$",
    "i"
);

const STRUCTURE_PATTERN_CN = new RegExp("第\s*[零一二三四五六七八九十百千\\d]+(?:章节|部分|篇|节|段|章)$", "i");

function normalizeEntityKey(value: string): string {
    let text = value.normalize("NFKC");
    text = text.replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]|<.*?>|\{.*?\}/g, "");
    text = text.replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, "").toLowerCase();
    return text.trim();
}

const TYPE_PRIORITY: Record<string, number> = {
    "人": 100,
    "人物": 100,
    "组织": 90,
    "机构": 90,
    "公司": 90,
    "事件": 80,
    "技术": 70,
    "研究方向": 70,
    "概念": 60,
    "概念概念": 60,
    "产品": 60,
    "工具": 60,
    "领域": 60,
    "framework": 50,
    "language": 50,
};

const DEFAULT_TYPE_PRIORITY = 10;

function selectType(current: string, candidate: string): string {
    current = current || "Concept";
    candidate = candidate || "Concept";
    const currentScore = TYPE_PRIORITY[current.toLowerCase()] || DEFAULT_TYPE_PRIORITY;
    const candidateScore = TYPE_PRIORITY[candidate.toLowerCase()] || DEFAULT_TYPE_PRIORITY;
    return candidateScore > currentScore ? candidate : current;
}

export function sanitizeGraph(graph: KnowledgeGraph): KnowledgeGraph {
    const nodes: Node[] = [];
    const aliasMap: Record<string, string> = {};
    const canonicalByKey: Record<string, Node> = {};
    const canonicalById: Record<string, Node> = {};

    for (const node of graph.nodes) {
        const nodeId = node.id.trim();
        const nodeIdLower = nodeId.toLowerCase();
        if (!nodeId || nodeId.includes('#') || nodeId.includes('/')) {
            continue;
        }

        const nodeType = node.type ? node.type.trim() : "Concept";
        const nodeTypeLower = nodeType.toLowerCase();

        if (
            STRUCTURE_PATTERN_EN.test(nodeId) ||
            STRUCTURE_PATTERN_CN.test(nodeId) ||
            [...STRUCTURE_KEYWORDS].some(keyword => nodeIdLower.startsWith(keyword)) ||
            STRUCTURE_KEYWORDS.has(nodeTypeLower)
        ) {
            continue;
        }

        const normalizedKey = normalizeEntityKey(nodeId);
        if (!normalizedKey) {
            continue;
        }

        const existing = canonicalByKey[normalizedKey];
        if (existing) {
            aliasMap[nodeId] = existing.id;
            existing.type = selectType(existing.type, nodeType);
            continue;
        }

        const canonicalNode: Node = { id: nodeId, type: nodeType, properties: node.properties };
        canonicalByKey[normalizedKey] = canonicalNode;
        canonicalById[canonicalNode.id] = canonicalNode;
        aliasMap[nodeId] = canonicalNode.id;
        nodes.push(canonicalNode);

        if (nodes.length >= MAX_GRAPH_NODES) {
            break;
        }
    }

    const canonicalIds = new Set(nodes.map(node => node.id));
    const relationships: Relationship[] = [];

    for (const rel of graph.relationships) {
        const sourceId = aliasMap[rel.source.id] || rel.source.id;
        const targetId = aliasMap[rel.target.id] || rel.target.id;

        if (!canonicalIds.has(sourceId) || !canonicalIds.has(targetId)) {
            continue;
        }

        const relType = rel.type ? rel.type.trim() : "RELATED";
        const sourceNode = canonicalById[sourceId];
        const targetNode = canonicalById[targetId];

        relationships.push({
            source: {
                id: sourceId,
                type: sourceNode ? sourceNode.type : (rel.source.type || "Concept"),
                properties: rel.source.properties,
            },
            target: {
                id: targetId,
                type: targetNode ? targetNode.type : (rel.target.type || "Concept"),
                properties: rel.target.properties,
            },
            type: relType,
            properties: rel.properties,
        });

        if (relationships.length >= MAX_GRAPH_RELATIONSHIPS) {
            break;
        }
    }

    const docEntityRoots = Object.entries(canonicalByKey).map(([key, node]) => ({
        name: node.id,
        type: node.type || "Concept",
        key,
    }));

    return { nodes, relationships, doc_entity_roots: docEntityRoots };
}

const PROMPT_TEMPLATE = `从以下文本中提取知识图谱。请识别出所有的实体作为节点，以及它们之间的关系。
确保节点具有唯一的ID（通常是实体的名称）和类型（例如：人、地点、组织、概念）。
如果实体或关系有额外的属性（例如日期、数量、职位、事件描述等），请将它们提取到'properties'字段中。
特别地，如果关系是双向的（例如“合作”“同事”“配偶”），请为每个方向都生成一条关系边（例如 A-合作->B 和 B-合作->A）。
文本: {text}
`;

export async function generateGraphFromText(text: string, modelName: string): Promise<KnowledgeGraph> {
    const prompt = ChatPromptTemplate.fromMessages([
        ["human", PROMPT_TEMPLATE],
    ]);
    const llm = new ChatGoogleGenerativeAI({
        modelName: modelName,
        temperature: 0,
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    });

    const structuredLlm = llm.withStructuredOutput(KnowledgeGraphSchema);

    const chain = prompt.pipe(structuredLlm);
    const result = await chain.invoke({ text });
    return sanitizeGraph(result);
}

async function main() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error(JSON.stringify({ error: "未找到 GEMINI_API_KEY 或 GOOGLE_API_KEY。" }));
        process.exit(1);
    }

    const modelName = process.argv[2] || process.env.GEMINI_DEFAULT_MODEL || "gemini-1.5-pro";

    let text = '';
    for await (const chunk of process.stdin) {
        text += chunk;
    }

    if (!text.trim()) {
        console.error(JSON.stringify({ error: "没有从标准输入接收到文本。" }));
        process.exit(1);
    }

    const retries = 5;
    const baseDelay = 2.0;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const graph = await generateGraphFromText(text, modelName);
            console.log(JSON.stringify(graph, null, 2));
            return;
        } catch (error) {
            if (error instanceof Error && (error.message.includes("速率") || error.message.includes("ServiceUnavailable") || error.message.includes("overloaded")) && attempt < retries - 1) {
                const delay = baseDelay * (2 ** attempt) + Math.random();
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
                continue;
            }
            console.error(JSON.stringify({ error: `生成图谱时发生错误: ${error}` }));
            process.exit(1);
        }
    }
}

if (require.main === module) {
    main();
}