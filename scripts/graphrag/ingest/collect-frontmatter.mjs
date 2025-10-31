import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import matter from 'gray-matter';
import { globby } from 'globby';

function detectLocale(relativePath) {
  const segments = relativePath.split(sep);
  return segments.length > 1 ? segments[0] : 'default';
}

export async function collectDocuments({
  docsRoot = 'docs',
  locale,
  includeDrafts = false,
} = {}) {
  const pattern = join(docsRoot, '**/*.md').replaceAll('\\', '/');
  const files = await globby(pattern, { dot: false });

  const documents = [];
  for (const absolutePath of files) {
    const relPath = relative(docsRoot, absolutePath);
    const detectedLocale = detectLocale(relPath);
    if (locale && detectedLocale !== locale) continue;

    const raw = await readFile(absolutePath, 'utf8');
    const parsed = matter(raw);
    if (!includeDrafts && parsed.data?.draft === true) continue;

    documents.push({
      sourcePath: absolutePath,
      relativePath: relPath.replaceAll('\\', '/'),
      locale: detectedLocale,
      frontmatter: parsed.data ?? {},
      content: parsed.content ?? '',
    });
  }

  return documents;
}
