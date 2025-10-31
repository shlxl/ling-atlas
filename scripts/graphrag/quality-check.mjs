import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_CONFIG = {
  requiredFields: ['title', 'description', 'updatedAt', 'categories'],
  blacklistPatterns: [],
  piiPatterns: {},
  maxTagCount: 10,
};

function compilePatterns(patterns = {}) {
  return Object.entries(patterns).map(([name, pattern]) => ({
    name,
    regex: new RegExp(pattern, 'gi'),
  }));
}

function detectBlacklist(textBlocks, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'i');
    for (const block of textBlocks) {
      if (regex.test(block)) {
        hits.push({ pattern, sample: block.slice(0, 120) });
        break;
      }
    }
  }
  return hits;
}

function maskPII(chunks, piiPatterns) {
  const matches = [];
  for (const { name, regex } of piiPatterns) {
    for (const chunk of chunks) {
      const original = chunk.text;
      if (!original) continue;
      const replaced = original.replace(regex, '[REDACTED]');
      if (replaced !== original) {
        chunk.text = replaced;
        matches.push({
          chunkId: chunk.id,
          pattern: name,
        });
      }
    }
  }
  return matches;
}

function ensureDirectory(filePath) {
  return mkdir(dirname(filePath), { recursive: true });
}

async function logEvent(logPath, event) {
  await ensureDirectory(logPath);
  await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
}

async function loadConfig(configPath) {
  if (!configPath) {
    return DEFAULT_CONFIG;
  }

  try {
    const absolutePath = resolve(configPath);
    const raw = await readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function createQualityChecker({
  configPath = 'config/graphrag-quality.json',
  logPath = 'data/graphrag/quality-log.jsonl',
} = {}) {
  const config = await loadConfig(configPath);
  const compiledPII = compilePatterns(config.piiPatterns);

  async function check(doc) {
    const errors = [];
    const warnings = [];

    for (const field of config.requiredFields ?? []) {
      if (field === 'categories' && !(doc.categories?.length)) {
        errors.push({ type: 'FRONTMATTER_MISSING', message: 'category 缺失' });
      } else if (field === 'tags' && !(doc.tags?.length)) {
        errors.push({ type: 'FRONTMATTER_MISSING', message: 'tags 缺失' });
      } else if (!doc[field] && doc[field] !== 0) {
        errors.push({ type: 'FRONTMATTER_MISSING', message: `字段 ${field} 缺失` });
      }
    }

    if ((config.maxTagCount ?? 0) > 0 && doc.tags?.length > config.maxTagCount) {
      errors.push({
        type: 'TAG_LIMIT_EXCEEDED',
        message: `标签数量 ${doc.tags.length} 超过上限 ${config.maxTagCount}`,
      });
    }

    const textBlocks = doc.chunks?.map((chunk) => chunk.text) ?? [];
    const blacklistHits = detectBlacklist(textBlocks, config.blacklistPatterns ?? []);
    for (const hit of blacklistHits) {
      errors.push({
        type: 'BLACKLIST_MATCH',
        message: `命中黑名单模式 ${hit.pattern}`,
      });
    }

    const piiMatches = maskPII(doc.chunks ?? [], compiledPII);
    for (const match of piiMatches) {
      warnings.push({
        type: 'PII_MASKED',
        message: `Chunk ${match.chunkId} 匹配敏感模式 ${match.pattern}，已掩码`,
      });
    }

    const result = {
      passed: errors.length === 0,
      errors,
      warnings,
    };

    await logEvent(resolve(logPath), {
      timestamp: new Date().toISOString(),
      doc_id: doc.id,
      passed: result.passed,
      errors,
      warnings,
    });

    return result;
  }

  return { config, check };
}
