# TAXONOMY.md · Ling Atlas 分类与元数据规范 v1.0

> 本文是**人读版标准**：定义分类、标签、路径、Frontmatter 字段、URL 规则与变更流程。  
> 机读版对应：`schema/frontmatter.schema.json`、`schema/tag-alias.json`、`scripts/taxonomy.ts`。

---

## 1. 目标与范围
- 让**中文写作体验**与**英文路径/检索**兼容：写中文，出规范的英文 URL 与 Canonical 标签。
- 任何文章的元信息都能**被程序稳定解析**，驱动：导航/聚合页/RSS/检索/重写策略。
- **演进友好**：允许在可控流程内新增、重命名分类与标签。

---

## 2. 一级分类（中文 → 英文路径）
机读映射见 `scripts/taxonomy.ts`。人读表如下：

| 中文分类 | 英文路径 |
|---|---|
| 工程笔记 | `engineering` |
| 架构设计 | `architecture` |
| Web前端 | `frontend` |
| 后端 | `backend` |
| 数据工程 | `data-engineering` |
| 数据库 | `databases` |
| 信息检索 | `search` |
| RAG实战 | `rag` |
| AI研究 | `ai-research` |
| 大模型 | `llm` |
| 机器学习 | `ml` |
| 深度学习 | `dl` |
| 运维与自动化 | `devops` |
| 网络与安全 | `netsec` |
| 云与边缘 | `cloud-edge` |
| 管理与协作 | `management` |
| 职业攻略 | `career` |
| 读书笔记 | `reading-notes` |
| 生活随笔 | `life` |
| 公共治理观察 | `public-governance` |
| 行政信息化 | `gov-tech` |

> **新增/改名流程**：见第 9 节（需要同时改 `taxonomy.ts` 与 Schema 枚举，走 PR 审核）。

---

## 3. URL 与目录结构
- 每篇文章的物理位置固定：`docs/content/<slug-or-custom>/index.md`。  
- 页面访问路径（VitePress）默认：`/content/<slug-or-custom>/`（项目站点会自动加 `base` 前缀）。
- 可选美化为 `/blog/<YYYY>/<slug>/`：需在 PageGen 中生成对应路径并配置 rewrites。

> 生成器以文章目录名为 URL 片段；若存在 frontmatter 的 `slug`，优先使用 `slug`。

---

## 4. Slug 规则（中文转英文）
- 若未手写 `slug`：用 `scripts/slug.ts` 生成：**拼音（无声调） → 降噪 → 连字符**。
- 仅小写字母、数字、`-`；多空白折叠为单个 `-`；首尾去 `-`。  
- 示例：  
  - `向量检索入门` → `xiang-liang-jian-suo-ru-men`（建议人工改短：`vector-search-basics`）。  
  - `RAG 实战：切块策略` → `rag-shi-zhan-qie-kuai-ce-lue`（建议：`rag-chunking`）。

> **推荐做法**：写作时**手动指定**精炼 `slug`，避免过长拼音。

---

## 5. Frontmatter 字段规范（必读）
机读校验由 `schema/frontmatter.schema.json` + Ajv 完成（CI 阻断）。

**必填：**
- `title: string`（中文标题）
- `date: "YYYY-MM-DD"`（字符串；避免无引号被 YAML 解析成 Date）
- `category_zh: <上表之一>`

**可选：**
- `updated: "YYYY-MM-DD"`（不填则用 `date`）
- `status: draft | review | published`（`draft` 将被生成器忽略）
- `tags_zh: string[]`（中文标签，后续会 Canonical 化）
- `series: string`（连载中文名）
- `series_slug: string`（连载英文 id；未给则用 `series` 的 slug 化结果）
- `slug: string`（文章英文路径片段，见第 4 节）
- `cover: string`（可选封面 URL）
- `excerpt: string`（摘要；未填则取首段文本裁剪）

