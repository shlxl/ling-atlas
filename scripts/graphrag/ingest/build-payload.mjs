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

export function buildPayload(normalizedDoc, entityAggregation) {
  return {
    doc: buildDocNode(normalizedDoc),
    categories: normalizedDoc.categories,
    tags: normalizedDoc.tags,
    chunks: buildChunkNodes(normalizedDoc),
    entities: entityAggregation?.entities ?? [],
    relationships: entityAggregation?.relationships ?? [],
    mentions: entityAggregation?.mentions ?? [],
    diagnostics: entityAggregation?.diagnostics ?? [],
  };
}
