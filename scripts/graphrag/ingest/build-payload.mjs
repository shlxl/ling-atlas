function buildDocNode(normalizedDoc) {
  return {
    id: normalizedDoc.id,
    title: normalizedDoc.title,
    description: normalizedDoc.description,
    locale: normalizedDoc.locale,
    updated_at: normalizedDoc.updatedAt,
    source_path: normalizedDoc.sourcePath,
    hash: normalizedDoc.hash,
  };
}

function buildChunkNodes(normalizedDoc) {
  return normalizedDoc.chunks.map((chunk) => ({
    doc_id: normalizedDoc.id,
    id: chunk.id,
    order: chunk.order,
    text: chunk.text,
  }));
}

function normalizeEntityKey(value = '') {
  if (!value || typeof value !== 'string') return '';
  let text = value.normalize('NFKC');
  text = text
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/<.*?>/g, '')
    .replace(/\{.*?\}/g, '');
  text = text.replace(/[^0-9a-zA-Z\u4e00-\u9fa5]+/g, '');
  return text.toLowerCase().trim();
}

const TYPE_PRIORITY = new Map([
  ['人', 100],
  ['人物', 100],
  ['组织', 90],
  ['机构', 90],
  ['公司', 90],
  ['事件', 80],
  ['技术', 70],
  ['研究方向', 70],
  ['概念', 60],
  ['产品', 60],
  ['工具', 60],
  ['领域', 60],
  ['framework', 50],
  ['language', 50],
]);
const DEFAULT_TYPE_PRIORITY = 10;

function selectPrimaryRoot(roots = [], title = '') {
  if (!Array.isArray(roots) || roots.length === 0) {
    return [];
  }

  const lowerTitle = (title || '').toLowerCase();
  const titleKey = normalizeEntityKey(title || '');

  let match = roots.find((root) => {
    const name = root?.name;
    return name && lowerTitle.includes(name.toLowerCase());
  });

  if (!match && titleKey) {
    match = roots.find((root) => {
      const key = root?.key || normalizeEntityKey(root?.name || '');
      return key && (titleKey.includes(key) || key.includes(titleKey));
    });
  }

  if (!match) {
    match = roots.reduce((best, current) => {
      const currentType = (current.type || '').toLowerCase();
      const currentScore = TYPE_PRIORITY.get(currentType) ?? DEFAULT_TYPE_PRIORITY;
      if (!best) return current;
      const bestType = (best.type || '').toLowerCase();
      const bestScore = TYPE_PRIORITY.get(bestType) ?? DEFAULT_TYPE_PRIORITY;
      return currentScore > bestScore ? current : best;
    }, null);
  }

  if (!match) {
    match = roots[0];
  }

  return match ? [match] : [];
}

export function buildPayload(normalizedDoc, entityAggregation, options = {}) {
  const includeChunks = options.includeChunks !== false;
  const includeMentions = options.includeMentions !== false;
  const includeFrontmatter = options.includeFrontmatter !== false;
  const chunks = includeChunks ? buildChunkNodes(normalizedDoc) : [];
  const mentions = includeMentions ? entityAggregation?.mentions ?? [] : [];
  const categories = includeFrontmatter ? normalizedDoc.categories : [];
  const tags = includeFrontmatter ? normalizedDoc.tags : [];
  const rawDocRoots = Array.isArray(entityAggregation?.doc_entity_roots)
    ? entityAggregation.doc_entity_roots
    : [];

  const selectedRoots = selectPrimaryRoot(rawDocRoots, normalizedDoc.title);

  const docEntityRoots = selectedRoots.map((entity) => ({
    name: entity.name,
    type: entity.type,
  }));
  
  return {
    doc: buildDocNode(normalizedDoc),
    categories,
    tags,
    chunks,
    entities: entityAggregation?.entities ?? [],
    relationships: entityAggregation?.relationships ?? [],
    mentions,
    diagnostics: entityAggregation?.diagnostics ?? [],
    docEntityRoots,
  };
}
