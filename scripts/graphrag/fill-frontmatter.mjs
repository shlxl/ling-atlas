#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import matter from 'gray-matter';
import { globby } from 'globby';

function firstParagraph(content) {
  if (!content) return '';
  const paragraph = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block.length > 0);
  return paragraph ? paragraph.replace(/\s+/g, ' ').slice(0, 280) : '';
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function normalizeCategory(data) {
  if (data.category && typeof data.category === 'string') {
    return data.category;
  }
  if (data.category_zh) {
    return data.category_zh;
  }
  return undefined;
}

function normalizeTags(data) {
  if (data.tags && Array.isArray(data.tags)) {
    return data.tags;
  }
  if (Array.isArray(data.tags_zh)) {
    return data.tags_zh;
  }
  return [];
}

function ensureUpdated(data) {
  if (data.updated) return data.updated;
  if (data.date) return data.date;
  return undefined;
}

async function main() {
  const files = await globby('docs/zh/content/**/index.md');
  let changedCount = 0;
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const parsed = matter(src);
    const data = parsed.data ?? {};

    let changed = false;

    const updated = ensureUpdated(data);
    if (updated && data.updated !== updated) {
      data.updated = updated;
      changed = true;
    }

    if (!data.description) {
      const source =
        typeof data.excerpt === 'string' && data.excerpt.trim().length > 0
          ? data.excerpt.trim()
          : firstParagraph(parsed.content);
      if (source) {
        data.description = source;
        changed = true;
      }
    }

    const category = normalizeCategory(data);
    if (category && data.category !== category) {
      data.category = category;
      changed = true;
    }

    const tags = normalizeArray(normalizeTags(data));
    if (tags.length > 0) {
      data.tags = [...tags];
      changed = true;
    }

    if (!data.slug) {
      const fallbackSlug =
        typeof data.title === 'string'
          ? data.title
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
          : undefined;
      if (fallbackSlug && fallbackSlug.length > 0 && !hasChinese(fallbackSlug)) {
        data.slug = fallbackSlug;
        changed = true;
      }
    }

    if (!changed) continue;

    const next = matter.stringify(parsed.content, data, {
      lineWidth: 120,
    });
    await writeFile(file, next, 'utf8');
    changedCount += 1;
    console.log(`补齐 Frontmatter：${file}`);
  }

  console.log(`完成，共更新 ${changedCount} 篇文档`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
