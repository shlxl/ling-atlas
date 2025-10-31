import { createHash } from 'node:crypto';
import { extname } from 'node:path';

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDocId(document) {
  const withoutExtension = document.relativePath.slice(
    0,
    document.relativePath.length - extname(document.relativePath).length,
  );
  return withoutExtension;
}

function splitContentIntoChunks(content) {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function createChunkId(docId, index) {
  return `${docId}#${String(index + 1).padStart(3, '0')}`;
}

function firstSentence(content) {
  if (!content) return '';
  const paragraph = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block.length > 0);
  if (!paragraph) return '';
  const sentenceMatch = paragraph.match(/^.{1,280}?([。！？.!?]|$)/);
  return sentenceMatch ? sentenceMatch[0].trim() : paragraph.slice(0, 280);
}

export function normalizeDocument(document) {
  const docId = buildDocId(document);
  const tags = ensureArray(
    document.frontmatter?.tags ?? document.frontmatter?.tags_zh,
  );
  const categories = ensureArray(
    document.frontmatter?.category ?? document.frontmatter?.category_zh,
  );

  const updatedAt =
    toIsoDate(document.frontmatter?.updated) ??
    toIsoDate(document.frontmatter?.lastUpdated) ??
    toIsoDate(document.frontmatter?.date);

  const chunks = splitContentIntoChunks(document.content).map((text, index) => ({
    id: createChunkId(docId, index),
    order: index + 1,
    text,
  }));

  const hash = createHash('sha256')
    .update(JSON.stringify(document.frontmatter ?? {}))
    .update('\n')
    .update(document.content ?? '')
    .digest('hex');

  return {
    id: docId,
    sourcePath: document.sourcePath,
    relativePath: document.relativePath,
    locale: document.locale,
    title: document.frontmatter?.title ?? '',
    description:
      document.frontmatter?.description ??
      document.frontmatter?.excerpt ??
      firstSentence(document.content),
    categories: categories.map((name) => ({
      name,
      slug: slugify(name),
    })),
    tags: tags.map((name) => ({
      name,
      slug: slugify(name),
    })),
    updatedAt,
    frontmatter: document.frontmatter,
    chunks,
    hash,
  };
}
