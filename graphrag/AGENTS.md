# AGENTS.md · Router 版（GraphRAG 集成指挥台）

> 本文件是 **“交给 Codex/Context7 的入口与路由”**。  
> 快速了解背景与架构，请先阅读 `README.md` 的“GraphRAG 集成”章节（唯一事实源，SoT）；此处只描述如何驱动 Codex/Context7。  
> **不重复**项目背景与架构，相关说明以 `README.md` 为唯一事实源（SoT）。

## 0. 唯一事实源（SoT）与职责边界
- **`README.md`**：项目背景、目标、整体架构、运行方式与约束（端口/协议/插件等）。  
- **`AGENTS.md`（本文件）**：角色分工、执行顺序（Runbook）、可粘贴的**提示词入口**与**验收标准（WGL）**。  
- **`/codex/agents/`**（推荐）：按角色/任务拆分的提示词文件（T1…T8），便于在 Codex 会话中逐条引用。  
- **`docs/graph/`**：GraphRAG 产物（子图 mermaid、context 证据页等），不影响现有静态内容。

> SoT 原则：**README 解释“为什么与做什么”，AGENTS 负责“怎么驱动 Codex 干活”**。

---

## 1. 角色分工（最小集）
- **总控/架构**：收敛范围，产出“阶段计划 + 变更清单”，把控红线（不改端口/不新容器/连接参数显式常量）。  
- **图模型工程师**：唯一约束与索引（先建再写）、回滚 Cypher（限定标签范围）。  
- **入图流水线设计师**：Frontmatter → 图的文件树与幂等规则（不写代码）。  
- **检索与证据工程师**：≤2 跳子图、路径证据、Top-N 相关文档的输出规范。  
- **可视化集成工程师**：mermaid 产物与 `docs/graph/<topic>/` 集成模板。  
- **内容质量与安全工程师**：入图前最小必要校验与拒收规则。  
- **站点集成工程师**：最小改动接入，保证可逆。  
- **验收经理**：WGL 标准与手工执行清单。

---

## 2. 执行顺序（Runbook）
| 步骤 | 产物/完成标记 | 会话中断后如何恢复 |
| --- | --- | --- |
| 1 | 在 Codex/Context7 贴 **主控提示词**（仅要“计划与清单”，不写代码）；保存生成的阶段计划与清单 | 重新贴主控提示词，并附上一句“延续上一轮计划”，即可让模型基于既有结果续写 |
| 2 | 依序贴 **T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8** 子任务提示词（仍不写代码）；确认各角色输出齐全 | 记录已完成的任务编号；恢复时从下一个未完成的 T* 开始 |
| 3 | 人工审阅计划后，指示 Codex 依据清单生成实现稿（脚本/页面/配置），进入 PR 与 WGL 验收 | 重申最新确认版清单，再请求实现 |

> 红线复述：**复用现有 Neo4j**，统一 `bolt://localhost:7687`；连接参数用**显式常量**（禁止隐式 ENV）；新增产物仅在 `docs/graph/`；先建约束再入图，保证幂等与可回滚。

---

## 3. 主控提示词（先贴它）
> 输出“阶段计划 + 变更清单 + 风险与约束对照 + 验收标准 + 子任务目录”，**不要写代码或改文件**。

```
你是“GraphRAG 集成总控工程师”。只输出“计划与清单”，不要写代码或改文件。

【约束】
- 复用现有 Neo4j，统一使用 bolt://localhost:7687；Browser 用 http://localhost:7474。
- 连接参数显式常量（NEO4J_URI/USER/PASSWORD/DB），禁止隐式 ENV。
- 不改现有 VitePress 结构与 URL；GraphRAG 产物只放 docs/graph/。
- 先实现：≤2 跳子图、路径证据、Top-N（标签/分类 + 最近更新时间），并导出 mermaid 与 context.md。
- 幂等：必须先建唯一约束，再 MERGE 入图；清理限定在 Doc/Tag/Category/Entity 范围。

【请产出】
1) 三阶段实施计划（每阶段交付物）。
2) 变更清单（新增/修改文件路径与用途，草案即可）。
3) 风险与约束对照表（端口/协议/插件/重复写入等）。
4) WGL 验收标准（可用、可视、可回滚、可解释）。
5) 子任务提示词目录（T1…T8）与执行顺序。

输出 ≤ 2 页；列表 + 简表；不写代码。
```

