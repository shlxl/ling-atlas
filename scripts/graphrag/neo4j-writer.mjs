import { withSession } from './neo4j-client.mjs';

const ENTITY_PROP_KEYS = ['salience', 'description', 'summary', 'source', 'url'];
const RELATION_PROP_KEYS = ['weight', 'evidence'];
const MENTION_PROP_KEYS = ['confidence', 'snippet'];

function pickProps(source, keys) {
  return keys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      acc[key] = source[key];
    }
    return acc;
  }, {});
}

function prepareEntities(entities = []) {
  return entities.map((entity) => ({
    name: entity.name,
    type: entity.type,
    ...pickProps(entity, ENTITY_PROP_KEYS),
  }));
}

function prepareRelationships(relationships = []) {
  return relationships.map((relationship) => ({
    source: relationship.source,
    target: relationship.target,
    type: relationship.type ?? 'RELATED',
    ...pickProps(relationship, RELATION_PROP_KEYS),
  }));
}

function prepareMentions(mentions = []) {
  return mentions.map((mention) => ({
    chunk_id: mention.chunkId ?? mention.chunk_id,
    entity: mention.entity,
    ...pickProps(mention, MENTION_PROP_KEYS),
  }));
}

async function upsertDoc(tx, payload) {
  await tx.run(
    `MERGE (d:Doc {id: $doc.id})
     SET d.title = $doc.title,
         d.description = $doc.description,
         d.locale = $doc.locale,
         d.updated_at = $doc.updated_at,
         d.source_path = $doc.source_path,
         d.hash = $doc.hash`,
    { doc: payload.doc },
  );
}

async function upsertCategories(tx, payload) {
  if (!payload.categories?.length) return;

  await tx.run(
    `MATCH (d:Doc {id: $docId})
     UNWIND $categories AS category
     MERGE (c:Category {name: category.name})
     SET c.slug = category.slug
     MERGE (d)-[:IN_CATEGORY]->(c)`,
    { docId: payload.doc.id, categories: payload.categories },
  );
}

async function upsertTags(tx, payload) {
  if (!payload.tags?.length) return;

  await tx.run(
    `MATCH (d:Doc {id: $docId})
     UNWIND $tags AS tag
     MERGE (t:Tag {name: tag.name})
     SET t.slug = tag.slug
     MERGE (d)-[:HAS_TAG]->(t)`,
    { docId: payload.doc.id, tags: payload.tags },
  );
}

async function upsertChunks(tx, payload) {
  if (!payload.chunks?.length) return;

  await tx.run(
    `MATCH (d:Doc {id: $docId})
     UNWIND $chunks AS chunk
     MERGE (c:Chunk {id: chunk.id})
     SET c.order = chunk.order,
         c.text = chunk.text,
         c.doc_id = chunk.doc_id
     MERGE (c)-[:PART_OF]->(d)`,
    { docId: payload.doc.id, chunks: payload.chunks },
  );
}

async function upsertEntities(tx, entities) {
  if (!entities.length) return;

  await tx.run(
    `UNWIND $entities AS entity
     MERGE (e:Entity {name: entity.name})
     SET e.type = entity.type,
         e.salience = entity.salience,
         e.description = entity.description,
         e.summary = entity.summary,
         e.source = entity.source,
         e.url = entity.url`,
    { entities },
  );
}

async function upsertMentions(tx, mentions) {
  const filtered = mentions.filter((mention) => mention.chunk_id && mention.entity);
  if (!filtered.length) return;

  await tx.run(
    `UNWIND $mentions AS mention
     MATCH (chunk:Chunk {id: mention.chunk_id})
     MERGE (entity:Entity {type: mention.entity.type, name: mention.entity.name})
     MERGE (chunk)-[rel:MENTIONS]->(entity)
     SET rel.confidence = mention.confidence,
         rel.snippet = mention.snippet`,
    { mentions: filtered },
  );
}

async function upsertRelationships(tx, relationships) {
  if (!relationships.length) return;

  await tx.run(
    `UNWIND $relationships AS rel
     MERGE (src:Entity {type: rel.source.type, name: rel.source.name})
     MERGE (dst:Entity {type: rel.target.type, name: rel.target.name})
     MERGE (src)-[edge:RELATED {relation: rel.type}]->(dst)
     SET edge.weight = rel.weight,
         edge.evidence = rel.evidence`,
    { relationships },
  );
}

async function upsertDocEntityEdges(tx, payload) {
  const roots = payload.docEntityRoots || [];
  if (!roots.length) return

  await tx.run(
    `MATCH (d:Doc {id: $docId})
     UNWIND $roots AS root
     MERGE (e:Entity {name: root.name})
     SET e.type = root.type
     MERGE (d)-[:HAS_ENTITY]->(e)`,
    { docId: payload.doc.id, roots },
  );
}

export async function writePayloads(driver, database, payloads) {
  if (!payloads.length) {
    return { written: 0 };
  }

  let written = 0;

  await withSession(driver, database, async (session) => {
    for (const payload of payloads) {
      await session.writeTransaction(async (tx) => {
        await upsertDoc(tx, payload);
        await upsertCategories(tx, payload);
        await upsertTags(tx, payload);
        await upsertChunks(tx, payload);
        await upsertEntities(tx, prepareEntities(payload.entities));
        await upsertMentions(tx, prepareMentions(payload.mentions));
        await upsertRelationships(tx, prepareRelationships(payload.relationships));
        await upsertDocEntityEdges(tx, payload);
      });
      written += 1;
    }
  });

  return { written };
}
