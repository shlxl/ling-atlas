---
title: 前后端分离后的技术栈重构计划（去静态化版本）
---

> 目标：在保留现有 Pagegen / AI / GraphRAG 成果的同时，摆脱以静态页面（VitePress + Vue）为中心的技术栈束缚，构建“数据驱动 + 可插拔前端”的演进式架构，支持 API 化交付、动态体验与多端复用。

## 进度更新（2025-XX-XX）

- ✅ 已完成：在 `@ling-atlas/shared` 定义数据 manifest 契约与 `validateManifest` / `getDataPath` helper，默认对齐 `packages/backend/dist/data`；backend README 已声明产物路径与契约。
- ✅ 新增 `npm run backend:manifest`：将 nav/i18n/telemetry/pagegen/graphrag/AI 产物拷贝到 `packages/backend/dist/data/`，生成 `manifest.json` + `checksums.txt`（复用 shared 契约）。
- ✅ `npm run build` 已串联 `backend:manifest`，本地/CI 构建默认产出 dist/data + manifest；新增 workspace 入口 `npm run backend:gen -w packages/backend`。
- ✅ Pagegen nav/i18n/metrics 与 Telemetry merge 已在生成阶段同步写入 `packages/backend/dist/data`（统一用 `getDataPath`），减少二次拷贝。
- ✅ AI 占位/摘要/QA 产物写入 `docs/public/data` 时同步落盘 dist/data；GraphRAG 遥测写入后同步 dist/data。
- ✅ API 查询增强：search endpoint 支持标题优先、位置加权的多词匹配与高亮，graph doc 返回的 mermaid subgraph 解析为节点/边/标签/class 的结构化 JSON；Next Demo 页面已展示 Graph block（节点/边统计与示例）。
- ⏳ 待完成：根级生成阶段写入 manifest/checksums 并上载 artifact，AI/GraphRAG 其他产出（如导出包）在生成时直接输出到 dist/data，CI 对接校验。

## 背景与新诉求

- 当前代码仍以 VitePress 静态站点为核心，Pagegen/GraphRAG/AI 产物直接落到 `docs/_generated`，前端主题组件读取本地 JSON，未体现前后端分离后的 API/工件契约。
- 新架构需要支持：
  1) **数据即服务**：Pagegen/GraphRAG/AI 产物以 API/对象存储形式暴露，方便前端（Web/桌面/移动/CLI）统一消费；
  2) **可替换前端**：允许 VitePress 继续存在，但不再是唯一入口，可并行演进到 SSR（Next/Nuxt/SolidStart 等）或纯 SPA（Vite + Vue/React/Svelte）实现；
  3) **运行时体验**：导航/i18n/搜索/Telemetry/GraphRAG 等数据可增量更新，无需全量重建站点；
  4) **CI/CD 协同**：数据生成、API 发布、前端部署分层，支持缓存与版本回滚。

## 架构总览（去静态化）

1) **Shared 契约层**：集中定义 schema/type、数据 manifest、路径 helper、版本兼容策略，供 backend 产出与 frontend/BFF 消费。
2) **Backend 数据生产层**：Pagegen/GraphRAG/AI 脚本模块化为可调用的服务/任务，产出写入 `dist/data` + manifest，并可通过 BFF/对象存储/edge KV 暴露。
3) **BFF / API 网关层**：新增 `packages/api`（或扩展 backend）提供 REST/GraphQL/OGC 风格接口，支持增量同步（ETag/If-None-Match）与签名校验。
4) **多前端层**：
   - VitePress 作为“文档静态版”消费者，仅通过数据访问层读取 API/对象存储产物；
   - 新增 SSR/SPA 示例（如 `packages/frontend-app`），复用 shared 契约与数据访问层，支持懒加载/实时刷新；
   - CLI/工具链可直接调用 API/manifest，实现 headless 消费。
5) **运维/观测层**：构建/部署/回滚流程、指标与告警统一在 manifest 与 telemetry 输出中体现，CI 产物签名与缓存复用。

## 分阶段实施计划

### 阶段 0：基础对齐（最快 1 周）

- ✅ 在 `packages/shared/src/contracts` 增加 manifest 定义与 `validateManifest`；提供 `getDataPath(locale, kind)`（默认指向 `packages/backend/dist/data`）。
- ✅ 新增 `npm run backend:manifest`：当前从现有产物生成 `packages/backend/dist/data` + manifest/checksums，涵盖 nav/i18n/telemetry/pagegen/graphrag/AI。
- ✅ `npm run build` 串联 `backend:manifest`，确保构建结束时默认写出 dist/data + manifest/checksums；提供 workspace 入口 `npm run backend:gen -w packages/backend`。
- ✅ Pagegen 已在 nav manifest/i18n map/metrics 输出阶段同步写入 dist/data（getDataPath）；Telemetry merge 写出 dist/public/dist-data 三路。
- ✅ AI （embeddings/summaries/qa）生成时同步写出 dist/data；GraphRAG metrics 写出后同步 dist/data。
- ✅ CI backend job 改用 `npm run backend:manifest` 生成 dist/data + manifest，并新增 `shared:lint` 守门。
- ✅ 前端数据访问层雏形：新增 `packages/frontend/src/data/fetchData.mjs`，按 kind/locale 统一从 dist/data/API 读取，预留 fallback。
- ✅ GraphRAG metrics 与 docs/graph 导出产物纳入 dist/data 与 manifest，format 扩展支持 md/mmd；CI 下载 artifact 后校验 manifest/checksums。
- ✅ i18n 文案与 search 产物（embeddings-texts/pagefind）纳入 dist/data 与 manifest，VitePress 构建优先读取 dist/data；EN nav 无内容时回退首选语言。
- ✅ API skeleton：新增 `packages/api`，提供 `/api/nav/:locale`、`/api/i18n-map`、`/api/i18n`、`/api/telemetry`、`/api/manifest`，默认读取 `packages/backend/dist/data`。
- ✅ API 查询增补：`/api/search`（含 `?q=` 简易检索）、`/api/search/pagefind`、`/api/graph`/`/api/graph/topn`，资产路径基于 manifest 动态解析，ETag/If-None-Match 支持。
- ⏳ 约定统一路径/命名：`dist/data/{nav,i18n,telemetry,graphrag,search}/`，生成阶段直接写出并复用 helper（AI/GraphRAG 其他产物接线中，前端访问层接入/Next 示例待做）。
  - 持续任务：API 补充 ETag/版本切换、搜索/GraphRAG 查询接口；前端（VitePress/Next）改用 `/api` base。