**示例：**
```yaml
---
title: RAG 实战：切块策略选型
date: "2025-10-12"
updated: "2025-10-13"
status: published
category_zh: RAG实战
tags_zh: [切块, 嵌入, 重排]
series: RAG 工程手记
series_slug: rag-notes
slug: rag-chunking
excerpt: 在工程环境中，切块策略直接决定召回与成本的上限，这篇文章总结了常见思路与权衡。
---
```

> **解析兼容**：校验脚本在验证前会把 `date/updated` 规范化为 `YYYY-MM-DD` 字符串。

---

## 6. 标签规范（Canonical）
- 人写中文：`tags_zh: [向量检索, 切块, 嵌入, 重排]`  
- 程序归一：`schema/tag-alias.json` 把常见中文/缩写映射到 Canonical 英文：  
  - 例：`向量检索 → vector-search`，`稀疏检索 → bm25`，`BGE → bge`，`K8s → kubernetes`。
- 目标：**检索、聚合和统计统一以英文 Canonical 为准**，但界面显示仍可用中文。

> 需要新增别名时：修改 `schema/tag-alias.json`，提交 PR。

---

## 7. 连载（Series）
- `series`: 中文名；`series_slug`: 英文 id。  
- PageGen 聚合依据 `series_slug`；若缺失，则用 `series` 的 slug 化值。
- 建议为长期连载手写 `series_slug`（如 `rag-notes`、`llm-systems`）。

---

## 8. 生成与聚合（PageGen）
- 忽略 `status: draft` 的文章。  
- 产物：`docs/_generated/` 下的分类/标签/连载/归档聚合页，`docs/public/` 下的 `rss.xml` 与 `sitemap.xml`。  
- 排序：优先 `updated`，否则 `date`，倒序。  
- 分页：默认每页 20（可按需扩展）。

---

## 9. 变更管理（分类/标签/路径）
**分类**（新增/改名）：
1) 修改 `scripts/taxonomy.ts` 与 `schema/frontmatter.schema.json` 的 `category_zh` 枚举；  
2) 提交 PR，触发 CI 校验；  
3) 合并后，必要时在 `rewrites.json` 写历史路径的 301 映射。

**标签 Canonical**（新增映射）：
1) 修改 `schema/tag-alias.json`；  
2) 运行 `npm run tags:normalize`；  
3) 提交 PR。

**文章迁移/更名（Rewrite）**：
- 在仓库根新增/维护 `rewrites.json`，格式：
```json
[
  { "from": "/content/old-slug/", "to": "/content/new-slug/" }
]
```
- 部署侧用 Pages/CF Workers 处理 301；在 `.vitepress/config.ts` 加 canonical link。

---

## 10. CI 与守门
- `npm run precheck`：Ajv 校验（**阻断**）；日期自动规范化；允许 `x-*` 元字段。  
- `npm run tags:normalize`：标签归一（非阻断）；建议作为 pre-commit hook。  
- `npm run gen && npm run build`：构建站点；Project Pages 需注入 `BASE=/ling-atlas/` 与 `SITE_ORIGIN`。

---

## 11. 命名风格速查
- **文件夹/slug**：`kebab-case`，短而稳，不含动词时态。  
- **英文 Canonical 标签**：`kebab-case`，领域约定优先（如 `pgvector`、`qdrant`）。  
- **长标题**：中文自由表达，避免把 slug 的职责转移给标题。

---

## 12. 版本策略
- 本文版本：`v1.0`（对应 Schema `x-schema-version: "1.0.0"`）。  
- 未来若升级：同时 bump Schema 版本并写入“迁移指南”。

---

### 附：常用中文标签 → Canonical 参考（节选）
```
向量检索 → vector-search
稠密检索 → dense-retrieval
稀疏检索 → bm25
混合检索 → hybrid-search
切块 → chunking
嵌入 → embeddings
重排 → rerank
交叉编码器 → cross-encoder
K8s → kubernetes
CF Workers → cloudflare-workers
GHA → github-actions
```
