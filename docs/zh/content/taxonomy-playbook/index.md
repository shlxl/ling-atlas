---
title: Ling Atlas 分类与元数据实战手册
date: '2025-01-18'
updated: '2025-01-18'
status: published
category_zh: 管理与协作
tags_zh:
  - 内容治理
  - 分类体系
  - automation
slug: taxonomy-playbook
excerpt: 按照 TAXONOMY.md 给出的规范，落地一套可执行的分类与元数据流程，帮助内容团队把写作与自动化部署串起来。
---

## 为什么要先写好 Taxonomy

Ling Atlas 的内容交付流程高度自动化，任何一篇文章都会在几分钟内被脚本抓取、聚合、部署。如果前期不把分类、元数据说清楚，后面就会面临三类问题：

- **导航失焦**：同一主题出现在多个分类与标签下，聚合页与面包屑无法给读者稳定的路径。
- **检索失真**：Pagefind 与未来的语义检索依赖 Canonical 标签，别名未统一时会导致权重下降。
- **历史难追**：连载、重写、重定向都建立在元字段上，缺口越多，后续维护成本越高。

所以，TAXONOMY.md 并不是参考资料，而是写作前必须读完、照做的执行手册。

## 三步走：让规范落地而不是挂墙

### 1. 在写作之前就确定分类与 slug

- 先在 TAXONOMY.md 的表格里确认中文分类及对应英文路径，避免随手新增目录。
- 决定 slug 时不依赖自动拼音，直接手写一个短而稳的英文词组，例如 `rag-chunking`。
- 如果需要连载，提前规划 `series` 与 `series_slug`，保持每篇文章沿用同一对字段。

这一阶段最常见的错误是等写完再想分类，结果导致 Frontmatter 里填的分类与目录结构不一致。建议在 Archiect 阶段就把文章的路径写入任务卡上。

### 2. 用 Frontmatter 填满“机读字段”

Frontmatter 至少要满足以下字段：

```yaml
title: RAG 实战：切块策略选型
date: "2025-10-12"
category_zh: RAG实战
```

除此之外，务必习惯性地补齐 `status`、`tags_zh`、`excerpt`，并在需要的时候声明 `series` 与 `updated`。  
`codex run precheck` 会使用 Ajv 校验 Schema，如果字段缺失或格式不对，CI 会直接 fail，避免坏数据进入仓库。

### 3. 发布前跑完“归一化 + 生成”

遵循以下顺序可以在本地和 CI 上得到一致的产物：

1. `codex run precheck`：规范化日期，阻断不合法的 Frontmatter。
2. `npm run tags:normalize`：让中文标签映射到 Canonical 英文，保证聚合页与统计的一致性。
3. `codex run gen`：根据分类、标签、连载信息生成聚合页、RSS、Sitemap。
4. `codex run publish`：整合校验、生成、构建与推送，形成可追溯的提交记录。

只有这样，PageGen 才能在 `docs/<locale>/_generated` 下产出最新的分类、标签与归档页面。

## 规范使用中的常见坑

- **分类改名未走流程**：修改分类需要同时更新 `schema/frontmatter.schema.json` 与 `scripts/taxonomy.ts`，否则 Ajv 会报错；上线后记得配置 `rewrites.json` 做 301。
- **标签别名遗漏**：如果发现聚合页里出现两个语义相同的标签（如“向量检索”和“向量搜索”），要及时在 `schema/tag-alias.json` 中加映射，再跑一次 `tags:normalize`。
- **草稿泄漏**：忘记设置 `status: draft` 会让未完成的文章被 PageGen 抓进 RSS，破坏发布节奏。
- **连载 slug 不一致**：一个连载如果用了多个 `series_slug`，聚合页会拆成两块，记得在首次创建时就定好英文 id。

## 搜集反馈并迭代

规范不是一成不变的，以下几类信号意味着要考虑更新 TAXONOMY：

- 内容增长到一定规模，现有分类难以覆盖新主题。
- 标签聚合页长期呈现“大杂烩”现象，需要拆分或重命名。
- SEO 与导航数据提示用户找不到想要的内容，应重新规划 URL 与 rewrites。

当需要调整时，通过 PR 修改 TAXONOMY.md 与对应 Schema，触发 CI 重新校验，再使用 `codex run publish` 更新站点。  

善用这套流程，就能让 Ling Atlas 的内容结构稳定演化：作者专注写作，Agent 负责把每一次规范化操作变成自动化的结果。