### 阶段 1：Backend 服务化与 API 发布（2–3 周）

- ✅ API/BFF 雏形完成：`packages/api` 提供 nav/i18n/telemetry/manifest/search/pagefind/graph 资产读取，支持 ETag/If-None-Match，search 端支持 `q`+分页，graph doc 返回结构化 subgraph。
- ✅ 前端默认走 `/api` 数据源（head 注入 DATA_BASE），localeMap/apiClient/fetchData 先读 API 再回退静态。
- ✅ CI 已增加 API 冒烟（启动 skeleton + api-smoke），backend job 产物校验（checksums/manifest:check）完备。
- ✅ 后续增强：搜索再排序/高亮、GraphRAG subgraph 结构化解析与 doc 聚合补全。
- ⏳ 可选：manifest 版本切换与前端回滚策略（版本 pin/回退 UI 仍待设计）。
- ✔ 当前状态：阶段 1 主干完成，可将剩余增强（graph 查询过滤/分页、manifest 版本回滚 UI）列入阶段 2 backlog。

### 阶段 2：前端可插拔化（2–4 周）

- ✅ 数据访问层雏形：`packages/frontend/src/data/fetchData.mjs` + VitePress 主题默认走 `/api` 数据源，API 状态卡组件可用。
- ✅ VitePress 页面接入 API：metrics 页面引入 `ApiStatus` 组件展示 API readiness；主题注册 ApiStatus。
- ⏳ VitePress 其他页面（nav/search 等）切换 API 渲染并做冒烟（保留 `_generated` 回退）。
- ✅ SSR/SPA 示例 scaffold：`packages/frontend-app` 初始化 Next.js App Router 占位页，消费 `/api` 的 nav/i18n/telemetry/graph/search`。
- ✅ Next 页面已拉取 nav/i18n/telemetry/manifest 并展示 nav 类目列表（API base 默认 `http://127.0.0.1:8787/api`，可用 `API_BASE` 覆写）。
- ✅ Next Demo 增补 Graph block：读取 `/api/graph/doc` 的结构化 subgraph，展示节点/边统计与示例条目（可通过 `GRAPH_DOC` 切换）。
- ⏳ 多前端一致性校验：新增 e2e/快照，确保 VitePress 与 Next 读取同一数据源时 nav/i18n/telemetry 等一致。

### 阶段 3：观测、回滚与性能治理（2–3 周）

- 在 backend 结束时写出告警快照与 hash 校验，CI 上传 `manifest.json` + `checksums.txt`，前端/BFF 加载前校验哈希并提供降级 UI。
- 为 API 层接入 Telemetry/metrics（如 RPS、p95、命中率、回源失败），与现有站点 Telemetry 合流显示。
- 增加 e2e 流水线：`backend:gen → api mock → frontend(VitePress + SSR) consume → 校验导航/搜索/GraphRAG/i18n/Telemetry 一致性`。

- 建立性能与成本预算：
  - 后端任务时间/内存/LLM 调用预算，超限告警；
  - API 响应体积/延迟预算；
  - 前端 bundle/TTI 预算（对新 SSR/SPA 提供 PWA 体检）。

## 关键决策与替代方案

- **前端框架选择**：保持 VitePress 作为文档出口，同时评估 Next/Nuxt/SolidStart；若需最小改动，可用 Vite + Vue/React SPA 作为过渡。
- **数据分发模式**：优先对象存储 + CDN（静态 JSON），同时提供 API 聚合（BFF）与 SSE/轮询增量路径；对敏感数据启用签名/鉴权。
- **缓存与一致性**：manifest 携带哈希与版本；API 返回 ETag，前端访问层负责缓存淘汰与回退；GraphRAG/AI 大产物可分区分片下载。
- **回退策略**：在 CI 上传上一版本 manifest 与产物；前端加载失败时回落到上一个可用版本并展示告警，BFF 支持手动切换版本。

## 成功验收标准

- 有一套清晰的 shared 契约（schema + manifest），前/后端与 API/BFF 全部通过契约访问数据。
- 后端生成流程可独立运行并发布工件，CI 可只重跑后端或前端任一阶段。
- 至少两个前端（VitePress + SSR/SPA 示例）可读取同一数据源并通过 e2e 校验一致性。
- Manifest 校验、哈希验证与降级路径在 CI 与运行时均可触发，并提供可观测的告警/指标。
