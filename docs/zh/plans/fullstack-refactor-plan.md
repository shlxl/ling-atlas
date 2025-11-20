---
title: 前后端分离后的技术栈重构计划（去静态化版本）
---

> 目标：在保留现有 Pagegen / AI / GraphRAG 成果的同时，摆脱以静态页面（VitePress + Vue）为中心的技术栈束缚，构建“数据驱动 + 可插拔前端”的演进式架构，支持 API 化交付、动态体验与多端复用。

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
- 在 `packages/shared/src/contracts` 增加 manifest 定义：数据版本、生成时间、依赖 commit、产物清单（nav/i18n/Telemetry/GraphRAG/搜索）、签名哈希，提供 `validateManifest`。 
- 约定统一路径/命名：`dist/data/{nav,i18n,telemetry,graphrag,search}/`，并提供 `getDataPath(locale, kind)` helper。 
- 在根级 npm scripts 引入 workspace 调用：`npm run backend:gen -w packages/backend`、`npm run shared:lint -w packages/shared`，保留旧命令作为回退但标记为 deprecated。

### 阶段 1：Backend 服务化与 API 发布（2–3 周）
- 将 Pagegen/GraphRAG/AI 入口迁移到 `packages/backend/src`，拆分为“任务”模块，可通过 CLI/HTTP/BullMQ 触发；输出 manifest + 产物摘要。 
- 新建 `packages/api`（或 backend 子目录）实现：
  - **静态文件分发**：读取 `dist/data`，支持 `ETag`/`Last-Modified`、范围读取与 gzip/br。 
  - **动态聚合接口**：如 `/nav/:locale`、`/search?q=`、`/graph/entities?id=`，添加速率限制与权限/签名开关。 
  - **回滚与版本选择**：根据 manifest version/commit 切换读取目录或对象存储前缀。 
- 在 CI 中新增 job：`backend:gen → api:publish(上传对象存储/edge KV) → 产物签名/缓存`，输出 artifact 与 manifest 校验报告。

### 阶段 2：前端可插拔化（2–4 周）
- 在 `packages/frontend` 提供“数据访问层”：封装 `fetchData(kind, locale, source)`，优先读取 API/对象存储，其次回退本地静态产物；支持 SSE/轮询接收增量更新。 
- 对 VitePress 主题进行最小改造：移除直接访问 `docs/_generated` 的路径，全部改用访问层 + shared 契约校验；增量数据可在客户端替换状态而非重建。 
- 新建 SSR/SPA 示例包（如 `packages/frontend-app`）：
  - 选择 Next/Nuxt/SolidStart 任一方案，展示导航/搜索/GraphRAG 视图与 Telemetry 面板；
  - 通过 env/BASE 注入 API 入口与 manifest 版本，验证“同一数据，多前端消费”。 
- 为 CLI/批处理消费者提供 `packages/shared` 内的 Node API（如 `loadTelemetry(manifest)`），支持脚本化使用。

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
