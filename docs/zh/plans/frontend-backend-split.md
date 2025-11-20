---
title: 前后端拆分规划（草案）
---

## 目标

- 将生成/守门脚本与前端展示解耦，便于独立演进与回滚。
- 保持 Pagegen、AI、GraphRAG 产物的契约稳定，对前端只暴露数据/接口。

## 契约冻结点

- 数据产物：`docs/public/data/*.json`（telemetry / embeddings / summaries / qa / i18n-map / nav.manifest.*）、GraphRAG Explorer/Export JSON、`/api/knowledge.json`。
- 配置/Schema：`schema/locales.json`、`schema/nav.json`、frontmatter schema、telemetry `build.*` JSON 结构。
- 共享包：`packages/shared` 暴露 telemetry/guard 常量，后续会汇总 schema/types 供前后端共用。
- 环境变量：`BASE`、`SITE_ORIGIN`、Neo4j/AI 密钥、GraphRAG guard/env。

## 拆分路径（推荐）

1) **Mono 包内 packages**：frontend（VitePress+主题）、backend/ops（pagegen/ai/graphrag/scripts）、shared schema/types。后端产物（数据 JSON、telemetry）发布为 npm 包或构建工件，前端构建从包/URL 拉取。
2) **双仓（可选）**：后端仓 `ling-atlas-backend` 生成 artifact（Releases/S3/npm）；前端仓消费版本化 artifact。需约定版本/tag。

## 构建与 CI

- 后端流水线：`npm run gen` / AI / GraphRAG / checks → 产出 `dist/data/` 工件（含 telemetry、nav/i18n map、AI/GraphRAG JSON）。`GRAPHRAG_GUARD_*`、`AI_*` 阈值照常守门。
- 前端流水线：拉取 artifact → `npm run build`（可读取 BASE/SITE_ORIGIN）→ Pages/静态部署。保留回退环境变量以兼容旧路径。
- Shadow build：拆分初期保留单仓全链路构建，对比产物哈希，异常时回滚。

## 迁移步骤

1) 选定基线 tag（当前全绿+守门通过），冻结契约。
2) 抽取 schema/types 与数据接口描述（telemetry/build.*、nav/i18n manifest、GraphRAG explorer/export）。
3) 在 mono repo 内先划分 packages 并输出 artifact 目录（不改发布流程），前端改为读取本地 artifact。
4) CI 拆分为 backend job（产出工件）+ frontend job（消费工件）；验证 shadow build 与哈希对比。
5) （可选）将 backend 发布到外部存储/包管理，前端切换为远端 artifact；观察一到两轮发布后移除旧路径。

## 回滚策略

- 保留单仓构建脚本与 tag；拆分阶段遇到告警可切回基线 tag 或使用旧 artifact。
- Guard/阈值保持向后兼容，新增变量默认 warn，不直接 fail。

## 风险与缓解

- 契约漂移：在 schema/types 包上加测试和版本号，CI 对比 JSON 结构。
- 工件分发稳定性：优先使用 GitHub Releases/Actions artifacts，必要时镜像到 S3。
- 部署时序：确保前端构建失败时能回退到旧 artifact，Pages/静态资源支持缓存失效策略。
