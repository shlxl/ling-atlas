import fs from 'node:fs/promises';
import path from 'node:path';

export function resolvePath(root, target, fallback) {
  if (target) {
    return path.isAbsolute(target) ? target : path.join(root, target);
  }
  return path.join(root, fallback);
}

export async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return fallback;
    }
    throw error;
  }
}

export function normalizeEntityKey(value = '') {
  if (!value || typeof value !== 'string') return '';
  let text = value.normalize('NFKC');
  text = text
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?]/g, '')
    .replace(/<.*?>/g, '')
    .replace(/\{.*?}/g, '');
  text = text.replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, '');
  return text.toLowerCase().trim();
}

export function normalizeLooseLabel(value = '') {
  if (!value || typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, '')
    .toLowerCase()
    .trim();
}

export function buildDocContext(doc = {}) {
  const parts = [];
  if (doc.title) {
    parts.push(`标题: ${doc.title}`);
  }
  if (doc.description) {
    parts.push(`摘要: ${doc.description}`);
  }
  if (Array.isArray(doc.categories) && doc.categories.length) {
    const categoryNames = doc.categories.map((cat) => cat?.name ?? cat).filter(Boolean);
    if (categoryNames.length) {
      parts.push(`分类: ${categoryNames.join(', ')}`);
    }
  }
  if (Array.isArray(doc.tags) && doc.tags.length) {
    const tagNames = doc.tags.map((tag) => tag?.name ?? tag).filter(Boolean);
    if (tagNames.length) {
      parts.push(`标签: ${tagNames.join(', ')}`);
    }
  }
  return parts.join('\n');
}
