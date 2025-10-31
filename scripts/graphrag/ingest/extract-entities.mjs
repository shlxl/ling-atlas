function buildPlaceholderEntities(doc) {
  const tags = Array.isArray(doc?.tags) ? doc.tags : [];
  if (!tags.length) {
    return [];
  }
  return tags.map((tag) => ({
    type: 'Concept',
    name: tag.name ?? tag.slug ?? String(tag),
    salience: 0.5,
  }));
}

export async function extractEntities(doc, { adapter } = {}) {
  if (adapter?.extract) {
    return adapter.extract(doc);
  }

  const entities = buildPlaceholderEntities(doc);
  const firstChunkId = doc?.chunks?.[0]?.id ?? null;
  const mentions = firstChunkId
    ? entities.map((entity) => ({
        chunkId: firstChunkId,
        entity,
        confidence: 0.5,
      }))
    : [];

  return {
    entities,
    relationships: [],
    mentions,
    diagnostics: [{ level: 'info', message: '使用占位实体提取器，根据标签生成概念实体' }],
  };
}
