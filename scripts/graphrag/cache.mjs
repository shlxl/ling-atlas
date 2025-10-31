import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_CACHE_PATH = 'data/graphrag/ingest-cache.json';

async function ensureDirectory(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function loadIngestCache(cachePath = DEFAULT_CACHE_PATH) {
  const absolutePath = resolve(cachePath);
  try {
    const raw = await readFile(absolutePath, 'utf8');
    return { cache: JSON.parse(raw), path: absolutePath };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { cache: {}, path: absolutePath };
    }
    throw error;
  }
}

export async function saveIngestCache(cache, cachePath = DEFAULT_CACHE_PATH) {
  const absolutePath = resolve(cachePath);
  await ensureDirectory(absolutePath);
  await writeFile(absolutePath, JSON.stringify(cache, null, 2), 'utf8');
  return absolutePath;
}

export function shouldProcessDoc(doc, cache, { changedOnly }) {
  if (!changedOnly) return { process: true };

  const entry = cache[doc.id];
  if (!entry) {
    return { process: true, reason: '未命中缓存' };
  }

  if (entry.hash !== doc.hash) {
    return { process: true, reason: '内容变更' };
  }

  return { process: false, reason: 'hash 未变化，跳过' };
}

export function updateCacheEntry(cache, doc, { writtenAt }) {
  cache[doc.id] = {
    hash: doc.hash,
    locale: doc.locale,
    updatedAt: doc.updatedAt,
    writtenAt,
  };
}