---

## 4. 子任务提示词索引（复制即可用）
> 推荐把以下每段落各自保存为 `/codex/agents/T*.md`，本文件只保留索引。若尚未拆分，你也可以直接在会话里逐条粘贴。

- **T1｜图模型与约束（仅输出 Cypher 清单）**  
  `/codex/agents/T1-model-constraints.md`  
  产出：约束/索引/回滚 Cypher 列表，限定 Doc/Tag/Category/Entity 范围。推荐命令：`context7 prompt /codex/agents/T1-model-constraints`。

- **T2｜入图流水线设计（Frontmatter→图，不写代码）**  
  `/codex/agents/T2-ingest-design.md`  
  产出：解析→规范化→写入的文件树与步骤清单，附失败处理示例。推荐命令：`context7 prompt /codex/agents/T2-ingest-design`。

- **T3｜检索与证据设计（输出规范）**  
  `/codex/agents/T3-retrieval-evidence.md`  
  产出：≤2 跳子图/最短路径/Top-N JSON 契约 + mermaid 边模板 + `context.md` 骨架。推荐命令：`context7 prompt /codex/agents/T3-retrieval-evidence`。

- **T4｜可视化导出与站内集成**  
  `/codex/agents/T4-visualization.md`  
  产出：`tmp/*.mmd` → `docs/graph/<topic>/` 落盘流程与 `index.md` 模块化模板。推荐命令：`context7 prompt /codex/agents/T4-visualization`。

- **T5｜内容质量与安全闸门**  
  `/codex/agents/T5-quality-gate.md`  
  产出：前置校验与拒收规则列表（含日志格式/示例）。推荐命令：`context7 prompt /codex/agents/T5-quality-gate`。

- **T6｜站点集成最小改动**  
  `/codex/agents/T6-site-integration.md`  
  产出：站点改动最小路径与回滚步骤说明。推荐命令：`context7 prompt /codex/agents/T6-site-integration`。

- **T7｜回滚与不变式检查**  
  `/codex/agents/T7-rollback-invariants.md`  
  产出：图数据清理脚本范围、幂等验证 checklist。推荐命令：`context7 prompt /codex/agents/T7-rollback-invariants`。

- **T8｜验收手册（WGL）**  
  `/codex/agents/T8-acceptance.md`  
  产出：GUI 步骤 + 硬/软指标 Checklist 一页纸。推荐命令：`context7 prompt /codex/agents/T8-acceptance`。

> 若你暂未建立 `/codex/agents/` 目录，可先照此索引创建空文件并把对应提示词粘进去；命令示例：`mkdir -p codex/agents && touch codex/agents/T1-model-constraints.md`。

---

## 5. WGL（What Good Looks Like）
| 标准 | 满足条件 | 验证方法 |
| --- | --- | --- |
| 幂等 | 同一批文档重复入图不产生新节点/边，唯一约束始终生效 | 连续运行两次入图 CLI/脚本（执行清单内的 ingest 步骤），对比 Neo4j 节点/关系计数或 `MERGE` 日志无新增 |
| 一致 | 同一输入下查询结果稳定，证据路径可复现 | 使用 T3 产出的检索契约执行同一请求两次，确认返回的子图/路径/Top-N 结果一致 |
| 可视 | 至少 1 个主题子图 + 1 份 context 证据页在 `docs/graph/` 渲染可见 | `codex run build` 后在本地预览站点，检查 `docs/graph/<topic>/` 页面展示 mermaid 与 context 内容 |
| 可回滚 | 删除 `docs/graph/` 新增产物并执行限定范围清理，≤5 分钟恢复无 GraphRAG 状态 | 按 T7 checklist 删除新增文件并运行回滚 Cypher，随后访问站点确认无 GraphRAG 页面入口 |
| 可解释 | Top-N 推荐附“理由列”（标签共现/更新时间等），Mermaid 图与 context 描述一致 | 抽查生成的 `context.md` 与 mermaid 子图，核对理由列与图中关系是否一致 |

