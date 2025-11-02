import { spawn } from 'child_process';
import path from 'path';

const SCRIPT_PATH = path.resolve(process.cwd(), 'app.py');
const MAX_DOC_CHARS = Number.parseInt(
  process.env.GRAPHRAG_GEMINI_MAX_DOC_CHARS ?? '12000',
  10,
);
const MAX_MENTIONS_PER_NODE = Number.parseInt(
  process.env.GRAPHRAG_GEMINI_MAX_MENTIONS_PER_NODE ?? '3',
  10,
);

const DEFAULT_MODEL = process.env.GRAPHRAG_GEMINI_DEFAULT_MODEL || 'gemini-2.5-pro';

function callPythonScript(text, { modelName }) {
  return new Promise((resolve, reject) => {
    const resolvedModel = modelName || DEFAULT_MODEL;
    const args = [SCRIPT_PATH, '--model', resolvedModel];

    const pythonProcess = spawn('python3', args, {
      env: process.env,
    });

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        let errorMsg = `Python 脚本执行失败，退出码: ${code}`;
        if (stderrData) {
          try {
            const parsedError = JSON.parse(stderrData);
            errorMsg += ` - ${parsedError.error}`;
          } catch {
            errorMsg += ` - ${stderrData}`;
          }
        }
        return reject(new Error(errorMsg));
      }

      try {
        const result = JSON.parse(stdoutData);
        resolve(result);
      } catch (error) {
        reject(new Error(`解析 Python 脚本输出失败: ${error.message}`));
      }
    });

    pythonProcess.stdin.write(text);
    pythonProcess.stdin.end();
  });
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
    const needle = node.id.toLowerCase();
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
        const result = await callPythonScript(text, {
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
        throw new Error(`调用 Python 实体提取脚本失败: ${error.message}`);
      }

      diagnostics.push({
        level: 'info',
        message: `Python (Gemini) 脚本识别到 ${allEntities.size} 个实体`,
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
