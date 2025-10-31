# T3｜检索与证据设计（输出规范）

## 1. 子图检索（≤2 跳）
- **接口**：`POST /graphrag/subgraph`
- **入参 JSON**
```json
{
  "doc_id": "zh/guide/some-article",
  "entity_names": ["GraphRAG", "Neo4j"],
  "max_hops": 2,
  "limit": 30
}
```
- **出参 JSON**
```json
{
  "nodes": [
    {"id": "Doc:zh/guide/some-article", "label": "Doc", "title": "GraphRAG 入门", "updated_at": "2024-05-20T12:00:00Z"},
    {"id": "Entity:GraphRAG", "label": "Entity", "type": "Concept", "salience": 0.92}
  ],
  "edges": [
    {"source": "Entity:GraphRAG", "target": "Entity:Neo4j", "type": "RELATED", "weight": 0.73},
    {"source": "Doc:zh/guide/some-article", "target": "Entity:GraphRAG", "type": "MENTIONS"}
  ],
  "constraints": {
    "max_hops": 2,
    "limit": 30
  },
  "query": {
    "doc_id": "zh/guide/some-article",
    "entity_names": ["GraphRAG", "Neo4j"]
  }
}
```
- **Cypher 草案**
```cypher
MATCH (d:Doc {id: $doc_id})
OPTIONAL MATCH path = (d)-[*1..2]-(n)
WHERE
  ($entity_names IS NULL) OR
  (ANY(name IN $entity_names WHERE (n:Entity AND n.name = name)))
WITH collect(DISTINCT n) + d AS nodes, collect(DISTINCT relationships(path)) AS rels
UNWIND nodes AS node
WITH collect(DISTINCT node) AS all_nodes, rels
UNWIND rels AS rel_list
UNWIND rel_list AS rel
RETURN
  all_nodes[0..$limit] AS nodes,
  collect(DISTINCT {source: startNode(rel), target: endNode(rel), type: type(rel), weight: rel.weight})[0..$limit] AS edges;
```

## 2. 最短路径检索
- **接口**：`POST /graphrag/path`
- **入参 JSON**
```json
{
  "source_entity": "GraphRAG",
  "target_entity": "Neo4j",
  "max_length": 4
}
```
- **出参 JSON**
```json
{
  "path": [
    {"id": "Entity:GraphRAG", "label": "Entity", "type": "Concept"},
    {"id": "Entity:Knowledge Graph", "label": "Entity", "type": "Concept"},
    {"id": "Entity:Neo4j", "label": "Entity", "type": "Product"}
  ],
  "edges": [
    {"source": "Entity:GraphRAG", "target": "Entity:Knowledge Graph", "type": "RELATED", "weight": 0.81},
    {"source": "Entity:Knowledge Graph", "target": "Entity:Neo4j", "type": "RELATED", "weight": 0.77}
  ],
  "meta": {
    "length": 2,
    "max_length": 4
  }
}
```
- **Cypher 草案**
```cypher
MATCH (src:Entity {name: $source_entity})
MATCH (dst:Entity {name: $target_entity})
CALL algo.shortestPath.stream(src, dst, null, {maxPathLength: $max_length})
YIELD nodeId, cost
RETURN
  collect(gds.util.asNode(nodeId)) AS path_nodes,
  cost AS path_cost;
```
> 若使用 Neo4j GDS 不可行，可退回 `MATCH p=shortestPath((src)-[:RELATED*..$max_length]->(dst)) RETURN p`.

## 3. Top-N 相关文档
- **接口**：`POST /graphrag/topn`
- **入参 JSON**
```json
{
  "entity_names": ["GraphRAG", "Neo4j"],
  "category": "guide",
  "language": "zh",
  "limit": 5
}
```
- **排序规则**
1. 近期优先：`Doc.updated_at` 降序。
2. 关联度：实体 salience/关系权重求和。
3. 分类一致性：匹配 category 的加权加分。

- **出参 JSON**
```json
{
  "items": [
    {
      "doc_id": "zh/guide/some-article",
      "title": "GraphRAG 入门",
      "updated_at": "2024-05-20T12:00:00Z",
      "score": 0.87,
      "reasons": [
        "包含实体 GraphRAG（salience 0.92）",
        "最近更新：2024-05-20",
        "分类匹配 guide"
      ]
    }
  ],
  "query": {
    "entity_names": ["GraphRAG", "Neo4j"],
    "category": "guide",
    "language": "zh"
  }
}
```
- **Cypher 草案**
```cypher
MATCH (d:Doc)-[:HAS_TAG]->(tag:Tag)
OPTIONAL MATCH (d)-[:IN_CATEGORY]->(cat:Category)
OPTIONAL MATCH (d)<-[:PART_OF]-(c:Chunk)-[:MENTIONS]->(e:Entity)
WHERE ($language IS NULL OR d.lang = $language)
  AND ($category IS NULL OR cat.name = $category)
  AND ($entity_names IS NULL OR e.name IN $entity_names)
WITH d,
     collect(DISTINCT e) AS matched_entities,
     collect(DISTINCT cat.name) AS categories,
     sum(coalesce(e.salience, 0)) AS salience_score
WITH d,
     salience_score +
     CASE WHEN $category IS NOT NULL AND $category IN categories THEN 0.1 ELSE 0 END +
     apoc.date.parse(d.updated_at, 'ms', 'yyyy-MM-dd''T''HH:mm:ssxxx') / 8.64e10 AS score,
     matched_entities
ORDER BY score DESC
LIMIT $limit
RETURN d.id AS doc_id,
       d.title AS title,
       d.updated_at AS updated_at,
       score,
       [e IN matched_entities | '包含实体 ' + e.name + '（salience ' + toString(e.salience) + '）'] +
       CASE WHEN $category IS NOT NULL THEN ['分类匹配 ' + $category] ELSE [] END +
       ['最近更新：' + d.updated_at] AS reasons;
```

## 4. mermaid 导出模板
```mermaid
graph LR
  %% Doc 与 Chunk
  doc_zh_guide_some_article[\"Doc｜GraphRAG 入门\"] --> chunk_1[\"Chunk#1\"]
  chunk_1 --> entity_graphrag[\"Entity｜GraphRAG\"]
  chunk_1 --> entity_neo4j[\"Entity｜Neo4j\"]

  %% 实体关系
  entity_graphrag -. RELATED (0.73) .-> entity_neo4j

  %% 分类与标签
  doc_zh_guide_some_article --> category_guide[\"Category｜guide\"]
  doc_zh_guide_some_article --> tag_graphrag[\"Tag｜graphrag\"]
```

## 5. `context.md` 模板
```
# 问题背景
- 查询实体：{{ entity_names | join(", ") }}
- 关联文档：{{ doc_titles | join("、") }}
- 时间范围：{{ time_range }}

# 重点子图
```mermaid
{{ mermaid_graph }}
```

# 证据路径
{% for edge in edges %}
- {{ edge.source }} --{{ edge.type }} ({{ edge.weight }})--> {{ edge.target }}
{% endfor %}

# 推荐文档（Top {{ limit }})
{% for item in top_docs %}
1. **{{ item.title }}**（{{ item.updated_at }}）  
   {{ item.reasons | join("；") }}
{% endfor %}
```

## 6. 元数据记录
- 请求与结果写入 `data/graphrag/retrieval-log.jsonl`。
- 字段：`timestamp`、`query`、`result_count`、`latency_ms`、`cache_hit`。

> 以上为输出契约与格式，后续实现需严格遵循，便于前端与可视化复用。
