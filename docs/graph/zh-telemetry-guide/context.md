# 观测指标导览

- 原始文档：`zh/content/telemetry-guide/index`
- 最近更新：2025-10-20T00:00:00.000Z
- 分类：管理与协作

## 子图概览

```mermaid
graph LR
  doc163["Doc｜观测指标导览"]
  cat0163______["Category｜管理与协作"]
  doc163 --> cat0163______
  tag0163_____["Tag｜运维看板"]
  doc163 --> tag0163_____
  tag1163_____["Tag｜指标治理"]
  doc163 --> tag1163_____
  tag2163___["Tag｜遥测"]
  doc163 --> tag2163___
  ent233["Concept｜遥测"]
  doc163 -- 频次 1 --> ent233
  ent234["Concept｜指标治理"]
  doc163 -- 频次 1 --> ent234
  ent235["Concept｜运维看板"]
  doc163 -- 频次 1 --> ent235
  class doc163 docNode;
  class cat0163______ categoryNode;
  class tag0163_____ tagNode;
  class tag1163_____ tagNode;
  class tag2163___ tagNode;
  class ent233 entityConcept;
  class ent234 entityConcept;
  class ent235 entityConcept;
  classDef docNode fill:#1f6feb,stroke:#0d419d,color:#ffffff,font-weight:600;
  classDef categoryNode fill:#0d1117,stroke:#30363d,color:#f0f6fc;
  classDef tagNode fill:#161b22,stroke:#30363d,color:#79c0ff;
  classDef entityNode fill:#1b4d3e,stroke:#2ea043,color:#ffffff;
  classDef entityPerson fill:#653c9d,stroke:#8957e5,color:#ffffff;
  classDef entityOrg fill:#1158c7,stroke:#1f6feb,color:#ffffff;
  classDef entityLocation fill:#7c4400,stroke:#b76100,color:#ffffff;
  classDef entityConcept fill:#445760,stroke:#6e7781,color:#ffffff;
  linkStyle 0 stroke-width:2px,stroke:#58a6ff;
  linkStyle 1 stroke-width:2px,stroke:#58a6ff;
  linkStyle 2 stroke-width:2px,stroke:#58a6ff;
```

## 结构化指标

- 综合结构得分：0.150
- 实体 PageRank 均值：0.150
- 实体 PageRank 峰值：0.150
- 社区分布：社区 233（1 个实体）；社区 234（1 个实体）；社区 235（1 个实体）
- PageRank 最高实体：遥测（0.150）、指标治理（0.150）、运维看板（0.150）

## 实体统计

| 实体 | 类型 | 频次 | 平均置信度 | 结构指标 |
| --- | --- | --- | --- | --- |
| 遥测 | Concept | 1 | 0.500 | PageRank 0.150 / 社区 233 |
| 指标治理 | Concept | 1 | 0.500 | PageRank 0.150 / 社区 234 |
| 运维看板 | Concept | 1 | 0.500 | PageRank 0.150 / 社区 235 |

## 推荐阅读

1. **AI 占位阶段总结与实践**（2025-10-20T00:00:00.000Z）
   - 分类匹配 管理与协作；最近更新：2025-10-20T00:00:00.000Z
2. **AI 管线占位与切换指南**（2025-10-20T00:00:00.000Z）
   - 分类匹配 管理与协作；最近更新：2025-10-20T00:00:00.000Z
3. **Ling Atlas 项目缘起与系统全貌**（2025-10-20T00:00:00.000Z）
   - 分类匹配 管理与协作；最近更新：2025-10-20T00:00:00.000Z
4. **写作到发布的完整流程**（2025-10-20T00:00:00.000Z）
   - 分类匹配 管理与协作；最近更新：2025-10-20T00:00:00.000Z
5. **Pagegen 运行手册**（2025-10-20T00:00:00.000Z）
   - 最近更新：2025-10-20T00:00:00.000Z
