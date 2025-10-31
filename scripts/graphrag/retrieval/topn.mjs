import { withSession } from '../neo4j-client.mjs';

const DEFAULT_LIMIT = 5;

function normalizeParams(params = {}) {
  return {
    entityNames:
      Array.isArray(params.entityNames) && params.entityNames.length > 0
        ? params.entityNames
        : [],
    category: params.category ?? null,
    language: params.language ?? params.locale ?? null,
    limit: params.limit ?? DEFAULT_LIMIT,
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeScore({ doc, params }) {
  let score = 0;
  const matchedEntities = doc.entities ?? [];
  for (const entity of matchedEntities) {
    const salience = Number(entity.salience ?? 0);
    if (Number.isFinite(salience)) {
      score += salience;
    }
  }

  if (
    params.category &&
    Array.isArray(doc.categories) &&
    doc.categories.includes(params.category)
  ) {
    score += 0.1;
  }

  const updatedAt = parseDate(doc.updated_at ?? doc.updated ?? doc.date);
  if (updatedAt) {
    score += updatedAt.getTime() / 8.64e10; // scale: days
  }

  return score;
}

function buildReasons({ doc, params }) {
  const reasons = [];
  if (doc.entities?.length) {
    for (const entity of doc.entities) {
      const salience = Number(entity.salience ?? 0);
      const salienceText = Number.isFinite(salience)
        ? salience.toFixed(3)
        : entity.salience;
      reasons.push(
        `包含实体 ${entity.name}${
          salienceText && salienceText !== '0.000' ? `（salience ${salienceText}）` : ''
        }`,
      );
    }
  }

  if (params.category && doc.categories?.includes(params.category)) {
    reasons.push(`分类匹配 ${params.category}`);
  }

  const updatedAt = doc.updated_at ?? doc.updated ?? doc.date;
  if (updatedAt) {
    reasons.push(`最近更新：${updatedAt}`);
  }

  return reasons;
}

export async function fetchTopN(driver, database, rawParams = {}) {
  const params = normalizeParams(rawParams);

  return withSession(driver, database, async (session) => {
    const result = await session.run(
      `
      MATCH (d:Doc)
      OPTIONAL MATCH (d)-[:IN_CATEGORY]->(cat:Category)
      OPTIONAL MATCH (d)-[:HAS_TAG]->(tag:Tag)
      OPTIONAL MATCH (d)<-[:PART_OF]-(chunk:Chunk)-[:MENTIONS]->(e:Entity)
      WHERE ($language IS NULL OR d.locale = $language)
        AND ($category IS NULL OR cat.name = $category)
        AND (
          size($entityNames) = 0
          OR (e.name IN $entityNames)
        )
      WITH d,
           collect(DISTINCT cat.name) AS categories,
           collect(DISTINCT tag.name) AS tags,
           collect(DISTINCT e { .name, .salience }) AS entities
      RETURN d {
        .*,
        categories: categories,
        tags: tags,
        entities: entities
      } AS doc
      `,
      params,
    );

    const candidates = result.records.map((record) => record.get('doc'));

    const scored = candidates
      .map((doc) => ({
        doc,
        score: computeScore({ doc, params }),
      }))
      .filter((item) => item.score > 0 || (params.entityNames.length === 0 && params.category === null));

    scored.sort((a, b) => b.score - a.score);

    const sliced = scored.slice(0, params.limit);

    const items = sliced.map(({ doc, score }) => ({
      doc_id: doc.id,
      title: doc.title,
      updated_at: doc.updated_at ?? doc.updated ?? doc.date ?? null,
      score,
      tags: doc.tags ?? [],
      categories: doc.categories ?? [],
      reasons: buildReasons({ doc, params }),
    }));

    return {
      items,
      query: {
        entityNames: params.entityNames,
        category: params.category,
        language: params.language,
        limit: params.limit,
      },
    };
  });
}