---

## 6. 连接常量（显式；禁止隐式 ENV）
```
NEO4J_URI = bolt://localhost:7687
NEO4J_USER = neo4j
NEO4J_PASSWORD = <手工填入>
NEO4J_DB = neo4j
```

建议将 `NEO4J_PASSWORD` 存放在本地 `.env.local` 或 Context7 的 `secret` 存储中，并在交付说明里注明轮换频率，避免将敏感信息写入代码仓库。

---

## 7. CLI 快速入口
- `npm run graphrag:constraints`：建立 Neo4j 唯一约束与索引。
- `npm run graphrag:ingest -- --locale zh --adapter transformers`：写入 Doc/Chunk/Entity 等节点；配合 `--changed-only` 可增量运行。
- `npm run graphrag:retrieve -- --mode <subgraph|path|topn> --input payload.json`：执行 GraphRAG 检索，payload 支持使用 `-` 从 stdin 读取。
- `npm run graphrag:retrieve -- --mode hybrid --input payload.json [--hybrid-alpha 0.7 0.3]`：语义 + 结构融合检索（默认读取 `gnn_pagerank` 等结构指标），`alpha` 控制语义/结构权重，详情见 `data/graphrag/vector-config.json` 与 `scripts/graphrag/vector-search.mjs`。
- `npm run graphrag:export -- --doc-id <doc-id> [--topic <slug>] [--title <标题>]`：生成 `docs/graph/<topic>/` 下的 mermaid 子图、`context.md`、`metadata.json`，并自动生成 `index.md` 主题页，可直接在 `/graph/<topic>/` 渲染，现包含结构化指标与 Top-K 实体摘要。
- `npm run graphrag:gnn -- --graph entity --algo pagerank --write-property gnn_pagerank`：运行 GDS PageRank 并写回结构得分；可重复执行不同算法（如 `labelPropagation`）以输出其他 `gnn_*` 属性供导出/检索使用。

---

## 8. 下一阶段增强规划
- **多跳检索**：扩展 `fetchSubgraph` 支持更高跳数（包含节点/边过滤、统计），确保输出可控。
- **结构信号深化**：将社区/Node2Vec 结果写回并补充在导出/检索中的展示，支持自定义结构特征与权重配置。
- **检索增强**：多条最短路径、类型过滤、路径解释信息等，提升 `path` 模式的可读性与可用性。
- **多模态 KG**：定义多模态节点 schema、附件元数据与向量索引，丰富图谱内容。
- **可视化交互**：为 GraphMermaid 增加 tooltip/点击跳转/过滤控件，在 `/graph` 页面展示图指标概览。
- **运维与测试**：新增混合检索 / GNN CLI 的回归测试与 smoke，用于跨环境验证；同步 README 与 WGL 指南，完善换机 checklist。

> 建议执行顺序：多跳 & 向量 → GNN → 多模态 → 前端交互 → 运维测试。

> 上述仅为**路由与执行纲要**。任何实现代码/脚本，必须来源于你确认过的“计划与清单”。

---

## 9. 最新交付记录（2025-XX）
- **结构化指标贯通**：`scripts/graphrag/export.mjs` / `metadata.json` 已输出 `structure.*` 字段，主题页模板展示综合得分、PageRank 统计与 Top-K 实体。
- **混合检索上线**：`npm run graphrag:retrieve -- --mode hybrid` 默认启用语义 + 结构双权重重排（需先运行 `graphrag:gnn` 写回 `gnn_pagerank` 等属性）。
- **GNN 管道可执行**：`npm run graphrag:gnn -- --graph entity --algo pagerank` 调用 GDS 投影与算法写回，支持 `labelPropagation` 等扩展；Node2Vec 仍保留 `stream`→写回逻辑。
- **环境迁移提示**：在新机器（含 Windows11 + WSL2）需先执行 `npm install`、`npm run graphrag:constraints`、`npm run graphrag:gnn -- --graph entity --algo pagerank`，再运行 hybrid 检索与导出，确保结构得分可用。
