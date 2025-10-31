export const UNIQUE_CONSTRAINTS = [
  `CREATE CONSTRAINT doc_id_unique IF NOT EXISTS
   FOR (d:Doc)
   REQUIRE d.id IS UNIQUE`,
  `CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
   FOR (c:Chunk)
   REQUIRE c.id IS UNIQUE`,
  `CREATE CONSTRAINT entity_identity_unique IF NOT EXISTS
   FOR (e:Entity)
   REQUIRE (e.type, e.name) IS UNIQUE`,
  `CREATE CONSTRAINT category_name_unique IF NOT EXISTS
   FOR (c:Category)
   REQUIRE c.name IS UNIQUE`,
  `CREATE CONSTRAINT tag_name_unique IF NOT EXISTS
   FOR (t:Tag)
   REQUIRE t.name IS UNIQUE`,
  `CREATE CONSTRAINT community_id_unique IF NOT EXISTS
   FOR (c:Community)
   REQUIRE c.short_id IS UNIQUE`,
];

export const INDEXES = [
  `CREATE INDEX doc_updated_at_index IF NOT EXISTS
   FOR (d:Doc)
   ON (d.updated_at)`,
  `CREATE INDEX entity_salience_index IF NOT EXISTS
   FOR (e:Entity)
   ON (e.salience)`,
  `CREATE INDEX chunk_text_index IF NOT EXISTS
   FOR (c:Chunk)
   ON (c.text)`,
  `CREATE INDEX tag_slug_index IF NOT EXISTS
   FOR (t:Tag)
   ON (t.slug)`,
];

export const CLEANUP_STATEMENTS = [
  `MATCH (n)
   WHERE any(label IN labels(n) WHERE label IN ["Doc","Chunk","Entity","Tag","Category","Community"])
   CALL { WITH n DETACH DELETE n }
   RETURN count(*) AS removed_nodes`,
  'DROP CONSTRAINT doc_id_unique IF EXISTS',
  'DROP CONSTRAINT chunk_id_unique IF EXISTS',
  'DROP CONSTRAINT entity_identity_unique IF EXISTS',
  'DROP CONSTRAINT category_name_unique IF EXISTS',
  'DROP CONSTRAINT tag_name_unique IF EXISTS',
  'DROP CONSTRAINT community_id_unique IF EXISTS',
  'DROP INDEX doc_updated_at_index IF EXISTS',
  'DROP INDEX entity_salience_index IF EXISTS',
  'DROP INDEX chunk_text_index IF EXISTS',
  'DROP INDEX tag_slug_index IF EXISTS',
];
