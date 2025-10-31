# T1｜图模型与约束（仅输出 Cypher 清单）

## 1. 唯一约束（先建）
```cypher
// 文档节点：外部 ID（如相对路径）唯一
CREATE CONSTRAINT doc_id_unique IF NOT EXISTS
FOR (d:Doc)
REQUIRE d.id IS UNIQUE;

// 文档分块：确保 chunk id（文档 + 顺序）唯一
CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
FOR (c:Chunk)
REQUIRE c.id IS UNIQUE;

// 实体：按 type + name 唯一
CREATE CONSTRAINT entity_identity_unique IF NOT EXISTS
FOR (e:Entity)
REQUIRE (e.type, e.name) IS UNIQUE;

// 分类：分类名称唯一
CREATE CONSTRAINT category_name_unique IF NOT EXISTS
FOR (c:Category)
REQUIRE c.name IS UNIQUE;

// 标签：标签名称唯一
CREATE CONSTRAINT tag_name_unique IF NOT EXISTS
FOR (t:Tag)
REQUIRE t.name IS UNIQUE;

// 社区（可选）：社区 short id 唯一
CREATE CONSTRAINT community_id_unique IF NOT EXISTS
FOR (c:Community)
REQUIRE c.short_id IS UNIQUE;
```

## 2. 索引（补充查询效率）
```cypher
// 文档更新时间索引，支持 Top-N 更新排序
CREATE INDEX doc_updated_at_index IF NOT EXISTS
FOR (d:Doc)
ON (d.updated_at);

// 实体 salience/degree 查询
CREATE INDEX entity_salience_index IF NOT EXISTS
FOR (e:Entity)
ON (e.salience);

// Chunk 与实体的全文检索占位
CREATE TEXT INDEX chunk_text_index IF NOT EXISTS
FOR (c:Chunk)
ON EACH [c.text];

// Tag 归一化搜索
CREATE INDEX tag_slug_index IF NOT EXISTS
FOR (t:Tag)
ON (t.slug);
```

## 3. 关系声明参考（MERGE 之前）
```cypher
// Doc 与 Chunk
MERGE (d:Doc {id: $doc.id})
MERGE (c:Chunk {id: $chunk.id})
ON CREATE SET c.text = $chunk.text, c.order = $chunk.order
MERGE (c)-[:PART_OF]->(d);

// Doc 与 Category
MERGE (cat:Category {name: $category.name})
MERGE (d)-[:IN_CATEGORY]->(cat);

// Doc 与 Tag
MERGE (tag:Tag {name: $tag.name})
ON CREATE SET tag.slug = $tag.slug
MERGE (d)-[:HAS_TAG]->(tag);

// Chunk 与 Entity
MERGE (e:Entity {type: $entity.type, name: $entity.name})
ON CREATE SET e.description = $entity.description
MERGE (c)-[:MENTIONS {confidence: $mention.confidence}]->(e);

// Entity 之间的关系（共现/引用）
MERGE (src:Entity {type: $rel.source.type, name: $rel.source.name})
MERGE (dst:Entity {type: $rel.target.type, name: $rel.target.name})
MERGE (src)-[r:RELATED {relation: $rel.type}]->(dst)
ON CREATE SET r.weight = $rel.weight;

// Community 层级关系（如启用）
MERGE (comm:Community {short_id: $community.short_id})
SET comm.level = $community.level, comm.title = $community.title
WITH comm, $community.parent_short_id AS parent_id
CALL {
  WITH parent_id, comm
  WHERE parent_id IS NOT NULL
  MERGE (parent:Community {short_id: parent_id})
  MERGE (comm)-[:CHILD_OF]->(parent)
}
RETURN comm;
```

## 4. 回滚语句（限定标签范围）
```cypher
// 删除本项目新增的节点与关系（Doc/Chunk/Entity/Tag/Category/Community）
MATCH (n)
WHERE any(label IN labels(n) WHERE label IN ["Doc","Chunk","Entity","Tag","Category","Community"])
CALL {
  WITH n
  DETACH DELETE n
}
RETURN count(*) AS removed_nodes;

// 删除唯一约束与索引（按需执行）
DROP CONSTRAINT doc_id_unique IF EXISTS;
DROP CONSTRAINT chunk_id_unique IF EXISTS;
DROP CONSTRAINT entity_identity_unique IF EXISTS;
DROP CONSTRAINT category_name_unique IF EXISTS;
DROP CONSTRAINT tag_name_unique IF EXISTS;
DROP CONSTRAINT community_id_unique IF EXISTS;

DROP INDEX doc_updated_at_index IF EXISTS;
DROP INDEX entity_salience_index IF EXISTS;
DROP INDEX chunk_text_index IF EXISTS;
DROP INDEX tag_slug_index IF EXISTS;
```
